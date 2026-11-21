import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { PageDto } from '../common/page.dto';
import { CreateDeviceDto } from './device.dto';

const deviceSelect = {
  id: true,
  plotId: true,
  serial: true,
  source: true,
  expectedIntervalSeconds: true,
  status: true,
  isActive: true,
  lastSeenAt: true,
  createdAt: true,
  sensors: {
    select: { id: true, code: true, variable: true, unit: true, zone: true, enabled: true },
    orderBy: { code: 'asc' as const },
  },
} satisfies Prisma.DeviceSelect;

const sensors: Prisma.SensorCreateWithoutDeviceInput[] = [
  { code: 'soil_1', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'A' },
  { code: 'soil_2', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'B' },
  { code: 'soil_3', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'C' },
  { code: 'temperatureC', variable: 'TEMPERATURE', unit: 'CELSIUS' },
  { code: 'airHumidityPct', variable: 'AIR_HUMIDITY', unit: 'PERCENT' },
  { code: 'rainDetected', variable: 'RAIN_DETECTED', unit: 'BOOLEAN' },
];

@Injectable()
export class DevicesRepository {
  constructor(private readonly database: PrismaService) {}

  async list(plotId: string, ownerId: string, page: PageDto) {
    const where = { plotId, plot: { ownerId, archivedAt: null } };
    const [items, total] = await this.database.$transaction([
      this.database.device.findMany({
        where,
        select: deviceSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: page.limit,
        skip: page.offset,
      }),
      this.database.device.count({ where }),
    ]);
    return { items, total, limit: page.limit, offset: page.offset };
  }

  findOwned(id: string, plotId: string, ownerId: string) {
    return this.database.device.findFirst({
      where: { id, plotId, plot: { ownerId, archivedAt: null } },
      select: deviceSelect,
    });
  }

  async create(plotId: string, ownerId: string, input: CreateDeviceDto, credentialHash: string) {
    const id = randomUUID();
    try {
      // Escritura anidada atómica: dispositivo y seis sensores se crean juntos.
      const plot = await this.database.plot.update({
        where: { id: plotId, ownerId, archivedAt: null },
        data: {
          devices: { create: { id, ...input, credentialHash, sensors: { create: sensors } } },
        },
        select: { devices: { where: { id }, select: deviceSelect } },
      });
      return plot.devices[0];
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('No se pudo registrar el dispositivo con esos datos');
      throw error;
    }
  }

  update(id: string, plotId: string, ownerId: string, isActive: boolean) {
    return this.database.device.updateMany({
      where: { id, plotId, plot: { ownerId, archivedAt: null } },
      data: { isActive },
    });
  }
}
