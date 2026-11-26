import { Injectable, NotFoundException } from '@nestjs/common';
import type { PredictionModelVersion } from '@prisma/client';
import type { DataSource, RegressionForecast, RegressionForecastZone } from '@cacaosmart/contracts';
import { PrismaService } from '../database/prisma.service';
import { SourcePolicy } from '../integrations/source-policy.service';
import { soilCodes, dayMs } from './offline/persistence-input';
import {
  artifactHash,
  inferRegression,
  parseRegressionArtifact,
  parseRegressionEvaluation,
} from './regression-artifact';

export interface RegressionFeatureRow {
  sensorId: string;
  code: string;
  lag: number;
  value: number | null;
  quality: string | null;
  observedAt: Date | null;
  receivedAt: Date | null;
}
export interface RegressionSnapshot {
  isActive: boolean;
  sensors: { id: string; code: string; enabled: boolean }[];
  models: (PredictionModelVersion | null)[];
  features: RegressionFeatureRow[];
}
export function regressionForecast(
  selection: { plotId: string; deviceId: string; source: DataSource },
  snapshot: RegressionSnapshot,
  now: Date,
): RegressionForecast {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const zones = soilCodes.map((code): RegressionForecastZone => {
    const sensor = snapshot.sensors.find((s) => s.code === code);
    const zone: RegressionForecastZone = {
      code,
      sensorId: sensor?.id ?? null,
      reason: 'model_not_registered',
      predictedPct: null,
      persistencePct: null,
      features: null,
      model: null,
    };
    if (!sensor) {
      zone.reason = 'sensor_missing';
      return zone;
    }
    if (!snapshot.isActive) {
      zone.reason = 'device_disabled';
      return zone;
    }
    if (!sensor.enabled) {
      zone.reason = 'sensor_disabled';
      return zone;
    }
    const model = snapshot.models.find((m) => m?.sensorId === sensor.id);
    if (!model) return zone;
    if (model.evaluatedThrough > cutoff || model.trainedUntil >= cutoff) {
      zone.reason = 'model_not_available_at_cutoff';
      return zone;
    }
    try {
      const artifact = parseRegressionArtifact(model.artifact);
      const evaluation = parseRegressionEvaluation(model.evaluation);
      if (
        artifact.sensorId !== sensor.id ||
        model.version !== artifact.version ||
        model.plotId !== selection.plotId ||
        model.deviceId !== selection.deviceId ||
        model.source !== selection.source ||
        !model.enabled ||
        artifactHash(artifact) !== model.artifactHash ||
        model.trainedUntil.toISOString() !== `${artifact.trainedUntilExclusive}T00:00:00.000Z` ||
        model.evaluatedThrough <= model.trainedUntil ||
        model.registeredAt > now
      )
        throw new Error('Incompatible');
      zone.model = {
        id: model.id,
        version: artifact.version,
        registeredAt: model.registeredAt.toISOString(),
        trainedUntilExclusive: artifact.trainedUntilExclusive,
        evaluatedThrough: model.evaluatedThrough.toISOString(),
        trainSamples: artifact.trainSamples,
        evaluation,
      };
      const rows = [1, 2].map((lag) =>
        snapshot.features.find((f) => f.sensorId === sensor.id && f.lag === lag),
      );
      if (rows.some((row) => !row?.observedAt || !row.receivedAt)) {
        zone.reason = 'missing_features';
        return zone;
      }
      const features: NonNullable<RegressionForecastZone['features']> = [];
      for (const [index, row] of rows.entries()) {
        const lag = (index + 1) as 1 | 2;
        if (
          !row ||
          row.quality !== 'valid' ||
          row.value === null ||
          !Number.isFinite(row.value) ||
          row.value < 0 ||
          row.value > 100 ||
          !row.observedAt ||
          !row.receivedAt ||
          row.observedAt.getTime() < cutoff.getTime() - lag * dayMs ||
          row.observedAt.getTime() >= cutoff.getTime() - (lag - 1) * dayMs ||
          row.receivedAt > cutoff
        ) {
          zone.reason = 'unusable_features';
          return zone;
        }
        features.push({
          lag,
          moisturePct: row.value,
          observedAt: row.observedAt.toISOString(),
          receivedAt: row.receivedAt.toISOString(),
        });
      }
      zone.features = features;
      zone.persistencePct = features[0].moisturePct;
      const predicted = inferRegression(artifact, features[0].moisturePct, features[1].moisturePct);
      if (!Number.isFinite(predicted) || predicted < 0 || predicted > 100) {
        zone.reason = 'output_out_of_range';
        return zone; // Never clamp a bad model output.
      }
      zone.predictedPct = predicted;
      zone.reason = 'available';
    } catch {
      zone.reason = 'model_incompatible';
      zone.model = null;
    }
    return zone;
  });
  return {
    schemaVersion: 'regression-forecast-v1',
    ...selection,
    generatedAt: now.toISOString(),
    informationCutoff: cutoff.toISOString(),
    target: {
      from: cutoff.toISOString(),
      toExclusive: new Date(cutoff.getTime() + dayMs).toISOString(),
      timezone: 'UTC',
      variable: 'soil_moisture',
      unit: '%',
      horizonDays: 1,
    },
    status: zones.some((z) => z.predictedPct !== null) ? 'experimental' : 'unavailable',
    fieldValidated: false,
    uncertainty: 'not_calibrated',
    waterDemand: null,
    zones,
  };
}

