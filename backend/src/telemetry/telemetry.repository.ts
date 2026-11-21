import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { IotTelemetryPayload } from '@cacaosmart/contracts';
import type { AuthenticatedDevice } from '../devices/device-auth.service';
import { PrismaService } from '../database/prisma.service';
import { normalize, readingInclude, soilCodes, toReading } from './telemetry.mapping';

const latestOrder = [
  { effectiveAt: 'desc' },
  { receivedAt: 'desc' },
  { ingestionOrder: 'desc' },
] satisfies Prisma.ReadingOrderByWithRelationInput[];

@Injectable()
export class TelemetryRepository {
  constructor(private readonly database: PrismaService) {}

  async ingest(auth: AuthenticatedDevice, input: IotTelemetryPayload, payloadHash: string) {
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
          plot: { select: { archivedAt: true, owner: { select: { isActive: true } } } },
        },
      });
      if (
        !device?.isActive ||
        device.plotId !== auth.plotId ||
        device.source !== auth.source ||
        device.credentialHash !== auth.credentialHash ||
        device.plot.archivedAt ||
        !device.plot.owner.isActive
      )
        throw new UnauthorizedException('Credencial de dispositivo inválida');
      const existing = await tx.reading.findUnique({
        where: { deviceId_eventId: { deviceId: auth.id, eventId: input.eventId } },
        include: readingInclude,
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new ConflictException('eventId ya utilizado con datos distintos');
        return { duplicate: true, reading: toReading(existing) };
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
      const stored = await tx.reading.create({
        data: {
          deviceId: auth.id,
          eventId: input.eventId,
          payloadHash,
          recordedAt: reading.recordedAt,
          receivedAt,
          effectiveAt: reading.recordedAt ?? receivedAt,
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
      await tx.device.update({ where: { id: auth.id }, data: { lastSeenAt: receivedAt } });
      return { duplicate: false, reading: toReading(stored) };
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
}
