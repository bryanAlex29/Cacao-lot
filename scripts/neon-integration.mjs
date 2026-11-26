import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { neonSource, temporaryNeonDatabase } from './neon-postgres.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let admin;
function run(path, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, path), ...args], {
      cwd,
      env,
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
    child.once('error', () => reject(new Error('No se pudo iniciar la prueba aislada')));
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error('La suite aislada no pasó')),
    );
  });
}
try {
  const args = process.argv.slice(2);
  if (
    args.some((arg) => arg !== '--browser' && !/^--suite=[a-z-]+\.integration\.ts$/.test(arg)) ||
    args.filter((arg) => arg.startsWith('--suite=')).length > 1 ||
    (args.includes('--browser') && args.some((arg) => arg.startsWith('--suite=')))
  )
    throw new Error('Uso: test:integration:neon [--browser | --suite=nombre.integration.ts]');
  loadEnvFile(join(root, '.env'));
  const source = neonSource(process.env);
  const browser = args.includes('--browser');
  const selected = args.find((arg) => arg.startsWith('--suite='))?.slice(8);
  const suites = (await readdir(join(root, 'backend/test')))
    .filter((name) => name.endsWith('.integration.ts'))
    .filter((name) =>
      selected
        ? name === selected
        : browser
          ? name === 'dashboard.integration.ts'
          : name !== 'dashboard.integration.ts',
    )
    .sort();
  if (!suites.length) throw new Error('Suite no encontrada');
  let executable = process.env.BROWSER_EXECUTABLE_PATH;
  if (browser && !executable) {
    for (const candidate of [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]) {
      try {
        await access(candidate);
        executable = candidate;
        break;
      } catch {
        /* Next browser. */
      }
    }
    if (!executable) throw new Error('Configurar BROWSER_EXECUTABLE_PATH para la prueba real');
  }
  admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: source.href, connectionTimeoutMillis: 20000 }),
    log: [],
  });
  for (const suite of suites) {
    const name = `cacaosmart_test_${randomBytes(8).toString('hex')}`;
    const target = temporaryNeonDatabase(name, source, 'cacaosmart_test_');
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      TELEMETRY_MODE: 'demo',
      THINGSPEAK_IMPORT_ENABLED: 'false',
      WEATHER_PROVIDER: 'disabled',
      DATABASE_URL: target.href,
      TEST_DATABASE_NAME: name,
      JWT_SECRET: randomBytes(32).toString('hex'),
      ...(executable ? { BROWSER_EXECUTABLE_PATH: executable } : {}),
    };
    let created = false;
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      created = true;
      await run(
        'node_modules/prisma/build/index.js',
        ['migrate', 'deploy'],
        join(root, 'backend'),
        env,
      );
      await run(
        'node_modules/jest/bin/jest.js',
        ['--config', 'jest.integration.cjs', '--runInBand', '--runTestsByPath', `test/${suite}`],
        join(root, 'backend'),
        env,
      );
    } finally {
      if (created) {
        temporaryNeonDatabase(name, source, 'cacaosmart_test_');
        await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
        console.log('Base temporal de pruebas eliminada; base principal sin fixtures.');
      }
    }
  }
} catch (error) {
  console.error(
    error instanceof Error && !('code' in error) && !error.name.startsWith('Prisma')
      ? error.message
      : 'Falló la prueba Neon; revisar bases temporales; detalles privados omitidos',
  );
  process.exitCode = 1;
} finally {
  if (admin) await admin.$disconnect();
}
