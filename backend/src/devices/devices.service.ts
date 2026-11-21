import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PageDto } from '../common/page.dto';
import { PlotsService } from '../plots/plots.service';
import { DevicesRepository } from './devices.repository';
import { CreateDeviceDto } from './device.dto';
import { SourcePolicy } from '../integrations/source-policy.service';
import { connectionStatus } from './connection-status';

@Injectable()
export class DevicesService {
  constructor(
    private readonly plots: PlotsService,
    private readonly devices: DevicesRepository,
    private readonly sources: SourcePolicy,
  ) {}

  async list(plotId: string, ownerId: string, page: PageDto) {
    await this.plots.requireOwned(plotId, ownerId);
    const result = await this.devices.list(plotId, ownerId, page);
    return {
      ...result,
      items: result.items.map((device) => ({ ...device, status: connectionStatus(device) })),
    };
  }

  async requireOwned(id: string, plotId: string, ownerId: string) {
    const device = await this.devices.findOwned(id, plotId, ownerId);
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    return { ...device, status: connectionStatus(device) };
  }

  async create(plotId: string, ownerId: string, input: CreateDeviceDto) {
    await this.plots.requireOwned(plotId, ownerId);
    this.sources.require(input.source);
    const deviceKey = randomBytes(32).toString('hex');
    const credentialHash = createHash('sha256').update(deviceKey).digest('hex');
    const device = await this.devices.create(plotId, ownerId, input, credentialHash);
    return { ...device, status: connectionStatus(device), deviceKey };
  }

  async update(id: string, plotId: string, ownerId: string, isActive: boolean) {
    if ((await this.devices.update(id, plotId, ownerId, isActive)).count !== 1)
      throw new NotFoundException('Dispositivo no encontrado');
    return this.requireOwned(id, plotId, ownerId);
  }
}
