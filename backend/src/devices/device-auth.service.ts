import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { DataSource } from '@cacaosmart/contracts';
import { PrismaService } from '../database/prisma.service';
import { SourcePolicy } from '../integrations/source-policy.service';

export interface AuthenticatedDevice {
  id: string;
  plotId: string;
  source: DataSource;
  credentialHash: string; // Solo contexto interno, nunca respuesta ni log.
}

@Injectable()
export class DeviceAuthService {
  constructor(
    private readonly database: PrismaService,
    private readonly sources: SourcePolicy,
  ) {}

  async authenticate(
    headers: Record<string, string | string[] | undefined>,
  ): Promise<AuthenticatedDevice> {
    const id = headers['x-device-id'];
    const key = headers['x-device-key'];
    if (
      typeof id !== 'string' ||
      !isUUID(id, '4') ||
      typeof key !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(key)
    )
      throw new UnauthorizedException('Credencial de dispositivo inválida');
    const hash = createHash('sha256').update(key).digest('hex');
    const device = await this.database.device.findUnique({
      where: { id },
      select: {
        id: true,
        plotId: true,
        source: true,
        credentialHash: true,
        isActive: true,
        plot: { select: { archivedAt: true, owner: { select: { isActive: true } } } },
      },
    });
    const stored =
      device && /^[a-f0-9]{64}$/i.test(device.credentialHash)
        ? device.credentialHash
        : '0'.repeat(64);
    const valid = timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(stored, 'hex'));
    if (
      !valid ||
      !device?.isActive ||
      device.plot.archivedAt ||
      !device.plot.owner.isActive ||
      !this.sources.allows(device.source)
    )
      throw new UnauthorizedException('Credencial de dispositivo inválida');
    return { id: device.id, plotId: device.plotId, source: device.source, credentialHash: hash };
  }
}
