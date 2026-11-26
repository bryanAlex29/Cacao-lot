import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Environment } from '../config/environment';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Environment, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        // The adapter serializes DateTime without an offset and normalizes returned
        // timestamptz offsets as UTC. Every pooled session must therefore use UTC,
        // independently of the PostgreSQL server's local timezone.
        options: '-c timezone=UTC',
        connectionTimeoutMillis: 3000,
        query_timeout: 3000,
        max: 5,
      }),
      log: [],
    });
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
