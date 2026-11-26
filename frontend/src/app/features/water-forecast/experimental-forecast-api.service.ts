import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type { ExperimentalMoistureForecast, TelemetrySubscription } from '@cacaosmart/contracts';

export function checkedForecast(
  value: ExperimentalMoistureForecast,
  selection: TelemetrySubscription,
) {
  const day = 86400000;
  const instant = (v: unknown) =>
    typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  const pct = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
  const nullable = (v: unknown) => v === null || pct(v);
  const fail = () => {
    throw new Error('Referencia de humedad incompatible');
  };
  if (
    !value ||
    value.schemaVersion !== 'persistence-forecast-v1' ||
    value.plotId !== selection.plotId ||
    value.deviceId !== selection.deviceId ||
    value.source !== selection.source ||
    !instant(value.generatedAt) ||
    !instant(value.informationCutoff) ||
    Date.parse(value.informationCutoff) % day !== 0 ||
    Date.parse(value.generatedAt) < Date.parse(value.informationCutoff) ||
    Date.parse(value.generatedAt) >= Date.parse(value.informationCutoff) + day ||
    value.target?.from !== value.informationCutoff ||
    !instant(value.target.toExclusive) ||
    Date.parse(value.target.toExclusive) !== Date.parse(value.informationCutoff) + day ||
    value.target.timezone !== 'UTC' ||
    value.target.horizonDays !== 1 ||
    value.target.variable !== 'soil_moisture' ||
    value.target.unit !== '%' ||
    value.model?.name !== 'persistence' ||
    value.model.version !== '1.0.0' ||
    value.model.fitted !== false ||
    value.model.fieldValidated !== false ||
    value.uncertainty !== 'not_calibrated' ||
    value.waterDemand !== null ||
    !Array.isArray(value.zones) ||
    value.zones.length !== 3
  )
    fail();
  const at = Date.parse(value.informationCutoff);
  const reasons = [
    'available',
    'sensor_missing',
    'sensor_disabled',
    'device_disabled',
    'missing_previous_day',
    'unusable_previous_day',
  ];
  value.zones.forEach((zone, index) => {
    if (
      !zone ||
      zone.code !== ['soil_1', 'soil_2', 'soil_3'][index] ||
      !reasons.includes(zone.reason) ||
      !nullable(zone.predictedPct) ||
      (zone.predictedPct !== null) !== (zone.reason === 'available') ||
      (zone.sensorId === null
        ? zone.reason !== 'sensor_missing'
        : typeof zone.sensorId !== 'string' || !zone.sensorId) ||
      !Array.isArray(zone.history) ||
      zone.history.length !== 30
    )
      fail();
    if (
      zone.predictedPct === null
        ? zone.evidence !== null
        : !zone.evidence ||
          !instant(zone.evidence.observedAt) ||
          !instant(zone.evidence.receivedAt) ||
          Date.parse(zone.evidence.observedAt) < at - day ||
          Date.parse(zone.evidence.observedAt) >= at ||
          Date.parse(zone.evidence.receivedAt) > at
    )
      fail();
    const errors: number[] = [];
    zone.history.forEach((point, i) => {
      if (
        !point ||
        !instant(point.day) ||
        Date.parse(point.day) !== at - (30 - i) * day ||
        !nullable(point.observedPct) ||
        !nullable(point.predictedPct)
      )
        fail();
      if (point.observedPct !== null && point.predictedPct !== null)
        errors.push(point.predictedPct - point.observedPct);
    });
    const evaluation = zone.evaluation;
    if (
      !evaluation ||
      evaluation.from !== new Date(at - 30 * day).toISOString() ||
      evaluation.toExclusive !== value.informationCutoff ||
      evaluation.samples !== errors.length
    )
      fail();
    const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length;
    for (const [actual, expected] of [
      [evaluation.maePp, errors.length ? mean(errors.map(Math.abs)) : null],
      [evaluation.rmsePp, errors.length ? Math.sqrt(mean(errors.map((n) => n * n))) : null],
      [evaluation.biasPp, errors.length ? mean(errors) : null],
    ]) {
      if (
        expected === null
          ? actual !== null
          : typeof actual !== 'number' ||
            !Number.isFinite(actual) ||
            Math.abs(actual - expected) > 1e-8
      )
        fail();
    }
  });
  if (
    value.status !==
    (value.zones.some((zone) => zone.predictedPct !== null) ? 'experimental' : 'unavailable')
  )
    fail();
  return value;
}

@Injectable({ providedIn: 'root' })
export class ExperimentalForecastApi {
  private readonly http = inject(HttpClient);
  get(selection: TelemetrySubscription) {
    return this.http
      .get<ExperimentalMoistureForecast>(
        `/api/v1/plots/${encodeURIComponent(selection.plotId)}/predictions/experimental`,
        { params: { deviceId: selection.deviceId, source: selection.source, horizonDays: 1 } },
      )
      .pipe(
        timeout(15000),
        map((value) => checkedForecast(value, selection)),
      );
  }
}
