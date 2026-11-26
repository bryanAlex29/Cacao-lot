import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  DataSource,
  IotTelemetryPayload,
  ObservedIrrigationEvent,
  Page,
} from '@cacaosmart/contracts';
import type { AuthenticatedDevice } from '../devices/device-auth.service';
import { PrismaService } from '../database/prisma.service';
import { normalize, readingInclude, soilCodes, toReading } from './telemetry.mapping';
import {
  irrigationObservation,
  valveObservationSelect,
} from '../irrigation/irrigation-observation';
import type { ExternalObservation } from './external-observation';

const latestOrder = [
  { effectiveAt: 'desc' },
  { receivedAt: 'desc' },
  { ingestionOrder: 'desc' },
] satisfies Prisma.ReadingOrderByWithRelationInput[];

@Injectable()
export class TelemetryRepository {
  constructor(private readonly database: PrismaService) {}

  async ingest(
    auth: AuthenticatedDevice,
    input: IotTelemetryPayload,
    payloadHash: string,
    external?: ExternalObservation,
  ) {
    return this.database.$transaction(async (tx) => {
      // Serializa reintentos concurrentes y cambios de credencial/actividad del dispositivo.
      await tx.$queryRaw`SELECT id FROM devices WHERE id = ${auth.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT p.id FROM plots p JOIN users u ON u.id = p.owner_id WHERE p.id = ${auth.plotId}::uuid FOR SHARE OF p, u`;
      const device = await tx.device.findUnique({
        where: { id: auth.id },
        select: {
          isActive: true,
          plotId: true,
          source: true,
          credentialHash: true,
          serial: true,
          lastSeenAt: true,
          plot: {
            select: { ownerId: true, archivedAt: true, owner: { select: { isActive: true } } },
          },
        },
      });
      if (
        !device?.isActive ||
        device.plotId !== auth.plotId ||
        device.source !== auth.source ||
        device.credentialHash !== auth.credentialHash ||
        device.plot.archivedAt ||
        !device.plot.owner.isActive ||
        (external &&
          (device.plot.ownerId !== external.ownerId ||
            device.serial !== `thingspeak-${external.channelId}`))
      )
        throw new UnauthorizedException('Credencial de dispositivo inválida');
      const existing = await tx.reading.findUnique({
        where: { deviceId_eventId: { deviceId: auth.id, eventId: input.eventId } },
        include: readingInclude,
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new ConflictException('eventId ya utilizado con datos distintos');
        return { duplicate: true, reading: toReading(existing), irrigationUpdate: null };
      }
      // No deja que la habilitación de una sonda cambie durante la normalización.
      await tx.$queryRaw`SELECT id FROM sensors WHERE device_id = ${auth.id}::uuid FOR SHARE`;
      const sensors = await tx.sensor.findMany({ where: { deviceId: auth.id } });
      const receivedAt = new Date();
      const reading = normalize(
        input,
        new Set(sensors.filter((s) => s.enabled).map((s) => s.code)),
        receivedAt,
        device.source,
      );
      if (external) {
        // Solo la calidad del mapa interno, sin reactivar sensores deshabilitados.
        for (const key of Object.keys(reading.quality) as (keyof typeof reading.quality)[]) {
          const value =
            key === 'soil_1' || key === 'soil_2' || key === 'soil_3'
              ? reading.soilMoisture[key]
              : key === 'relayCommandedOpen' || key === 'feedbackOpen'
                ? reading.valve[key]
                : reading[key];
          reading.quality[key] =
            value === null
              ? external.quality[key] === 'invalid'
                ? 'invalid'
                : 'missing'
              : external.quality[key];
        }
      }
      const effectiveAt = external
        ? new Date(external.providerObservedAt)
        : (reading.recordedAt ?? receivedAt);
      const previous = await tx.reading.findFirst({
        where: { deviceId: auth.id, source: device.source },
        orderBy: latestOrder,
        select: valveObservationSelect,
      });
      const stored = await tx.reading.create({
        data: {
          deviceId: auth.id,
          eventId: input.eventId,
          payloadHash,
          recordedAt: reading.recordedAt,
          receivedAt,
          effectiveAt,
          timestampOrigin: reading.timestampOrigin,
          source: device.source,
          temperatureC: reading.temperatureC,
          airHumidityPct: reading.airHumidityPct,
          rainDetected: reading.rainDetected,
          relayCommandedOpen: reading.valve.relayCommandedOpen,
          feedbackOpen: reading.valve.feedbackOpen,
          quality: reading.quality,
          soilReadings: {
            create: soilCodes.map((code) => {
              const sensor = sensors.find((s) => s.code === code);
              if (!sensor) throw new ConflictException('Inventario de sensores incompleto');
              return {
                sensorId: sensor.id,
                moisturePct: reading.soilMoisture[code],
                quality: reading.quality[code],
              };
            }),
          },
        },
        include: readingInclude,
      });
      const contact = external ? new Date(external.providerObservedAt) : receivedAt;
      await tx.device.update({
        where: { id: auth.id },
        data: {
          lastSeenAt:
            external && device.lastSeenAt && device.lastSeenAt > contact
              ? device.lastSeenAt
              : contact,
        },
      });
      return {
        duplicate: false,
        reading: toReading(stored),
        irrigationUpdate: external ? null : irrigationObservation(auth.plotId, stored, previous),
      };
    });
  }

  async ownedDevices(plotId: string, ownerId: string, source: 'real' | 'demo', deviceId?: string) {
    const plot = await this.database.plot.findFirst({
      where: { id: plotId, ownerId, archivedAt: null },
      select: { id: true },
    });
    if (!plot) return null;
    return this.database.device.findMany({
      where: { plotId, source, ...(deviceId ? { id: deviceId } : {}) },
      select: { id: true, isActive: true, lastSeenAt: true, expectedIntervalSeconds: true },
      take: 2,
      orderBy: { id: 'asc' },
    });
  }

  async latest(deviceId: string, ownerId: string) {
    const row = await this.database.reading.findFirst({
      where: { deviceId, device: { plot: { ownerId, archivedAt: null } } },
      orderBy: latestOrder,
      include: readingInclude,
    });
    return row ? toReading(row) : null;
  }

  async history(
    deviceId: string,
    ownerId: string,
    from: Date,
    to: Date,
    limit: number,
    offset: number,
  ) {
    const where: Prisma.ReadingWhereInput = {
      deviceId,
      device: { plot: { ownerId, archivedAt: null } },
      effectiveAt: { gte: from, lte: to },
    };
    const [rows, total] = await this.database.$transaction([
      this.database.reading.findMany({
        where,
        orderBy: latestOrder,
        take: limit,
        skip: offset,
        include: readingInclude,
      }),
      this.database.reading.count({ where }),
    ]);
    return { items: rows.map(toReading), total, limit, offset };
  }

  async irrigationHistory(
    deviceId: string,
    plotId: string,
    ownerId: string,
    source: DataSource,
    from: Date,
    to: Date,
    limit: number,
    offset: number,
  ): Promise<Page<ObservedIrrigationEvent>> {
    // One statement/snapshot for count + page. Include exactly one predecessor before
    // the period so filtering/pagination never invents an initial/change event.
    const [result] = await this.database.$queryRaw<
      {
        items: ObservedIrrigationEvent[];
        total: number;
      }[]
    >`
      WITH authorized AS (
        SELECT d.id FROM devices d JOIN plots p ON p.id = d.plot_id
        WHERE d.id = ${deviceId}::uuid AND p.id = ${plotId}::uuid
          AND p.owner_id = ${ownerId}::uuid AND p.archived_at IS NULL
          AND d.source = ${source}::"TelemetrySource"
      ), period AS (
        SELECT r.* FROM readings r JOIN authorized a ON a.id = r.device_id
        WHERE r.source = ${source}::"TelemetrySource"
          AND r.effective_at >= ${from} AND r.effective_at <= ${to}
      ), predecessor AS (
        SELECT r.* FROM readings r JOIN authorized a ON a.id = r.device_id
        WHERE r.source = ${source}::"TelemetrySource" AND r.effective_at < ${from}
        ORDER BY r.effective_at DESC, r.received_at DESC, r.ingestion_order DESC LIMIT 1
      ), ordered AS (
        SELECT *, lag(id) OVER w AS previous_id,
          lag(relay_commanded_open) OVER w AS previous_relay,
          lag(feedback_open) OVER w AS previous_feedback
        FROM (SELECT * FROM period UNION ALL SELECT * FROM predecessor) observations
        WINDOW w AS (ORDER BY effective_at, received_at, ingestion_order)
      ), changes AS (
        SELECT * FROM ordered WHERE effective_at >= ${from} AND (
          previous_id IS NULL OR relay_commanded_open IS DISTINCT FROM previous_relay
          OR feedback_open IS DISTINCT FROM previous_feedback
        )
      ), page AS (
        SELECT * FROM changes
        ORDER BY effective_at DESC, received_at DESC, ingestion_order DESC
        LIMIT ${limit} OFFSET ${offset}
      )
      SELECT (SELECT count(*)::int FROM changes) AS total,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'eventId', event_id, 'plotId', ${plotId}::text,
          'deviceId', device_id, 'source', source,
          'observedAt', to_char(effective_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'receivedAt', to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'timestampOrigin', timestamp_origin,
          'kind', CASE WHEN previous_id IS NULL THEN 'initial' ELSE 'change' END,
          'valve', jsonb_build_object('relayCommandedOpen', relay_commanded_open, 'feedbackOpen', feedback_open),
          'previousValve', CASE WHEN previous_id IS NULL THEN NULL ELSE
            jsonb_build_object('relayCommandedOpen', previous_relay, 'feedbackOpen', previous_feedback) END
        ) ORDER BY effective_at DESC, received_at DESC, ingestion_order DESC) FROM page), '[]'::jsonb) AS items
    `;
    return { ...result, limit, offset };
  }
}
