import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  DataSource,
  MoisturePolicyResponse,
  SoilMoistureAlert,
  SoilSensorId,
} from '@cacaosmart/contracts';
import { PrismaService } from '../../database/prisma.service';
import { advanceMoisture, resetSequence } from './moisture.rules';
import { MoistureAlertQueryDto, PutMoisturePolicyDto } from './moisture.dto';

const include = {
  device: { include: { plot: { include: { owner: { select: { isActive: true, role: true } } } } } },
  thresholds: true,
  moisturePolicy: true,
  moistureState: true,
} satisfies Prisma.SensorInclude;
type Sensor = Prisma.SensorGetPayload<{ include: typeof include }>;
type Alert = Prisma.MoistureAlertGetPayload<Record<string, never>>;
export const moistureAlertResponse = (row: Alert): SoilMoistureAlert => ({
  id: row.id,
  sensorId: row.sensorId,
  deviceId: row.deviceId,
  plotId: row.plotId,
  source: row.source,
  code: row.code as SoilSensorId,
  type: 'LOW_SOIL_MOISTURE',
  minValue: row.minValue,
  maxValue: row.maxValue,
  recoveryMarginPct: row.recoveryMarginPct,
  thresholdVersion: row.thresholdVersion,
  policyVersion: row.policyVersion,
  firstLowAt: row.firstLowAt.toISOString(),
  confirmedAt: row.confirmedAt.toISOString(),
  triggerValue: row.triggerValue,
  detectedAt: row.detectedAt.toISOString(),
  closedAt: row.closedAt?.toISOString() ?? null,
  closeReason: row.closeReason as SoilMoistureAlert['closeReason'],
  acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
});

@Injectable()
export class MoistureRepository {
  constructor(private readonly db: PrismaService) {}

