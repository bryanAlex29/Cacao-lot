import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, SoilSensorId } from '@cacaosmart/contracts';
import { PrismaService } from '../database/prisma.service';
import type { PersistenceObservation } from './offline/persistence-input';

export interface CoverageRow {
  code: SoilSensorId;
  sensorId: string;
  enabled: boolean;
  samples: number;
  validSamples: number;
  validDaysUtc: number;
  firstValidAt: Date | null;
  lastValidAt: Date | null;
}

@Injectable()
export class PredictionRepository {
  constructor(private readonly db: PrismaService) {}
  exportOffline(
    plotId: string,
    ownerId: string,
    source: DataSource,
    deviceId: string,
    from: Date,
    to: Date,
    asOf: Date,
    limit: number,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const device = await tx.device.findFirst({
          where: {
            id: deviceId,
            source,
            plot: { id: plotId, ownerId, archivedAt: null, owner: { isActive: true } },
          },
          select: { id: true, serial: true },
        });
        if (!device) throw new NotFoundException('Recurso no encontrado');
        if (device.serial?.startsWith('thingspeak-')) {
          throw new BadRequestException(
            'La exportación offline de ThingSpeak requiere un formato con procedencia temporal; usa el historial o CSV por ahora.',
          );
        }
        // Historical access includes disabled sensors/devices; current flags are not
        // retroactive quality or calibration claims. No secret fields are selected.
        const sensors = await tx.sensor.findMany({
          where: {
            deviceId,
            code: { in: ['soil_1', 'soil_2', 'soil_3'] },
            variable: 'SOIL_MOISTURE',
            unit: 'PERCENT',
          },
          select: { id: true, code: true },
          orderBy: { code: 'asc' },
        });
        const observations = await tx.$queryRaw<PersistenceObservation[]>`
          SELECT r.event_id AS "eventId", r.ingestion_order::text AS "ingestionOrder",
            ${plotId}::text AS "plotId", r.device_id::text AS "deviceId",
            r.source::text AS source, s.id::text AS "sensorId", s.code::text AS code,
            to_char(r.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "recordedAt",
            to_char(r.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "receivedAt",
            CASE WHEN sr.quality = 'invalid' THEN NULL ELSE sr.moisture_pct END AS "moisturePct",
            sr.quality::text AS quality
          FROM readings r
          JOIN soil_readings sr ON sr.reading_id = r.id
          JOIN sensors s ON s.id = sr.sensor_id AND s.device_id = r.device_id
          WHERE r.device_id = ${deviceId}::uuid AND r.source = ${source}::"TelemetrySource"
            AND r.effective_at >= ${from} AND r.effective_at < ${to}
            AND r.received_at <= ${asOf}
            AND s.code IN ('soil_1', 'soil_2', 'soil_3')
            AND s.variable = 'SOIL_MOISTURE' AND s.unit = 'PERCENT'
          ORDER BY r.effective_at, r.received_at, r.ingestion_order, s.code
          LIMIT ${limit + 1}
        `;
        return { sensors, observations };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
  inspect(
    plotId: string,
    ownerId: string,
    source: DataSource,
    deviceId: string | undefined,
    from: Date,
    to: Date,
    asOf: Date,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const plot = await tx.plot.findFirst({
          where: { id: plotId, ownerId, archivedAt: null, owner: { isActive: true } },
          select: { id: true },
        });
        if (!plot) throw new NotFoundException('Recurso no encontrado');
        const devices = await tx.device.findMany({
          where: { plotId, source, ...(deviceId ? { id: deviceId } : {}) },
          select: { id: true, serial: true, isActive: true },
          orderBy: { id: 'asc' },
          take: 2,
        });
        if (deviceId && !devices.length) throw new NotFoundException('Recurso no encontrado');
        if (devices.length > 1)
          throw new ConflictException('Selecciona deviceId; no se mezclan dispositivos');
        const device = devices[0] ?? null;
        if (!device) return { device, zones: [] as CoverageRow[] };
        // Bounded aggregate, never load the historical series into application memory.
        // Valid is payload quality, NOT certification of calibration/agronomic suitability.
        const zones = await tx.$queryRaw<CoverageRow[]>`
        WITH period AS (
          SELECT sr.sensor_id, sr.moisture_pct, sr.quality, r.effective_at
          FROM readings r JOIN soil_readings sr ON sr.reading_id = r.id
          WHERE r.device_id = ${device.id}::uuid AND r.source = ${source}::"TelemetrySource"
            AND r.effective_at >= ${from} AND r.effective_at < ${to}
            AND r.received_at <= ${asOf}
        )
        SELECT s.code, s.id AS "sensorId", s.enabled,
          count(p.sensor_id)::int AS samples,
          count(p.sensor_id) FILTER (WHERE p.quality = 'valid' AND p.moisture_pct BETWEEN 0 AND 100)::int AS "validSamples",
          count(DISTINCT (p.effective_at AT TIME ZONE 'UTC')::date)
            FILTER (WHERE p.quality = 'valid' AND p.moisture_pct BETWEEN 0 AND 100)::int AS "validDaysUtc",
          min(p.effective_at) FILTER (WHERE p.quality = 'valid' AND p.moisture_pct BETWEEN 0 AND 100) AS "firstValidAt",
          max(p.effective_at) FILTER (WHERE p.quality = 'valid' AND p.moisture_pct BETWEEN 0 AND 100) AS "lastValidAt"
        FROM sensors s LEFT JOIN period p ON p.sensor_id = s.id
        WHERE s.device_id = ${device.id}::uuid AND s.code IN ('soil_1', 'soil_2', 'soil_3')
        GROUP BY s.id, s.code, s.enabled ORDER BY s.code
      `;
        return { device, zones };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
