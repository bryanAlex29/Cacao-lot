import { Injectable, NotFoundException } from '@nestjs/common';
import type { DataSource, SensorHealth, SoilSensorId } from '@cacaosmart/contracts';
import { PrismaService } from '../database/prisma.service';

export interface DailyForecastRow {
  sensorId: string;
  code: SoilSensorId;
  enabled: boolean;
  day: Date;
  featureValue: number | null;
  featureQuality: SensorHealth | null;
  featureAt: Date | null;
  featureReceivedAt: Date | null;
  observedValue: number | null;
  observedQuality: SensorHealth | null;
}
@Injectable()
export class ExperimentalForecastRepository {
  constructor(private readonly db: PrismaService) {}

  get(
    plotId: string,
    ownerId: string,
    deviceId: string,
    source: DataSource,
    cutoff: Date,
    now: Date,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const device = await tx.device.findFirst({
          where: {
            id: deviceId,
            source,
            plot: { id: plotId, ownerId, archivedAt: null, owner: { isActive: true } },
          },
          select: { isActive: true },
        });
        if (!device) throw new NotFoundException('Recurso no encontrado');
        // At most 31 days × 3 sensors. Filter quality AFTER selecting the latest record:
        // an invalid/missing final value must not silently fall back to an older valid one.
        const rows = await tx.$queryRaw<DailyForecastRow[]>`
        SELECT s.id::text AS "sensorId", s.code::text AS code, s.enabled, days.day,
          feature.moisture_pct AS "featureValue", feature.quality::text AS "featureQuality",
          feature.effective_at AS "featureAt", feature.received_at AS "featureReceivedAt",
          observed.moisture_pct AS "observedValue", observed.quality::text AS "observedQuality"
        FROM sensors s
        CROSS JOIN generate_series(1, 31) AS offsets(n)
        CROSS JOIN LATERAL (
          SELECT ${cutoff}::timestamptz - offsets.n * interval '24 hours' AS day
        ) days
        LEFT JOIN LATERAL (
          SELECT sr.moisture_pct, sr.quality, r.effective_at, r.received_at
          FROM readings r JOIN soil_readings sr ON sr.reading_id = r.id
          WHERE r.device_id = ${deviceId}::uuid AND r.source = ${source}::"TelemetrySource"
            AND sr.sensor_id = s.id AND r.effective_at >= days.day
            AND r.effective_at < days.day + interval '24 hours'
            AND r.received_at <= days.day + interval '24 hours'
          ORDER BY r.effective_at DESC, r.received_at DESC, r.ingestion_order DESC LIMIT 1
        ) feature ON true
        LEFT JOIN LATERAL (
          SELECT sr.moisture_pct, sr.quality
          FROM readings r JOIN soil_readings sr ON sr.reading_id = r.id
          WHERE r.device_id = ${deviceId}::uuid AND r.source = ${source}::"TelemetrySource"
            AND sr.sensor_id = s.id AND r.effective_at >= days.day
            AND r.effective_at < days.day + interval '24 hours' AND r.received_at <= ${now}
          ORDER BY r.effective_at DESC, r.received_at DESC, r.ingestion_order DESC LIMIT 1
        ) observed ON true
        WHERE s.device_id = ${deviceId}::uuid AND s.code IN ('soil_1','soil_2','soil_3')
          AND s.variable = 'SOIL_MOISTURE' AND s.unit = 'PERCENT'
        ORDER BY s.code, days.day
      `;
        return { device, rows };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
}
