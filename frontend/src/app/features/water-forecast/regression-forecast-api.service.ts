import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type { RegressionForecast, TelemetrySubscription } from '@cacaosmart/contracts';

export function checkedRegression(value: RegressionForecast, selection: TelemetrySubscription) {
  const day = 86400000;
  const instant = (v: unknown) =>
    typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  const pct = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
  const fail = () => {
    throw new Error('Regresión experimental incompatible');
  };
  if (
    !value ||
    value.schemaVersion !== 'regression-forecast-v1' ||
    value.plotId !== selection.plotId ||
    value.deviceId !== selection.deviceId ||
    value.source !== selection.source ||
    value.fieldValidated !== false ||
    value.uncertainty !== 'not_calibrated' ||
    value.waterDemand !== null ||
    !instant(value.generatedAt) ||
    !instant(value.informationCutoff) ||
    Date.parse(value.informationCutoff) % day !== 0 ||
    Date.parse(value.generatedAt) < Date.parse(value.informationCutoff) ||
    Date.parse(value.generatedAt) >= Date.parse(value.informationCutoff) + day ||
    value.target?.from !== value.informationCutoff ||
    !instant(value.target.toExclusive) ||
    Date.parse(value.target.toExclusive) !== Date.parse(value.informationCutoff) + day ||
    value.target.variable !== 'soil_moisture' ||
    value.target.timezone !== 'UTC' ||
    value.target.unit !== '%' ||
    value.target.horizonDays !== 1 ||
    !Array.isArray(value.zones) ||
    value.zones.length !== 3
  )
    fail();
  const cutoff = Date.parse(value.informationCutoff);
  const reasons = [
    'available',
    'sensor_missing',
    'sensor_disabled',
    'device_disabled',
    'model_not_registered',
    'model_not_available_at_cutoff',
    'model_incompatible',
    'missing_features',
    'unusable_features',
    'output_out_of_range',
  ];
  value.zones.forEach((zone, index) => {
    if (
      !zone ||
      zone.code !== ['soil_1', 'soil_2', 'soil_3'][index] ||
      !reasons.includes(zone.reason) ||
      (zone.sensorId === null
        ? zone.reason !== 'sensor_missing'
        : typeof zone.sensorId !== 'string' || !zone.sensorId) ||
      (zone.predictedPct === null
        ? zone.reason === 'available'
        : !pct(zone.predictedPct) || zone.reason !== 'available') ||
      (zone.persistencePct !== null && !pct(zone.persistencePct))
    )
      fail();
    if (zone.model !== null) {
      const model = zone.model;
      if (
        !model ||
        typeof model.id !== 'string' ||
        !model.id ||
        model.version !== 'linear-two-lag-1.0.0' ||
        !instant(model.registeredAt) ||
        Date.parse(model.registeredAt) > Date.parse(value.generatedAt) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(model.trainedUntilExclusive) ||
        !instant(`${model.trainedUntilExclusive}T00:00:00.000Z`) ||
        !instant(model.evaluatedThrough) ||
        Date.parse(model.evaluatedThrough) > cutoff ||
        Date.parse(model.evaluatedThrough) <= Date.parse(model.trainedUntilExclusive) ||
        !Number.isInteger(model.trainSamples) ||
        model.trainSamples < 4 ||
        model.trainSamples > 366
      )
        fail();
      for (const partition of ['validation', 'test'] as const) {
        const pair = model.evaluation?.[partition];
        if (!pair || pair.regression?.samples !== pair.persistence?.samples) fail();
        for (const method of ['regression', 'persistence'] as const) {
          const score = pair[method];
          if (
            !score ||
            !Number.isInteger(score.samples) ||
            score.samples < 1 ||
            score.samples > 366 ||
            ![score.maePp, score.rmsePp, score.biasPp].every(
              (n) => typeof n === 'number' && Number.isFinite(n),
            ) ||
            score.maePp < 0 ||
            score.rmsePp + 1e-8 < score.maePp ||
            Math.abs(score.biasPp) > score.rmsePp + 1e-8 ||
            !Number.isInteger(score.outOfRangePredictions) ||
            score.outOfRangePredictions < 0 ||
            score.outOfRangePredictions > score.samples
          )
            fail();
        }
      }
    }
    if (zone.features !== null) {
      if (!Array.isArray(zone.features) || zone.features.length !== 2 || !zone.model) fail();
      zone.features.forEach((feature, i) => {
        if (
          !feature ||
          feature.lag !== i + 1 ||
          !pct(feature.moisturePct) ||
          !instant(feature.observedAt) ||
          !instant(feature.receivedAt) ||
          Date.parse(feature.observedAt) < cutoff - (i + 1) * day ||
          Date.parse(feature.observedAt) >= cutoff - i * day ||
          Date.parse(feature.receivedAt) > cutoff
        )
          fail();
      });
      if (zone.persistencePct !== zone.features[0].moisturePct) fail();
    } else if (zone.persistencePct !== null) fail();
    if (
      (zone.reason === 'available' || zone.reason === 'output_out_of_range') &&
      (!zone.model || !zone.features)
    )
      fail();
    if (
      zone.reason !== 'available' &&
      zone.reason !== 'output_out_of_range' &&
      zone.features !== null
    )
      fail();
  });
  if (
    value.status !==
    (value.zones.some((zone) => zone.predictedPct !== null) ? 'experimental' : 'unavailable')
  )
    fail();
  return value;
}
@Injectable({ providedIn: 'root' })
export class RegressionForecastApi {
  private readonly http = inject(HttpClient);
  get(selection: TelemetrySubscription) {
    return this.http
      .get<RegressionForecast>(
        `/api/v1/plots/${encodeURIComponent(selection.plotId)}/predictions/regression`,
        { params: { deviceId: selection.deviceId, source: selection.source, horizonDays: 1 } },
      )
      .pipe(
        timeout(15000),
        map((value) => checkedRegression(value, selection)),
      );
  }
}
