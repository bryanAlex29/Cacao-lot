import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type {
  PutSensorThresholdInput,
  SensorThresholdResponse,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import {
  quantitativeSensors,
  QuantitativeSensorCode,
  ThresholdSensor,
} from './sensor-thresholds.types';

@Injectable({ providedIn: 'root' })
export class SensorThresholdsApi {
  private readonly http = inject(HttpClient);

  get(selection: TelemetrySubscription, sensor: ThresholdSensor, code: QuantitativeSensorCode) {
    return this.http
      .get<SensorThresholdResponse>(`/api/v1/sensors/${encodeURIComponent(sensor.id)}/thresholds`)
      .pipe(
        timeout(8000),
        map((response) => this.checked(response, selection, sensor, code)),
      );
  }

  put(
    selection: TelemetrySubscription,
    sensor: ThresholdSensor,
    code: QuantitativeSensorCode,
    input: PutSensorThresholdInput,
  ) {
    // Never retry a write automatically: a timeout may happen after the server committed.
    return this.http
      .put<SensorThresholdResponse>(
        `/api/v1/sensors/${encodeURIComponent(sensor.id)}/thresholds`,
        input,
      )
      .pipe(
        timeout(8000),
        map((response) => {
          const result = this.checked(response, selection, sensor, code);
          if (
            !result.threshold ||
            result.threshold.minValue !== input.minValue ||
            result.threshold.maxValue !== input.maxValue ||
            (result.threshold.version !== input.expectedVersion &&
              result.threshold.version !== input.expectedVersion + 1)
          )
            throw new Error('Guardado sin rango confirmado');
          return result;
        }),
      );
  }

  private checked(
    response: SensorThresholdResponse,
    selection: TelemetrySubscription,
    sensor: ThresholdSensor,
    code: QuantitativeSensorCode,
  ) {
    const expected = quantitativeSensors[code];
    if (
      !response ||
      response.sensorId !== sensor.id ||
      response.deviceId !== selection.deviceId ||
      response.plotId !== selection.plotId ||
      response.source !== selection.source ||
      response.variable !== expected.variable ||
      response.unit !== expected.unit
    )
      throw new Error('El rango no corresponde al sensor y origen seleccionados');
    const range = response.threshold;
    if (
      range !== null &&
      (!range ||
        !Number.isFinite(range.minValue) ||
        !Number.isFinite(range.maxValue) ||
        range.minValue < (expected.unit === 'PERCENT' ? 0 : -50) ||
        range.maxValue > 100 ||
        range.minValue >= range.maxValue ||
        !Number.isInteger(range.version) ||
        range.version < 1 ||
        !Number.isFinite(Date.parse(range.effectiveAt)) ||
        typeof range.id !== 'string' ||
        typeof range.updatedBy !== 'string' ||
        range.hysteresis !== 0)
    )
      throw new Error('Respuesta de rango inválida');
    return response;
  }
}
