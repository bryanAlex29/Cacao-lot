import { defineConfig } from 'prisma/config';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

try {
  loadEnvFile(resolve(__dirname, '../.env'));
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
