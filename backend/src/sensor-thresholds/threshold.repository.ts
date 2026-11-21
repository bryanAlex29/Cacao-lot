import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PutSensorThresholdInput } from '@cacaosmart/contracts';
import { PrismaService } from '../database/prisma.service';
import { toThresholdRange } from './threshold.mapping';
import { MAX_THRESHOLD_CHANGES } from './threshold-history';

const sensorSelect = {
  id: true,
  deviceId: true,
  variable: true,
  unit: true,
  thresholds: true,
  device: {
    select: {
      plotId: true,
      source: true,
      plot: { select: { owner: { select: { role: true } } } },
    },
  },
} satisfies Prisma.SensorSelect;
export type OwnedSensor = Prisma.SensorGetPayload<{ select: typeof sensorSelect }>;

@Injectable()
export class ThresholdRepository {
  constructor(private readonly database: PrismaService) {}

  private async owned(
    client: Pick<Prisma.TransactionClient, 'sensor'>,
    id: string,
    ownerId: string,
  ) {
    const sensor = await client.sensor.findFirst({
      where: {
        id,
        enabled: true,
        device: {
          isActive: true,
          plot: {
            ownerId,
            archivedAt: null,
            owner: { isActive: true },
          },
        },
      },
      select: sensorSelect,
    });
    if (!sensor) throw new NotFoundException('Sensor no encontrado');
    return sensor;
  }

  get(id: string, ownerId: string): Promise<OwnedSensor> {
    return this.owned(this.database, id, ownerId);
  }

  async history(
    id: string,
    ownerId: string,
    from: Date,
    to: Date,
    validate: (sensor: OwnedSensor) => void,
  ) {
    return this.database.$transaction(
      async (tx) => {
        const sensor = await this.owned(tx, id, ownerId);
        validate(sensor);
        const where = {
          sensorId: id,
          variable: sensor.variable,
          plotId: sensor.device.plotId,
          source: sensor.device.source,
        };
        const before = await tx.sensorThresholdAudit.findFirst({
          where: { ...where, changedAt: { lte: from } },
          orderBy: [{ changedAt: 'desc' }, { version: 'desc' }],
        });
        const changes = await tx.sensorThresholdAudit.findMany({
          where: { ...where, changedAt: { gt: from, lt: to } },
          orderBy: [{ changedAt: 'asc' }, { version: 'asc' }],
          take: MAX_THRESHOLD_CHANGES + 1,
        });
        const after = await tx.sensorThresholdAudit.findFirst({
          where: { ...where, changedAt: { gte: to } },
          orderBy: [{ changedAt: 'asc' }, { version: 'asc' }],
        });
        return { sensor, before, changes, after };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async put(
    id: string,
    ownerId: string,
    input: PutSensorThresholdInput,
    validate: (sensor: OwnedSensor) => void,
  ): Promise<OwnedSensor> {
    return this.database.$transaction(async (tx) => {
      const initial = await this.owned(tx, id, ownerId);
      // Same lock order as ingestion: device -> plot/user -> sensor. Recheck after locks.
      await tx.$queryRaw`SELECT id FROM devices WHERE id = ${initial.deviceId}::uuid FOR SHARE`;
      await tx.$queryRaw`SELECT p.id FROM plots p JOIN users u ON u.id = p.owner_id WHERE p.id = ${initial.device.plotId}::uuid FOR SHARE OF p, u`;
      await tx.$queryRaw`SELECT id FROM sensors WHERE id = ${id}::uuid FOR UPDATE`;
      const sensor = await this.owned(tx, id, ownerId);
      if (sensor.deviceId !== initial.deviceId || sensor.device.plotId !== initial.device.plotId)
        throw new ConflictException('El sensor cambió de ubicación; vuelve a consultar');
      if (sensor.device.plot.owner.role !== 'ADMIN')
        throw new ForbiddenException('Permisos insuficientes');
      validate(sensor); // Service policies run against the locked, revalidated identity.
      const previous = sensor.thresholds[0];
      if (input.expectedVersion !== (previous?.version ?? 0))
        throw new ConflictException('El rango cambió; consulta su versión antes de guardar');
      if (previous && previous.minValue === input.minValue && previous.maxValue === input.maxValue)
        return sensor; // No-op: no false edit or duplicate audit.
      const now = new Date();
      const data = {
        minValue: input.minValue,
        maxValue: input.maxValue,
        effectiveAt: now,
        updatedBy: ownerId,
        version: (previous?.version ?? 0) + 1,
      };
      const stored = previous
        ? await tx.sensorThreshold.update({ where: { id: previous.id }, data })
        : await tx.sensorThreshold.create({
            data: {
              ...data,
              sensorId: id,
              variable: sensor.variable,
              unit: sensor.unit,
            },
          });
      await tx.sensorThresholdAudit.create({
        data: {
          sensorId: id,
          plotId: sensor.device.plotId,
          actorId: ownerId,
          source: sensor.device.source,
          variable: sensor.variable,
          version: stored.version,
          changedAt: now,
          oldValue: previous
            ? { ...toThresholdRange(previous), variable: previous.variable, unit: previous.unit }
            : Prisma.DbNull,
          newValue: { ...toThresholdRange(stored), variable: stored.variable, unit: stored.unit },
        },
      });
      if (sensor.variable === 'SOIL_MOISTURE') {
        // Same sensor lock as the detector: range changes never look like recovery.
        await tx.moistureAlert.updateMany({
          where: { sensorId: id, closedAt: null },
          data: { closedAt: now, closeReason: 'CONFIGURATION_CHANGED' },
        });
        const latest = await tx.reading.findFirst({
          where: { deviceId: sensor.deviceId },
          orderBy: { ingestionOrder: 'desc' },
          select: { ingestionOrder: true },
        });
        await tx.moistureAlertState.updateMany({
          where: { sensorId: id },
          data: {
            thresholdVersion: stored.version,
            lastOrder: latest?.ingestionOrder ?? 0n,
            lastEffectiveAt: null,
            lowCount: 0,
            recoveryCount: 0,
            firstLowAt: null,
          },
        });
      }
      return { ...sensor, thresholds: [stored] };
    });
  }
}