  private soil(sensor: Sensor): void {
    if (
      !['soil_1', 'soil_2', 'soil_3'].includes(sensor.code) ||
      sensor.variable !== 'SOIL_MOISTURE' ||
      sensor.unit !== 'PERCENT'
    )
      throw new BadRequestException('Esta política solo admite las sondas de suelo A/B/C');
  }
  private async owned(tx: Prisma.TransactionClient, id: string, ownerId: string): Promise<Sensor> {
    const sensor = await tx.sensor.findFirst({
      where: { id, device: { plot: { ownerId, archivedAt: null, owner: { isActive: true } } } },
      include,
    });
    if (!sensor) throw new NotFoundException('Sensor no encontrado');
    this.soil(sensor);
    return sensor;
  }
  private async response(
    tx: Prisma.TransactionClient,
    sensor: Sensor,
  ): Promise<MoisturePolicyResponse> {
    const { device, moisturePolicy: policy } = sensor;
    const range = sensor.thresholds[0];
    const latest =
      device.source === 'real'
        ? await tx.soilReading.findFirst({
            where: { sensorId: sensor.id },
            orderBy: [
              { reading: { effectiveAt: 'desc' } },
              { reading: { ingestionOrder: 'desc' } },
            ],
            select: { quality: true },
          })
        : null;
    const status =
      !sensor.enabled || !device.isActive
        ? 'disabled'
        : !range
          ? 'no_range'
          : !policy
            ? 'unconfigured'
            : range.minValue + policy.recoveryMarginPct > range.maxValue
              ? 'incompatible_margin'
              : device.source === 'real' && latest?.quality !== 'valid'
                ? 'real_uncalibrated'
                : 'ready';
    return {
      sensorId: sensor.id,
      deviceId: sensor.deviceId,
      plotId: device.plotId,
      source: device.source,
      code: sensor.code as SoilSensorId,
      status,
      range: range
        ? {
            minValue: range.minValue,
            maxValue: range.maxValue,
            version: range.version,
            effectiveAt: range.effectiveAt.toISOString(),
          }
        : null,
      policy: policy
        ? {
            recoveryMarginPct: policy.recoveryMarginPct,
            version: policy.version,
            updatedAt: policy.updatedAt.toISOString(),
          }
        : null,
    };
  }
  get(id: string, ownerId: string, requireSource: (source: DataSource) => void) {
    return this.db.$transaction(
      async (tx) => {
        const sensor = await this.owned(tx, id, ownerId);
        requireSource(sensor.device.source);
        return this.response(tx, sensor);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  put(
    id: string,
    ownerId: string,
    input: PutMoisturePolicyDto,
    requireSource: (source: DataSource) => void,
  ) {
    return this.db.$transaction(async (tx) => {
      const initial = await this.owned(tx, id, ownerId);
      await tx.$queryRaw`SELECT id FROM devices WHERE id = ${initial.deviceId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT p.id FROM plots p JOIN users u ON u.id = p.owner_id WHERE p.id = ${initial.device.plotId}::uuid FOR SHARE OF p, u`;
      await tx.$queryRaw`SELECT id FROM sensors WHERE id = ${id}::uuid FOR UPDATE`;
      const sensor = await this.owned(tx, id, ownerId);
      requireSource(sensor.device.source);
      if (sensor.device.plot.owner.role !== 'ADMIN')
        throw new ForbiddenException('Permisos insuficientes');
      if (!sensor.enabled || !sensor.device.isActive)
        throw new NotFoundException('Sensor no habilitado');
      if (sensor.deviceId !== initial.deviceId || sensor.device.plotId !== initial.device.plotId)
        throw new ConflictException('El sensor cambió de ubicación');
      const range = sensor.thresholds[0],
        previous = sensor.moisturePolicy;
      if (!range) throw new BadRequestException('Configura primero el rango de esta sonda');
      if (
        range.version !== input.expectedThresholdVersion ||
        (previous?.version ?? 0) !== input.expectedVersion
      )
        throw new ConflictException(
          'Cambió el rango o margen; consulta su versión actual antes de guardar',
        );
      if (
        !Number.isFinite(input.recoveryMarginPct) ||
        input.recoveryMarginPct <= 0 ||
        range.minValue + input.recoveryMarginPct > range.maxValue
      )
        throw new BadRequestException(
          'El margen debe ser positivo y mínimo + margen no puede superar el máximo',
        );
      if (previous?.recoveryMarginPct === input.recoveryMarginPct) return this.response(tx, sensor);
      const now = new Date();
      const data = {
        recoveryMarginPct: input.recoveryMarginPct,
        version: (previous?.version ?? 0) + 1,
        updatedAt: now,
        updatedBy: ownerId,
      };
      const policy = await tx.moistureAlertPolicy.upsert({
        where: { sensorId: id },
        create: { sensorId: id, ...data },
        update: data,
      });
      await tx.moisturePolicyAudit.create({
        data: {
          sensorId: id,
          actorId: ownerId,
          version: policy.version,
          changedAt: now,
          oldValue: previous
            ? {
                recoveryMarginPct: previous.recoveryMarginPct,
                version: previous.version,
                updatedAt: previous.updatedAt.toISOString(),
              }
            : Prisma.DbNull,
          newValue: {
            recoveryMarginPct: policy.recoveryMarginPct,
            version: policy.version,
            updatedAt: now.toISOString(),
            thresholdVersion: range.version,
          },
        },
      });
      await tx.moistureAlert.updateMany({
        where: { sensorId: id, closedAt: null },
        data: { closedAt: now, closeReason: 'CONFIGURATION_CHANGED' },
      });
      const latest = await tx.reading.findFirst({
        where: { deviceId: sensor.deviceId },
        orderBy: { ingestionOrder: 'desc' },
        select: { ingestionOrder: true },
      });
      const state = {
        policyVersion: policy.version,
        thresholdVersion: range.version,
        lastOrder: latest?.ingestionOrder ?? 0n,
        lastEffectiveAt: null,
        ...resetSequence(),
      };
      await tx.moistureAlertState.upsert({
        where: { sensorId: id },
        create: { sensorId: id, ...state },
        update: state,
      });
      return this.response(tx, { ...sensor, moisturePolicy: policy });
    });
  }

  candidates(sources: DataSource[], after?: string) {
    return this.db.sensor.findMany({
      where: {
        code: { in: ['soil_1', 'soil_2', 'soil_3'] },
        device: { source: { in: sources } },
        ...(after ? { id: { gt: after } } : {}),
        OR: [{ moisturePolicy: { isNot: null } }, { moistureAlerts: { some: { closedAt: null } } }],
      },
      orderBy: { id: 'asc' },
      take: 50,
      select: { id: true },
    });
  }
  /** Durable cursor and alert transitions commit together; ingestion remains independent. */
  async synchronize(id: string, allowed: (source: DataSource) => boolean, clock?: Date) {
    return this.db.$transaction(
      async (tx) => {
        const initial = await tx.sensor.findUnique({ where: { id }, select: { deviceId: true } });
        if (!initial) return;
        await tx.$queryRaw`SELECT id FROM devices WHERE id = ${initial.deviceId}::uuid FOR UPDATE`;
        const location = await tx.device.findUniqueOrThrow({
          where: { id: initial.deviceId },
          select: { plotId: true },
        });
        await tx.$queryRaw`SELECT p.id FROM plots p JOIN users u ON u.id = p.owner_id WHERE p.id = ${location.plotId}::uuid FOR SHARE OF p, u`;
        await tx.$queryRaw`SELECT id FROM sensors WHERE id = ${id}::uuid FOR UPDATE`;
        const sensor = await tx.sensor.findUnique({ where: { id }, include });
        if (!sensor || sensor.deviceId !== initial.deviceId || !allowed(sensor.device.source))
          return;
        this.soil(sensor);
        const now = clock ?? new Date(),
          device = sensor.device,
          range = sensor.thresholds[0],
          policy = sensor.moisturePolicy;
        let active = await tx.moistureAlert.findFirst({ where: { sensorId: id, closedAt: null } });
        const enabled =
          sensor.enabled &&
          device.isActive &&
          !device.plot.archivedAt &&
          device.plot.owner.isActive;
        const compatible = !!(
          range &&
          policy &&
          range.minValue + policy.recoveryMarginPct <= range.maxValue
        );
        const versionChanged = !!(
          sensor.moistureState &&
          (sensor.moistureState.policyVersion !== policy?.version ||
            sensor.moistureState.thresholdVersion !== (range?.version ?? 0))
        );
        if (active && (!enabled || !compatible || versionChanged)) {
          await tx.moistureAlert.update({
            where: { id: active.id },
            data: {
              closedAt: now,
              closeReason: enabled ? 'CONFIGURATION_CHANGED' : 'MONITORING_STOPPED',
            },
          });
          active = null;
        }
        if (!policy) return;
        const initialState = {
          sensorId: id,
          policyVersion: policy.version,
          thresholdVersion: range?.version ?? 0,
          lastOrder: 0n,
          lastEffectiveAt: null,
          ...resetSequence(),
        };
        let state = sensor.moistureState ?? initialState;
        if (versionChanged || !enabled || !compatible)
          state = {
            ...state,
            ...resetSequence(),
            policyVersion: policy.version,
            thresholdVersion: range?.version ?? 0,
          };
        const rows = await tx.reading.findMany({
          where: {
            deviceId: sensor.deviceId,
            source: device.source,
            ingestionOrder: { gt: state.lastOrder },
          },
          orderBy: { ingestionOrder: 'asc' },
          take: 100,
          include: { soilReadings: { where: { sensorId: id } } },
        });
        const epoch = new Date(
          Math.max(policy.updatedAt.getTime(), range?.effectiveAt.getTime() ?? 0),
        );
        for (const row of rows) {
          state.lastOrder = row.ingestionOrder;
          if (!enabled || !compatible || !range) continue;
          const soil = row.soilReadings[0];
          const result = advanceMoisture(
            state,
            {
              time: row.effectiveAt,
              value: soil?.moisturePct ?? null,
              quality: soil?.quality ?? 'missing',
            },
            {
              now,
              epoch,
              maxGapMs: device.expectedIntervalSeconds * 2000,
              source: device.source,
              min: range.minValue,
              margin: policy.recoveryMarginPct,
              active: !!active,
            },
          );
          if (row.receivedAt <= epoch) {
            Object.assign(state, resetSequence());
            continue;
          }
          if (result.action === 'open') {
            active = await tx.moistureAlert.create({
              data: {
                sensorId: id,
                deviceId: sensor.deviceId,
                plotId: device.plotId,
                source: device.source,
                code: sensor.code,
                minValue: range.minValue,
                maxValue: range.maxValue,
                recoveryMarginPct: policy.recoveryMarginPct,
                thresholdVersion: range.version,
                policyVersion: policy.version,
                firstLowAt: result.firstLowAt!,
                confirmedAt: row.effectiveAt,
                triggerValue: soil!.moisturePct!,
                triggerEventId: row.eventId,
                detectedAt: now,
              },
            });
          } else if (result.action === 'recover' && active) {
            await tx.moistureAlert.update({
              where: { id: active.id },
              data: { closedAt: now, closeReason: 'RECOVERED' },
            });
            active = null;
          }
          state = {
            ...state,
            lastEffectiveAt: result.lastEffectiveAt,
            lowCount: result.lowCount,
            recoveryCount: result.recoveryCount,
            firstLowAt: result.firstLowAt,
          };
          if (result.action !== 'none') Object.assign(state, resetSequence());
        }
        if (
          state.lastEffectiveAt &&
          now.getTime() - state.lastEffectiveAt.getTime() > device.expectedIntervalSeconds * 2000
        )
          Object.assign(state, resetSequence());
        const data = {
          policyVersion: state.policyVersion,
          thresholdVersion: state.thresholdVersion,
          lastOrder: state.lastOrder,
          lastEffectiveAt: state.lastEffectiveAt,
          lowCount: state.lowCount,
          recoveryCount: state.recoveryCount,
          firstLowAt: state.firstLowAt,
        };
        await tx.moistureAlertState.upsert({
          where: { sensorId: id },
          create: { sensorId: id, ...data },
          update: data,
        });
      },
      { timeout: 10000 },
    );
  }

  private async ownedDevice(
    tx: Prisma.TransactionClient,
    plotId: string,
    deviceId: string,
    ownerId: string,
  ) {
    const device = await tx.device.findFirst({
      where: {
        id: deviceId,
        plotId,
        plot: { ownerId, archivedAt: null, owner: { isActive: true } },
      },
      select: { id: true, source: true },
    });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    return device;
  }
  list(
    plotId: string,
    ownerId: string,
    query: MoistureAlertQueryDto,
    requireSource: (source: DataSource) => void,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const device = await this.ownedDevice(tx, plotId, query.deviceId, ownerId);
        requireSource(device.source);
        if (device.source !== query.source)
          throw new NotFoundException('Dispositivo no encontrado');
        const where = { deviceId: device.id, plotId, source: device.source };
        const items = await tx.moistureAlert.findMany({
          where,
          orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
          skip: query.offset,
          take: query.limit,
        });
        return {
          items: items.map(moistureAlertResponse),
          total: await tx.moistureAlert.count({ where }),
          offset: query.offset,
          limit: query.limit,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  acknowledge(
    plotId: string,
    alertId: string,
    ownerId: string,
    requireSource: (source: DataSource) => void,
  ) {
    return this.db.$transaction(async (tx) => {
      const initial = await tx.moistureAlert.findFirst({
        where: {
          id: alertId,
          plotId,
          plot: { ownerId, archivedAt: null, owner: { isActive: true } },
        },
      });
      if (!initial) throw new NotFoundException('Alerta no encontrada');
      await tx.$queryRaw`SELECT id FROM devices WHERE id = ${initial.deviceId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT p.id FROM plots p JOIN users u ON u.id = p.owner_id WHERE p.id = ${plotId}::uuid FOR SHARE OF p, u`;
      const device = await this.ownedDevice(tx, plotId, initial.deviceId, ownerId);
      requireSource(device.source);
      const alert = await tx.moistureAlert.findFirst({
        where: { id: alertId, plotId, deviceId: device.id, source: device.source },
      });
      if (!alert) throw new NotFoundException('Alerta no encontrada');
      if (alert.acknowledgedAt) return moistureAlertResponse(alert);
      return moistureAlertResponse(
        await tx.moistureAlert.update({
          where: { id: alertId },
          data: { acknowledgedAt: new Date(), acknowledgedBy: ownerId },
        }),
      );
    });
  }
}
