import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseEnv } from 'node:util';
import { fileHash, validateBundle } from './backup-bundle.mjs';
import { readBackupManifest } from './backup-restore-core.mjs';

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const inside = (base, target) => {
  const part = relative(base, target);
  return !!part && !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
};

export function operationOptions(args) {
  let file = '.env';
  let production = false;
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (seen.has(arg)) throw new Error('Argumentos repetidos');
    seen.add(arg);
    if (arg === '--production') production = true;
    else if (arg === '--env' && args[index + 1] && !args[index + 1].startsWith('--'))
      file = args[++index];
    else throw new Error('Usa [--env ARCHIVO_PRIVADO] [--production]');
  }
  return { file, production };
}

/** Read one private candidate, never merge it into process.env or print values. */
export async function readOperationEnvironment(root, file) {
  root = await realpath(root);
  const requested = resolve(root, file);
  if (requested !== join(root, '.env') && !inside(join(root, '.local'), requested))
    throw new Error('La configuración debe ser .env o un archivo privado bajo .local');
  const actual = await realpath(requested);
  const info = await lstat(requested);
  if (actual !== requested || info.isSymbolicLink() || !info.isFile() || info.size > 65536)
    throw new Error('Configuración privada regular, sin enlaces y hasta 64 KiB');
  const bytes = await readFile(actual);
  if (bytes.length > 65536) throw new Error('Configuración demasiado grande');
  return parseEnv(bytes.toString('utf8'));
}

export function inspectOperationConfig(input, { validate, production = false, root }) {
  const checks = [];
  const add = (id, passed) => checks.push({ id, passed: !!passed });
  let validated;
  try {
    validated = validate(input);
    add('runtime_configuration', true);
  } catch {
    add('runtime_configuration', false);
  }
  production ||= input.NODE_ENV === 'production';
  if (production) {
    add('production_mode', input.NODE_ENV === 'production');
    let origin;
    let database;
    try {
      origin = new URL(input.CORS_ORIGIN);
    } catch {
      /* Report only a fixed check ID, not a supplied value. */
    }
    try {
      database = new URL(input.DATABASE_URL);
    } catch {
      /* Never expose a connection URL in an exception/report. */
    }
    add(
      'public_https_origin',
      origin?.protocol === 'https:' &&
        origin.origin === input.CORS_ORIGIN &&
        !loopback.has(origin.hostname) &&
        !/(?:^|\.)(?:example|invalid|test|localhost)$/.test(origin.hostname) &&
        !/(?:^|\.)example\.(?:com|net|org)$/.test(origin.hostname),
    );
    add('api_loopback_only', input.HOST === '127.0.0.1' || input.HOST === '::1');
    add('real_telemetry_only', validated?.TELEMETRY_MODE === 'real');
    add('openai_disabled', validated?.AI_PROVIDER === 'disabled');
    add('weather_disabled_until_authorized', validated?.WEATHER_PROVIDER === 'disabled');
    const allowed = new Set(['sslmode', 'channel_binding', 'connect_timeout', 'schema']);
    add(
      'database_transport_policy',
      database &&
        ['postgres:', 'postgresql:'].includes(database.protocol) &&
        !database.hash &&
        (loopback.has(database.hostname) ||
          database.searchParams.get('sslmode') === 'verify-full') &&
        [...database.searchParams.keys()].every(
          (key) => allowed.has(key) && database.searchParams.getAll(key).length === 1,
        ),
    );
    add(
      'non_placeholder_jwt',
      /^[a-f0-9]{64}$/i.test(input.JWT_SECRET ?? '') &&
        !/^([a-f0-9])\1{63}$/i.test(input.JWT_SECRET),
    );
    const imagePath = input.IMAGE_STORAGE_PATH;
    add(
      'explicit_external_image_storage',
      typeof imagePath === 'string' &&
        isAbsolute(imagePath) &&
        resolve(imagePath) !== resolve(root) &&
        !inside(resolve(root), resolve(imagePath)) &&
        !inside(resolve(imagePath), resolve(root)),
    );
    add(
      'bootstrap_credentials_absent',
      !['BOOTSTRAP_ADMIN_NAME', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD'].some(
        (key) => !!input[key],
      ),
    );
  }
  return {
    schemaVersion: 'operations-config-v1',
    profile: production ? 'production-candidate' : 'local',
    configurationPassed: checks.every((check) => check.passed),
    checks,
    productionReady: false,
    manualChecks: [
      'hosting_domain_and_https',
      'persistent_storage_permissions',
      'proxy_client_ip_and_rate_limits',
      'backup_schedule_and_external_copy',
      'isolated_restore_and_recovery_objectives',
      'monitoring_notifications',
      'real_device_and_account_provisioning',
    ],
    externalServicesContacted: false,
  };
}

