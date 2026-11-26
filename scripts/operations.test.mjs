import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import {
  healthBase,
  inspectOperationConfig,
  inspectOperationBackup,
  operationOptions,
  probeOperationHealth,
  readOperationEnvironment,
} from './operations-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
require('ts-node').register({ project: join(root, 'backend/tsconfig.json') });
const { validateEnvironment } = require('../backend/src/config/environment.ts');
const execute = promisify(execFile);
const privateValue = 'not-to-be-printed-private-value';
const local = {
  DATABASE_URL: `postgresql://ops:${privateValue}@127.0.0.1:5433/ops`,
  JWT_SECRET: '0123456789abcdef'.repeat(4),
};
const production = {
  ...local,
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  CORS_ORIGIN: 'https://cacao.example.ec',
  DATABASE_URL: `postgresql://ops:${privateValue}@db.example.invalid/ops?sslmode=verify-full`,
  TELEMETRY_MODE: 'real',
  AI_PROVIDER: 'disabled',
  WEATHER_PROVIDER: 'disabled',
  IMAGE_STORAGE_PATH: resolve(root, '..', 'private-operations-images'),
};
const inspect = (input, requested = false) =>
  inspectOperationConfig(input, { validate: validateEnvironment, production: requested, root });

async function temporary(t) {
  await mkdir(join(root, '.local'), { recursive: true });
  const directory = await mkdtemp(join(root, '.local', 'operations-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('reutiliza validación real, no muta entorno ni promete producción por configuración', () => {
  const before = { ...local };
  const processBefore = process.env.DATABASE_URL;
  const result = inspect(local);
  assert.equal(result.configurationPassed, true);
  assert.equal(result.profile, 'local');
  assert.equal(result.productionReady, false);
  assert.equal(result.externalServicesContacted, false);
  assert.ok(result.manualChecks.includes('proxy_client_ip_and_rate_limits'));
  assert.deepEqual(local, before);
  assert.equal(process.env.DATABASE_URL, processBefore);
  assert.ok(!JSON.stringify(result).includes(privateValue));
});

test('candidato producción exige controles pero conserva aprobaciones manuales pendientes', () => {
  const result = inspect(production);
  assert.equal(result.configurationPassed, true);
  assert.equal(result.profile, 'production-candidate');
  assert.equal(result.productionReady, false);
  assert.ok(result.manualChecks.length > 0);
});

for (const [name, extra, check] of [
  ['entorno local forzado como producción', { NODE_ENV: 'development' }, 'production_mode'],
  ['HTTP público', { CORS_ORIGIN: 'http://cacao.example.ec' }, 'public_https_origin'],
  ['dominio de plantilla', { CORS_ORIGIN: 'https://cacao.example.invalid' }, 'public_https_origin'],
  ['dominio reservado', { CORS_ORIGIN: 'https://example.com' }, 'public_https_origin'],
  ['origen local', { CORS_ORIGIN: 'https://localhost' }, 'public_https_origin'],
  ['API pública', { HOST: '0.0.0.0' }, 'api_loopback_only'],
  ['DEMO', { TELEMETRY_MODE: 'demo' }, 'real_telemetry_only'],
  ['IA mock', { AI_PROVIDER: 'mock' }, 'openai_disabled'],
  [
    'clima sin autorización nueva',
    { WEATHER_PROVIDER: 'open-meteo', WEATHER_NONCOMMERCIAL_CONFIRMED: 'true' },
    'weather_disabled_until_authorized',
  ],
  [
    'TLS sin verificar',
    { DATABASE_URL: local.DATABASE_URL.replace('127.0.0.1', 'db.invalid') },
    'database_transport_policy',
  ],
  [
    'TLS ambiguo',
    { DATABASE_URL: `${production.DATABASE_URL}&sslmode=disable` },
    'database_transport_policy',
  ],
  [
    'parámetros que alteran sesión',
    { DATABASE_URL: `${production.DATABASE_URL}&options=unsafe` },
    'database_transport_policy',
  ],
  ['secreto ilustrativo', { JWT_SECRET: 'a'.repeat(64) }, 'non_placeholder_jwt'],
  [
    'imágenes relativas',
    { IMAGE_STORAGE_PATH: '.local/images' },
    'explicit_external_image_storage',
  ],
  [
    'imágenes dentro de release',
    { IMAGE_STORAGE_PATH: join(root, '.local/images') },
    'explicit_external_image_storage',
  ],
  [
    'imágenes en antecesor',
    { IMAGE_STORAGE_PATH: resolve(root, '..') },
    'explicit_external_image_storage',
  ],
  [
    'contraseña bootstrap retenida',
    { BOOTSTRAP_ADMIN_PASSWORD: privateValue },
    'bootstrap_credentials_absent',
  ],
]) {
  test(`producción bloquea ${name} sin revelar valores`, () => {
    const result = inspect({ ...production, ...extra }, true);
    assert.equal(result.configurationPassed, false);
    assert.equal(result.checks.find((item) => item.id === check)?.passed, false);
    assert.ok(!JSON.stringify(result).includes(privateValue));
  });
}

test('argumentos estrictos: sin repetición, acciones implícitas ni comandos arbitrarios', () => {
  assert.deepEqual(operationOptions([]), { file: '.env', production: false });
  assert.deepEqual(operationOptions(['--env', '.local/production.env', '--production']), {
    file: '.local/production.env',
    production: true,
  });
  for (const args of [
    ['--env'],
    ['--production', '--production'],
    ['--deploy'],
    ['--env', '.env', '--env', '.env'],
    ['--env', '--production'],
  ])
    assert.throws(() => operationOptions(args));
});

test('lector acotado privado rechaza escape, directorios, archivos grandes y enlaces', async (t) => {
  const dir = await temporary(t);
  const file = join(dir, 'candidate.env');
  const content = `DATABASE_URL=${local.DATABASE_URL}\nJWT_SECRET=${local.JWT_SECRET}\n`;
  await writeFile(file, content);
  assert.deepEqual(await readOperationEnvironment(root, file), local);
  assert.equal(await readFile(file, 'utf8'), content);
  await assert.rejects(readOperationEnvironment(root, 'package.json'));
  await assert.rejects(readOperationEnvironment(root, resolve(root, '..', 'outside.env')));
  await assert.rejects(readOperationEnvironment(root, dir));
  await writeFile(join(dir, 'large.env'), 'x'.repeat(65537));
  await assert.rejects(readOperationEnvironment(root, join(dir, 'large.env')));
  await mkdir(join(dir, 'original'));
  await writeFile(join(dir, 'original', 'candidate.env'), content);
  try {
    await symlink(join(dir, 'original'), join(dir, 'linked'), 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) return t.diagnostic('Enlace no permitido por SO');
    throw error;
  }
  await assert.rejects(readOperationEnvironment(root, join(dir, 'linked', 'candidate.env')));
});

test('salud solo acepta origen explícito sin credenciales/rutas; HTTP solo loopback', () => {
  assert.equal(healthBase(['--base-url', 'http://127.0.0.1:3100']), 'http://127.0.0.1:3100');
  assert.equal(healthBase(['--base-url', 'https://cacao.example.ec']), 'https://cacao.example.ec');
  for (const args of [
    [],
    ['--base-url'],
    ['--base-url', 'http://public.invalid'],
    ['--base-url', `https://user:${privateValue}@public.invalid`],
    ['--base-url', 'https://public.invalid/api/v1'],
    ['--base-url', 'https://public.invalid?token=private'],
    ['--base-url', 'https://public.invalid#private'],
    ['--base-url', 'file:///secret'],
    ['--base-url', 'https://public.invalid', '--extra'],
  ])
    assert.throws(() => healthBase(args));
});

test('sonda real HTTP local distingue API viva de base no disponible sin pedir Swagger', async (t) => {
  const paths = [];
  const server = createServer((req, res) => {
    paths.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/ready')) res.writeHead(503);
    res.end(JSON.stringify({ status: req.url.endsWith('/ready') ? 'error' : 'ok', privateValue }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const report = await probeOperationHealth(`http://127.0.0.1:${server.address().port}`);
  assert.equal(report.healthy, false);
  assert.deepEqual(report.checks, [
    { id: 'live', passed: true },
    { id: 'ready', passed: false },
  ]);
  assert.deepEqual(paths.sort(), ['/api/v1/health/live', '/api/v1/health/ready']);
  assert.ok(!JSON.stringify(report).includes(privateValue));
});

test('sonda exige ambos endpoints correctos, acota JSON y omite errores/cuerpos privados', async () => {
  for (const [body, status, expected] of [
    ['{"status":"ok"}', 200, true],
    ['{"status":"error"}', 200, false],
    [`{"status":"ok","private":"${privateValue}"}`, 503, false],
    ['not-json', 200, false],
    [JSON.stringify({ status: 'ok', large: 'x'.repeat(16384) }), 200, false],
  ]) {
    const result = await probeOperationHealth('http://localhost:3100', {
      fetchFn: async (_url, options) => {
        assert.equal(options.redirect, 'error');
        assert.ok(options.signal instanceof AbortSignal);
        return new Response(body, { status });
      },
    });
    assert.equal(result.healthy, expected);
    assert.equal(result.productionReady, false);
    assert.ok(!JSON.stringify(result).includes(privateValue));
  }
  const failed = await probeOperationHealth('http://localhost:3100', {
    fetchFn: async () => {
      throw new Error(privateValue);
    },
  });
  assert.equal(failed.healthy, false);
  assert.ok(!JSON.stringify(failed).includes(privateValue));
  let calls = 0;
  await assert.rejects(
    probeOperationHealth('http://public.invalid', {
      fetchFn: async () => {
        calls++;
      },
    }),
  );
  assert.equal(calls, 0);
});

test('redirecciones no se siguen y un cuerpo lento termina con timeout', async (t) => {
  let hits = 0;
  const server = createServer((req, res) => {
    hits++;
    if (req.url.includes('/redirect/')) {
      res.writeHead(302, { Location: '/private' });
      res.end(privateValue);
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"status":');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const redirected = await probeOperationHealth(base, {
    fetchFn: (url, options) => fetch(url.replace('/api/v1/', '/redirect/'), options),
  });
  assert.equal(redirected.healthy, false);
  assert.equal(hits, 2);
  const timed = await probeOperationHealth(base, { timeoutMs: 50 });
  assert.equal(timed.healthy, false);
});

test('CLI real revisa candidato privado y rechaza fallos sin imprimir secretos', async (t) => {
  const dir = await temporary(t);
  const file = join(dir, 'candidate.env');
  const text = Object.entries(production)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  await writeFile(file, text);
  const { stdout } = await execute(
    process.execPath,
    ['scripts/operations-check.mjs', '--env', file, '--production'],
    { cwd: root, timeout: 30000 },
  );
  assert.equal(JSON.parse(stdout).configurationPassed, true);
  assert.ok(!stdout.includes(privateValue));
  assert.equal(await readFile(file, 'utf8'), text);
  await writeFile(file, 'NODE_ENV=production\nDATABASE_URL=private-invalid\nJWT_SECRET=secret');
  await assert.rejects(
    execute(process.execPath, ['scripts/operations-check.mjs', '--env', file, '--production'], {
      cwd: root,
      timeout: 30000,
    }),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(JSON.parse(error.stdout).configurationPassed, false);
      assert.ok(!(error.stdout + error.stderr).includes('private-invalid'));
      return true;
    },
  );
  await assert.rejects(
    execute(
      process.execPath,
      [
        'scripts/operations-health.mjs',
        '--base-url',
        `https://user:${privateValue}@public.invalid`,
      ],
      { cwd: root, timeout: 30000 },
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.ok(!(error.stdout + error.stderr).includes(privateValue));
      return true;
    },
  );
});

async function backupFixture(t) {
  const project = await temporary(t);
  const directory = join(
    project,
    '.local/backups/bundle-2026-11-25T08-00-00.000Z-0123456789abcdef',
  );
  await mkdir(join(directory, 'images'), { recursive: true });
  await mkdir(join(project, 'backend/prisma'), { recursive: true });
  await writeFile(
    join(project, 'backend/prisma/schema.prisma'),
    'model Reading {\n @@map("readings")\n}\n',
  );
  const dump = 'Synthetic test bytes; this fixture is not a real restoration.';
  const manifest = {
    backupVersion: 2,
    createdAt: '2026-11-25T08:00:00.000Z',
    dumpHash: createHash('sha256').update(dump).digest('hex'),
    data: {
      readings: { count: '0', fingerprint: 'a'.repeat(32) },
      _prisma_migrations: { count: '0', fingerprint: 'b'.repeat(32) },
    },
    images: [],
  };
  const report = {
    verifiedAt: '2026-11-25T08:01:00.000Z',
    restoredTablesMatched: 2,
    restoredImagesMatched: 0,
    archiveHashMatched: true,
    temporaryDatabaseRemoved: true,
    applicationDataRestoredToMain: false,
    applicationImagesRestoredToLive: false,
  };
  await writeFile(join(directory, 'database.dump'), dump);
  await writeFile(join(directory, 'before.json'), JSON.stringify(manifest));
  const reportFile = join(directory, 'restore-check-0123456789abcdef.json');
  await writeFile(reportFile, JSON.stringify(report));
  return { project, directory, manifest, report, reportFile };
}

test('inspección de evidencia de respaldo no restaura ni acredita frescura de datos', async (t) => {
  const { project, directory } = await backupFixture(t);
  const result = await inspectOperationBackup(project, directory);
  assert.equal(result.integrityPassed, true);
  assert.equal(result.restorationEvidenceFound, true);
  assert.equal(result.coversCurrentSchema, true);
  assert.deepEqual(result.missingTables, []);
  assert.equal(result.databaseContacted, false);
  assert.equal(result.restoredNow, false);
  assert.equal(result.currentDataCoverageVerified, false);
});

test('respaldo anterior a migración se señala aunque hashes/restauración coincidan', async (t) => {
  const { project, directory } = await backupFixture(t);
  await writeFile(
    join(project, 'backend/prisma/schema.prisma'),
    'model Reading {\n @@map("readings")\n}\nmodel ModelVersion {\n @@map("prediction_model_versions")\n}\n',
  );
  const result = await inspectOperationBackup(project, directory);
  assert.equal(result.integrityPassed, true);
  assert.equal(result.restorationEvidenceFound, true);
  assert.equal(result.coversCurrentSchema, false);
  assert.deepEqual(result.missingTables, ['prediction_model_versions']);
});

test('respaldo corrupto, fotos adicionales y evidencia inválida no pasan la revisión', async (t) => {
  const { project, directory, report, reportFile } = await backupFixture(t);
  await writeFile(join(directory, 'database.dump'), 'corrupted');
  assert.equal((await inspectOperationBackup(project, directory)).integrityPassed, false);
  await writeFile(join(directory, 'images/unreferenced.jpg'), 'unreferenced');
  await writeFile(reportFile, JSON.stringify({ ...report, temporaryDatabaseRemoved: false }));
  assert.equal((await inspectOperationBackup(project, directory)).restorationEvidenceFound, false);
  await assert.rejects(inspectOperationBackup(project, project));
});

test('esquema sin mapeo conocido e informe ausente no se presentan como completos', async (t) => {
  const { project, directory, reportFile } = await backupFixture(t);
  await writeFile(
    join(project, 'backend/prisma/schema.prisma'),
    'model Unmapped {\n id String\n}\n',
  );
  await rm(reportFile);
  const result = await inspectOperationBackup(project, directory);
  assert.equal(result.coversCurrentSchema, false);
  assert.equal(result.restorationEvidenceFound, false);
});
