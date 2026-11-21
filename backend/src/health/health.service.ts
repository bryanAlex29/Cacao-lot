import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { LiveHealthDto, ReadyHealthDto } from './health.dto';

@Injectable()
export class HealthService {
  constructor(private readonly database: PrismaService) {}

  live(): LiveHealthDto {
    return { status: 'ok', service: 'cacaosmart-api' };
  }

  async ready(): Promise<ReadyHealthDto> {
    try {
      await this.database.ping();
      return { ...this.live(), database: 'up' };
    } catch {
      // No propagar errores de Prisma: pueden incluir host, credenciales o SQL.
      throw new ServiceUnavailableException({ status: 'unavailable', database: 'down' });
    }
  }
}