export function healthBase(args) {
  if (args.length !== 2 || args[0] !== '--base-url')
    throw new Error('Usa --base-url ORIGEN; HTTPS remoto o HTTP loopback');
  const url = new URL(args[1]);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (url.protocol === 'http:' && !loopback.has(url.hostname)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Origen de salud no permitido');
  return url.origin;
}

async function healthBody(response) {
  if (!response.body) throw new Error('empty');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) throw new Error('large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function probeOperationHealth(base, { fetchFn = fetch, timeoutMs = 5000 } = {}) {
  // Validate again for programmatic callers before any request.
  const origin = healthBase(['--base-url', base]);
  const checks = await Promise.all(
    ['live', 'ready'].map(async (id) => {
      try {
        const response = await fetchFn(`${origin}/api/v1/health/${id}`, {
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
          headers: { Accept: 'application/json' },
        });
        if (response.status !== 200) {
          await response.body?.cancel();
          return { id, passed: false };
        }
        const body = await healthBody(response);
        return { id, passed: body?.status === 'ok' };
      } catch {
        return { id, passed: false };
      }
    }),
  );
  return {
    schemaVersion: 'operations-health-v1',
    healthy: checks.every((check) => check.passed),
    checks,
    productionReady: false,
  };
}

async function regularFile(path, maximum = Infinity) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum)
    throw new Error('Archivo privado regular requerido');
  return info;
}

/** Inspect existing evidence only: no database, restoration, copying or deletion. */
export async function inspectOperationBackup(root, directory) {
  root = await realpath(root);
  const base = join(root, '.local', 'backups');
  const requested = resolve(root, directory);
  const part = relative(base, requested);
  if (!/^bundle-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-f0-9]{16}$/.test(part))
    throw new Error('Solo conjuntos privados de respaldo');
  if ((await realpath(requested)) !== requested || !(await lstat(requested)).isDirectory())
    throw new Error('No se siguen enlaces del respaldo');
  const manifestFile = join(requested, 'before.json');
  await regularFile(manifestFile, 16 * 1024 * 1024);
  const manifest = readBackupManifest(JSON.parse(await readFile(manifestFile, 'utf8')));
  validateBundle(manifest, manifest.images?.map((image) => image.key) ?? []);
  if (
    typeof manifest.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    Date.parse(manifest.createdAt) > Date.now() + 60000
  )
    throw new Error('Fecha inválida');
  const dump = join(requested, 'database.dump');
  await regularFile(dump);
  let integrityPassed = (await fileHash(dump)) === manifest.dumpHash;
  const images = join(requested, 'images');
  if ((await realpath(images)) !== images || !(await lstat(images)).isDirectory())
    throw new Error('No se siguen enlaces de fotografías');
  integrityPassed &&=
    JSON.stringify((await readdir(images)).sort()) ===
    JSON.stringify(manifest.images.map((image) => image.key).sort());
  for (const image of manifest.images) {
    const path = join(images, image.key);
    const info = await regularFile(path);
    integrityPassed &&= info.size === image.bytes && (await fileHash(path)) === image.sha256;
  }
  // Public schema metadata only, not contents of database rows.
  const schema = await readFile(join(root, 'backend/prisma/schema.prisma'), 'utf8');
  const models = [...schema.matchAll(/^\s*model\s+\w+\s*\{/gm)];
  const mapped = [...schema.matchAll(/@@map\("([a-z_]+)"\)/g)].map((match) => match[1]);
  const coverageKnown = models.length > 0 && models.length === mapped.length;
  const missingTables = ['_prisma_migrations', ...mapped].filter(
    (name) => !Object.hasOwn(manifest.data, name),
  );
  const entries = await readdir(requested);
  let restorationEvidenceFound = false;
  for (const name of entries.filter((item) => /^restore-check-[a-f0-9]{16}\.json$/.test(item))) {
    const path = join(requested, name);
    await regularFile(path, 65536);
    const report = JSON.parse(await readFile(path, 'utf8'));
    restorationEvidenceFound ||=
      typeof report.verifiedAt === 'string' &&
      Number.isFinite(Date.parse(report.verifiedAt)) &&
      Date.parse(report.verifiedAt) >= Date.parse(manifest.createdAt) &&
      Date.parse(report.verifiedAt) <= Date.now() + 60000 &&
      report.restoredTablesMatched === Object.keys(manifest.data).length &&
      report.restoredImagesMatched === manifest.images.length &&
      report.archiveHashMatched === true &&
      report.temporaryDatabaseRemoved === true &&
      report.applicationDataRestoredToMain === false &&
      report.applicationImagesRestoredToLive === false;
  }
  return {
    schemaVersion: 'operations-backup-v1',
    createdAt: manifest.createdAt,
    tables: Object.keys(manifest.data).length,
    images: manifest.images.length,
    integrityPassed,
    restorationEvidenceFound,
    coversCurrentSchema: coverageKnown && missingTables.length === 0,
    missingTables,
    databaseContacted: false,
    restoredNow: false,
    currentDataCoverageVerified: false,
    productionReady: false,
  };
}
