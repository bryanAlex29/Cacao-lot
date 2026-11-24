import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type { DataSource, PredictionAvailability } from '@cacaosmart/contracts';

export function checkedPrediction(
  value: PredictionAvailability,
  plotId: string,
  deviceId: string,
  source: DataSource,
): PredictionAvailability {
  const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const count = (v: number) => Number.isSafeInteger(v) && v >= 0;
  if (
    !value ||
    value.schemaVersion !== '1.0' ||
    value.plotId !== plotId ||
    value.source !== source ||
    value.device?.id !== deviceId ||
    typeof value.device.serial !== 'string' ||
    typeof value.device.isActive !== 'boolean' ||
    value.status !== 'unavailable' ||
    value.reason !== 'model_not_implemented' ||
    value.model !== null ||
    value.waterDemand !== null ||
    !Array.isArray(value.predictions) ||
    value.predictions.length !== 0 ||
    value.target?.variable !== 'soil_moisture' ||
    value.target.unit !== '%' ||
    value.target.horizonDays !== 1 ||
    !date(value.evaluatedAt) ||
    !date(value.window?.from) ||
    !date(value.window.toExclusive) ||
    value.window.timezone !== 'UTC' ||
    value.window.completeDays !== 30 ||
    Date.parse(value.window.toExclusive) - Date.parse(value.window.from) !== 30 * 86400000 ||
    Date.parse(value.window.toExclusive) % 86400000 !== 0 ||
    Date.parse(value.window.toExclusive) > Date.parse(value.evaluatedAt) ||
    !Array.isArray(value.zones) ||
    value.zones.length !== 3
  )
    throw new Error('Disponibilidad de predicción incompatible');
  const codes = ['soil_1', 'soil_2', 'soil_3'];
  for (const [index, zone] of value.zones.entries()) {
    if (
      !zone ||
      zone.code !== codes[index] ||
      (zone.sensorId !== null && (typeof zone.sensorId !== 'string' || !zone.sensorId)) ||
      typeof zone.enabled !== 'boolean' ||
      !count(zone.samples) ||
      !count(zone.validSamples) ||
      !count(zone.validDaysUtc) ||
      zone.validSamples > zone.samples ||
      zone.validDaysUtc > 30 ||
      zone.validDaysUtc > zone.validSamples ||
      (zone.sensorId === null && (zone.enabled || zone.samples !== 0)) ||
      (zone.validSamples === 0
        ? zone.firstValidAt !== null || zone.lastValidAt !== null || zone.validDaysUtc !== 0
        : !date(zone.firstValidAt) ||
          !date(zone.lastValidAt) ||
          zone.validDaysUtc < 1 ||
          Date.parse(zone.firstValidAt) < Date.parse(value.window.from) ||
          Date.parse(zone.lastValidAt) >= Date.parse(value.window.toExclusive) ||
          Date.parse(zone.firstValidAt) > Date.parse(zone.lastValidAt))
    )
      throw new Error('Cobertura por zona incompatible');
  }
  return value;
}

@Injectable({ providedIn: 'root' })
export class PredictionApi {
  private readonly http = inject(HttpClient);
  get(plotId: string, deviceId: string, source: DataSource) {
    return this.http
      .get<PredictionAvailability>(`/api/v1/plots/${encodeURIComponent(plotId)}/predictions`, {
        params: { deviceId, source, horizonDays: 1 },
      })
      .pipe(
        timeout(10000),
        map((value) => checkedPrediction(value, plotId, deviceId, source)),
      );
  }
}