@Injectable()
export class RegressionForecastService {
  constructor(
    private readonly db: PrismaService,
    private readonly sources: SourcePolicy,
  ) {}
  async get(plotId: string, ownerId: string, deviceId: string, source: DataSource) {
    this.sources.require(source);
    const now = new Date();
    const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const snapshot = await this.db.$transaction(
      async (tx): Promise<RegressionSnapshot> => {
        const device = await tx.device.findFirst({
          where: {
            id: deviceId,
            plotId,
            source,
            plot: { ownerId, archivedAt: null, owner: { isActive: true } },
          },
          select: { isActive: true },
        });
        if (!device) throw new NotFoundException('Recurso no encontrado');
        const sensors = await tx.sensor.findMany({
          where: {
            deviceId,
            code: { in: [...soilCodes] },
            variable: 'SOIL_MOISTURE',
            unit: 'PERCENT',
          },
          select: { id: true, code: true, enabled: true },
          orderBy: { code: 'asc' },
        });
        const models = [];
        for (const sensor of sensors)
          models.push(
            await tx.predictionModelVersion.findFirst({
              where: {
                sensorId: sensor.id,
                deviceId,
                plotId,
                ownerId,
                source,
                enabled: true,
                registeredAt: { lte: now },
              },
              orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
            }),
          );
        const features = await tx.$queryRaw<RegressionFeatureRow[]>`
        SELECT s.id::text AS "sensorId", s.code::text AS code, l.lag,
          r.moisture_pct AS value, r.quality::text AS quality,
          r.effective_at AS "observedAt", r.received_at AS "receivedAt"
        FROM sensors s CROSS JOIN generate_series(1,2) AS l(lag)
        LEFT JOIN LATERAL (
          SELECT sr.moisture_pct, sr.quality, readings.effective_at, readings.received_at
          FROM readings JOIN soil_readings sr ON sr.reading_id=readings.id
          WHERE readings.device_id=${deviceId}::uuid AND readings.source=${source}::"TelemetrySource"
            AND sr.sensor_id=s.id AND readings.received_at <= ${cutoff}
            AND readings.effective_at >= ${cutoff}::timestamptz - l.lag * interval '24 hours'
            AND readings.effective_at < ${cutoff}::timestamptz - (l.lag-1) * interval '24 hours'
          ORDER BY readings.effective_at DESC, readings.received_at DESC, readings.ingestion_order DESC LIMIT 1
        ) r ON true
        WHERE s.device_id=${deviceId}::uuid AND s.code IN ('soil_1','soil_2','soil_3')
          AND s.variable='SOIL_MOISTURE' AND s.unit='PERCENT'
        ORDER BY s.code,l.lag
      `;
        return { isActive: device.isActive, sensors, models, features };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
    return regressionForecast({ plotId, deviceId, source }, snapshot, now);
  }
}
