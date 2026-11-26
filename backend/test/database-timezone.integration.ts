import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';
import type { Environment } from '../src/config/environment';

describe('Fechas UTC independientes de la zona horaria del servidor PostgreSQL', () => {
  let db: PrismaService;

  beforeAll(async () => {
    const url = process.env['DATABASE_URL'] ?? '';
    const name = new URL(url).pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal del runner');
    const config = new ConfigService<Environment, true>({ DATABASE_URL: url });
    db = new PrismaService(config);
    // Only this runner-generated database is changed, never the server or source.
    // Reopen the pool so the test detects regressions even on a UTC-default server.
    await db.$executeRawUnsafe(`ALTER DATABASE "${name}" SET timezone TO 'America/Bogota'`);
    await db.$disconnect();
    db = new PrismaService(config);
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it('cada conexión del pool conserva el instante UTC en SQL y en Date', async () => {
    const instant = new Date('2026-10-29T00:00:00.123Z');
    const results = await Promise.all(
      Array.from(
        { length: 5 },
        () =>
          db.$queryRaw<{ timezone: string; instant: Date; utc: string }[]>`
          SELECT current_setting('TimeZone') AS timezone,
            ${instant}::timestamptz AS instant,
            to_char(${instant}::timestamptz AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS utc
        `,
      ),
    );
    for (const [row] of results) {
      expect(row.timezone).toBe('UTC');
      expect(row.instant.toISOString()).toBe(instant.toISOString());
      expect(row.utc).toBe(instant.toISOString());
    }
  });
});
