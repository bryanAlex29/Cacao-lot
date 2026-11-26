import { Injectable } from '@nestjs/common';
import type {
  ExperimentalMoistureForecast,
  ExperimentalForecastZone,
  DataSource,
} from '@cacaosmart/contracts';
import { SourcePolicy } from '../integrations/source-policy.service';
import { PersistenceBaseline, scorePairs } from './offline/persistence-baseline';
import { soilCodes, dayMs } from './offline/persistence-input';
import {
  DailyForecastRow,
  ExperimentalForecastRepository,
} from './experimental-forecast.repository';

const usable = (value: number | null, quality: string | null): value is number =>
  quality === 'valid' && value !== null && Number.isFinite(value) && value >= 0 && value <= 100;

export function referenceForecast(
  selection: { plotId: string; deviceId: string; source: DataSource },
  isActive: boolean,
  rows: DailyForecastRow[],
  now: Date,
): ExperimentalMoistureForecast {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const at = cutoff.getTime();
  const baseline = new PersistenceBaseline();
  const zones = soilCodes.map((code): ExperimentalForecastZone => {
    const own = rows.filter((row) => row.code === code);
    const daily = new Map(own.map((row) => [row.day.getTime(), row]));
    const yesterday = daily.get(at - dayMs);
    const feature = (row: DailyForecastRow | undefined): number | null =>
      row &&
      usable(row.featureValue, row.featureQuality) &&
      row.featureAt &&
      row.featureReceivedAt &&
      row.featureAt.getTime() >= row.day.getTime() &&
      row.featureAt.getTime() < row.day.getTime() + dayMs &&
      row.featureReceivedAt.getTime() <= row.day.getTime() + dayMs
        ? baseline.predict({ lastMoisturePct: row.featureValue })
        : null;
    const reason: ExperimentalForecastZone['reason'] = !own.length
      ? 'sensor_missing'
      : !isActive
        ? 'device_disabled'
        : !own[0].enabled
          ? 'sensor_disabled'
          : !yesterday?.featureAt
            ? 'missing_previous_day'
            : feature(yesterday) === null
              ? 'unusable_previous_day'
              : 'available';
    const predictedPct = reason === 'available' ? feature(yesterday) : null;
    const history = Array.from({ length: 30 }, (_, index) => {
      const day = at - (30 - index) * dayMs;
      const observed = daily.get(day);
      return {
        day: new Date(day).toISOString(),
        observedPct:
          observed && usable(observed.observedValue, observed.observedQuality)
            ? observed.observedValue
            : null,
        predictedPct: feature(daily.get(day - dayMs)),
      };
    });
    const metrics = scorePairs(
      history.flatMap((point) =>
        point.observedPct === null || point.predictedPct === null
          ? []
          : [{ observed: point.observedPct, predicted: point.predictedPct }],
      ),
    );
    return {
      code,
      sensorId: own[0]?.sensorId ?? null,
      reason,
      predictedPct,
      evidence:
        predictedPct !== null && yesterday?.featureAt && yesterday.featureReceivedAt
          ? {
              observedAt: yesterday.featureAt.toISOString(),
              receivedAt: yesterday.featureReceivedAt.toISOString(),
            }
          : null,
      evaluation: {
        from: new Date(at - 30 * dayMs).toISOString(),
        toExclusive: cutoff.toISOString(),
        samples: metrics.samples,
        maePp: metrics.maePp,
        rmsePp: metrics.rmsePp,
        biasPp: metrics.biasPp,
      },
      history,
    };
  });
  return {
    schemaVersion: 'persistence-forecast-v1',
    ...selection,
    generatedAt: now.toISOString(),
    informationCutoff: cutoff.toISOString(),
    target: {
      from: cutoff.toISOString(),
      toExclusive: new Date(at + dayMs).toISOString(),
      timezone: 'UTC',
      variable: 'soil_moisture',
      unit: '%',
      horizonDays: 1,
    },
    model: { name: 'persistence', version: '1.0.0', fitted: false, fieldValidated: false },
    status: zones.some((zone) => zone.predictedPct !== null) ? 'experimental' : 'unavailable',
    uncertainty: 'not_calibrated',
    waterDemand: null,
    zones,
  };
}

@Injectable()
export class ExperimentalForecastService {
  constructor(
    private readonly repository: ExperimentalForecastRepository,
    private readonly sources: SourcePolicy,
  ) {}
  async get(plotId: string, ownerId: string, deviceId: string, source: DataSource) {
    this.sources.require(source);
    const now = new Date();
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const result = await this.repository.get(plotId, ownerId, deviceId, source, cutoff, now);
    return referenceForecast(
      { plotId, deviceId, source },
      result.device.isActive,
      result.rows,
      now,
    );
  }
}
