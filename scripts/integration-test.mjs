import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const root = fileURLToPath(new URL('../', import.meta.url));
loadEnvFile(new URL('../.env', import.meta.url));
let source;
try {
  source = new URL(process.env.DATABASE_URL);
} catch {
  throw new Error('DATABASE_URL local inválida; no se inició la prueba.');
}
if (
  process.env.NODE_ENV === 'production' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)
) {
  throw new Error('Las pruebas requieren PostgreSQL local y un entorno no productivo.');
}
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: source.toString() }),
  log: [],
});

function run(path, args, cwd, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL(path, import.meta.url)), ...args],
      { cwd, env: environment, stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('La verificación de integración falló')),
    );
  });
}

try {
  if (process.argv.slice(2).some((arg) => arg !== '--browser'))
    throw new Error('Argumentos de prueba inválidos');
  const browser = process.argv.includes('--browser');
  const suites = (await readdir(new URL('../backend/test/', import.meta.url)))
    .filter((name) => name.endsWith('.integration.ts'))
    .filter((name) =>
      browser ? name === 'dashboard.integration.ts' : name !== 'dashboard.integration.ts',
    )
    .sort();
  for (const suite of suites) {
    const databaseName = `cacaosmart_test_${randomBytes(8).toString('hex')}`;
    const target = new URL(source);
    target.pathname = `/${databaseName}`;
    const environment = {
      ...process.env,
      NODE_ENV: 'test',
      TELEMETRY_MODE: 'demo',
      THINGSPEAK_IMPORT_ENABLED: 'false',
      WEATHER_PROVIDER: 'disabled',
      DATABASE_URL: target.toString(),
      TEST_DATABASE_NAME: databaseName,
      JWT_SECRET: randomBytes(32).toString('hex'),
    };
    let created = false;
    try {
      // Nombre generado internamente, restringido a este prefijo; nunca se recibe por CLI.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
      created = true;
      await run(
        '../node_modules/prisma/build/index.js',
        ['migrate', 'deploy'],
        `${root}backend`,
        environment,
      );
      await run(
        '../node_modules/jest/bin/jest.js',
        ['--config', 'jest.integration.cjs', '--runInBand', '--runTestsByPath', `test/${suite}`],
        `${root}backend`,
        environment,
      );
    } finally {
      if (created) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
        console.log('Base temporal de pruebas eliminada; base principal sin cambios.');
      }
    }
  }
} catch {
  console.error(
    'Pruebas de integración fallidas; revisar los resultados anteriores y posibles bases temporales.',
  );
  process.exitCode = 1;
} finally {
  await admin.$disconnect();
}
