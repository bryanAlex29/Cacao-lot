import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DataSource } from '@cacaosmart/contracts';
import { PrismaService } from '../database/prisma.service';
import { offlineClosure, shouldOpenOfflineAlert, toOfflineAlert } from './offline-alert.rules';
import { OfflineAlertQueryDto } from './offline-alert.dto';

@Injectable()
export class OfflineAlertRepository {
  constructor(private readonly database: PrismaService) {}

  candidates(sources: DataSource[], after?: string) {
    return this.database.device.findMany({
      where: {
        source: { in: sources },
        ...(after ? { id: { gt: after } } : {}),
        OR: [
          {
            isActive: true,
            lastSeenAt: { not: null },
            plot: { archivedAt: null, owner: { isActive: true } },
          },
          { offlineAlerts: { some: { closedAt: null } } },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
  }

  /** Same lock order as ingestion: device -> plot/user -> alert. No changes to telemetry. */
  async synchronize(
    deviceId: string,
    allowed: (source: DataSource) => boolean,
    clock?: Date,
  ): Promise<void> {
    await this.database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM devices WHERE id = ${deviceId}::uuid FOR UPDATE`;
      const initial = await tx.device.findUnique({
        where: { id: deviceId },
        select: { plotId: true },
      });
      if (!initial) return;
      await tx.$queryRaw`SELECT p.id FROM plots p JOIN users u ON u.id = p.owner_id WHERE p.id = ${initial.plotId}::uuid FOR SHARE OF p, u`;
      const device = await tx.device.findUnique({
        where: { id: deviceId },
        include: {
          plot: { include: { owner: { select: { isActive: true } } } },
          offlineAlerts: { where: { closedAt: null } },
        },
      });
      if (!device || !allowed(device.source)) return;
      const now = clock ?? new Date();
      let active: (typeof device.offlineAlerts)[number] | undefined = device.offlineAlerts[0];
      if (active) {
        const closure = offlineClosure(device, active, now);
        if (closure) {
          await tx.offlineAlert.update({ where: { id: active.id }, data: closure });
          active = undefined;
        }
      }
      if (!active && shouldOpenOfflineAlert(device, now) && device.lastSeenAt) {
        await tx.offlineAlert.create({
          data: {
            deviceId,
            plotId: device.plotId,
            source: device.source,
            lastSeenAt: device.lastSeenAt,
            expectedIntervalSeconds: device.expectedIntervalSeconds,
            detectedAt: now,
          },
        });
      }
    });
  }

  private async ownedDevice(
    tx: Pick<Prisma.TransactionClient, 'device'>,
    plotId: string,
    deviceId: string,
    ownerId: string,
  ) {
    const device = await tx.device.findFirst({
      where: {
        id: deviceId,
        plotId,
        plot: {
          ownerId,
          archivedAt: null,
          owner: { isActive: true },
        },
      },
      select: { id: true, source: true },
    });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    return device;
  }

  async list(
    plotId: string,
    ownerId: string,
    query: OfflineAlertQueryDto,
    requireSource: (source: DataSource) => void,
  ) {
    return this.database.$transaction(
      async (tx) => {
        const device = await this.ownedDevice(tx, plotId, query.deviceId, ownerId);
        requireSource(device.source);
        if (device.source !== query.source)
          throw new NotFoundException('Dispositivo no encontrado');
        const where = { plotId, deviceId: device.id, source: device.source };
        const items = await tx.offlineAlert.findMany({
          where,
          orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
          skip: query.offset,
          take: query.limit,
        });
        const total = await tx.offlineAlert.count({ where });
        return {
          items: items.map(toOfflineAlert),
          total,
          offset: query.offset,
          limit: query.limit,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async acknowledge(
    plotId: string,
    alertId: string,
    ownerId: string,
    requireSource: (source: DataSource) => void,
  ) {
    return this.database.$transaction(async (tx) => {
      const initial = await tx.offlineAlert.findFirst({
        where: {
          id: alertId,
          plotId,
          plot: { ownerId, archivedAt: null, owner: { isActive: true } },
        },
        select: { deviceId: true },
      });
      if (!initial) throw new NotFoundException('Alerta no encontrada');
      await tx.$queryRaw`SELECT id FROM devices WHERE id = ${initial.deviceId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT p.id FROM plots p JOIN users u ON u.id = p.owner_id WHERE p.id = ${plotId}::uuid FOR SHARE OF p, u`;
      const device = await this.ownedDevice(tx, plotId, initial.deviceId, ownerId);
      requireSource(device.source);
      const alert = await tx.offlineAlert.findFirst({
        where: { id: alertId, plotId, deviceId: device.id, source: device.source },
      });
      if (!alert) throw new NotFoundException('Alerta no encontrada');
      if (alert.acknowledgedAt) return toOfflineAlert(alert);
      const stored = await tx.offlineAlert.update({
        where: { id: alert.id },
        data: {
          acknowledgedAt: new Date(),
          acknowledgedBy: ownerId,
        },
      });
      return toOfflineAlert(stored);
    });
  }
}
