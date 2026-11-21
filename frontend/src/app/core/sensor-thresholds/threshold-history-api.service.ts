import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type {
  SensorThresholdHistoryResponse,
  SoilSensorId,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import type { ThresholdSensor } from './sensor-thresholds.types';

/** Check identity and complete coverage before any historical line can be drawn. */
export function checkedThresholdHistory(
  response: SensorThresholdHistoryResponse,
  selection: TelemetrySubscription,
  sensor: ThresholdSensor,
  from: string,
  to: string,
): SensorThresholdHistoryResponse {
  const invalid = () => {
    throw new Error('Historial de rangos incompatible o incompleto');
  };
  if (
    !response ||
    response.sensorId !== sensor.id ||
    response.deviceId !== selection.deviceId ||
    response.plotId !== selection.plotId ||
    response.source !== selection.source ||
    response.variable !== 'SOIL_MOISTURE' ||
    response.unit !== 'PERCENT' ||
    response.from !== from ||
    response.to !== to ||
    !Array.isArray(response.intervals) ||
    !response.intervals.length ||
    response.intervals.length > 1001
  )
    invalid();
  let cursor = Date.parse(from);
  let version = 0;
  let configured = false;
  for (const interval of response.intervals) {
    if (
      !interval ||
      Date.parse(interval.from) !== cursor ||
      !Number.isFinite(Date.parse(interval.to)) ||
      Date.parse(interval.to) <= cursor ||
      Date.parse(interval.to) > Date.parse(to)
    )
      invalid();
    const range = interval.threshold;
    if (range !== null) {
      if (
        !range ||
        !Number.isFinite(range.minValue) ||
        !Number.isFinite(range.maxValue) ||
        range.minValue < 0 ||
        range.maxValue > 100 ||
        range.minValue >= range.maxValue ||
        !Number.isInteger(range.version) ||
        range.version <= version ||
        !Number.isFinite(Date.parse(range.effectiveAt)) ||
        Date.parse(range.effectiveAt) > cursor
      )
        invalid();
      version = range.version;
      configured = true;
    } else if (configured) invalid(); // No deletion endpoint exists; unexplained gaps are not absence.
    cursor = Date.parse(interval.to);
  }
  if (cursor !== Date.parse(to)) invalid();
  return response;
}

@Injectable({ providedIn: 'root' })
export class ThresholdHistoryApi {
  private readonly http = inject(HttpClient);
  get(
    selection: TelemetrySubscription,
    sensor: ThresholdSensor & { code: SoilSensorId },
    from: string,
    to: string,
  ) {
    return this.http
      .get<SensorThresholdHistoryResponse>(
        `/api/v1/sensors/${encodeURIComponent(sensor.id)}/thresholds/history`,
        { params: { from, to } },
      )
      .pipe(
        timeout(8000),
        map((response) => checkedThresholdHistory(response, selection, sensor, from, to)),
      );
  }
}
