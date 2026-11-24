import { Injectable } from '@nestjs/common';
import type { PredictionAvailability, SoilSensorId } from '@cacaosmart/contracts';
import { SourcePolicy } from '../integrations/source-policy.service';
import { PredictionRepository } from './prediction.repository';
import { PredictionQueryDto } from './prediction.dto';

export function coverageWindow(now: Date) {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { from: new Date(to.getTime() - 30 * 86400000), to };
}
@Injectable()
export class PredictionService {
  constructor(
    private readonly repository: PredictionRepository,
    private readonly sources: SourcePolicy,
  ) {}
  async get(
    plotId: string,
    ownerId: string,
    query: PredictionQueryDto,
  ): Promise<PredictionAvailability> {
    this.sources.require(query.source);
    const now = new Date();
    const { from, to } = coverageWindow(now);
    const { device, zones } = await this.repository.inspect(
      plotId,
      ownerId,
      query.source,
      query.deviceId,
      from,
      to,
      now,
    );
    const codes: SoilSensorId[] = ['soil_1', 'soil_2', 'soil_3'];
    return {
      schemaVersion: '1.0',
      plotId,
      source: query.source,
      evaluatedAt: now.toISOString(),
      window: {
        from: from.toISOString(),
        toExclusive: to.toISOString(),
        timezone: 'UTC',
        completeDays: 30,
      },
      target: { variable: 'soil_moisture', unit: '%', horizonDays: 1 },
      status: 'unavailable',
      reason: 'model_not_implemented',
      model: null,
      predictions: [],
      waterDemand: null,
      device,
      zones: codes.map((code) => {
        const row = zones.find((item) => item.code === code);
        return {
          code,
          sensorId: row?.sensorId ?? null,
          enabled: row?.enabled ?? false,
          samples: row?.samples ?? 0,
          validSamples: row?.validSamples ?? 0,
          validDaysUtc: row?.validDaysUtc ?? 0,
          firstValidAt: row?.firstValidAt?.toISOString() ?? null,
          lastValidAt: row?.lastValidAt?.toISOString() ?? null,
        };
      }),
    };
  }
}
