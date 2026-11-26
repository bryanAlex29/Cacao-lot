import { access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { spawn } from 'node:child_process';
import { rootCertificates } from 'node:tls';

// Deliberately separate from the local-Compose guards. No arbitrary remote hosts.
export function neonSource(env) {
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('Se requiere una conexión Neon válida; no se muestra su valor');
  }
  const allowed = new Set(['sslmode', 'channel_binding', 'connect_timeout', 'schema']);
  if (
    env.NODE_ENV === 'production' ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname) ||
    !url.username ||
    !url.password ||
    !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
    (url.port && url.port !== '5432') ||
    url.hash ||
    url.searchParams.get('sslmode') !== 'verify-full' ||
    [...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1) ||
    [...url.searchParams.keys()].some((key) => !allowed.has(key)) ||
    (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public') ||
    (url.searchParams.has('channel_binding') &&
      !['require', 'prefer'].includes(url.searchParams.get('channel_binding'))) ||
    (url.searchParams.has('connect_timeout') &&
      !/^(?:[1-9]|[1-9]\d|1[01]\d|120)$/.test(url.searchParams.get('connect_timeout')))
  )
    throw new Error('Solo Neon no productivo, puerto 5432, esquema public y TLS verify-full');
  // pg_dump/pg_restore and exported snapshots need a direct connection:
  // transaction pooling does not preserve session settings or snapshot affinity.
  url.hostname = url.hostname.replace(/-pooler(?=\.)/, '');
  return url;
}

export function temporaryNeonDatabase(name, source, prefix = 'cacaosmart_restore_') {
  if (
    !['cacaosmart_restore_', 'cacaosmart_test_'].includes(prefix) ||
    !new RegExp(`^${prefix}[a-f0-9]{16}$`).test(name) ||
    name === decodeURIComponent(source.pathname.slice(1))
  )
    throw new Error('Solo se permite un nombre temporal generado por la herramienta');
  const target = new URL(source);
  target.pathname = `/${name}`;
  return target;
}

export async function postgresTools(env) {
  const candidates = env.PG_BIN
    ? [env.PG_BIN]
    : process.platform === 'win32'
      ? ['18', '17'].map((version) =>
          join(env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL', version, 'bin'),
        )
      : ['/usr/bin', '/usr/local/bin'];
  for (const directory of candidates) {
    if (!isAbsolute(directory)) throw new Error('PG_BIN debe ser una carpeta absoluta');
    const suffix = process.platform === 'win32' ? '.exe' : '';
    const dump = join(directory, `pg_dump${suffix}`);
    const restore = join(directory, `pg_restore${suffix}`);
    try {
      await access(dump, constants.X_OK);
      await access(restore, constants.X_OK);
      return { dump, restore };
    } catch {
      // Try known installations only; never invoke a shell with database secrets.
    }
  }
  throw new Error(
    'No se encuentran pg_dump/pg_restore; configurar PG_BIN con PostgreSQL compatible',
  );
}

export async function nativeEnvironment(source, caFile, env = process.env) {
  await writeFile(caFile, `${rootCertificates.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
  // Do not inherit PGOPTIONS, PGSERVICE, PGPASSFILE, etc. that can redirect a connection.
  const clean = Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.toUpperCase().startsWith('PG')),
  );
  return {
    ...clean,
    PGHOST: source.hostname,
    PGPORT: source.port || '5432',
    PGDATABASE: decodeURIComponent(source.pathname.slice(1)),
    PGUSER: decodeURIComponent(source.username),
    PGPASSWORD: decodeURIComponent(source.password),
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: caFile,
    PGCONNECT_TIMEOUT: '20',
    PGAPPNAME: 'cacaosmart-neon-backup',
    ...(source.searchParams.has('channel_binding')
      ? { PGCHANNELBINDING: source.searchParams.get('channel_binding') }
      : {}),
  };
}

export function runPostgres(executable, args, env, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args, '--no-password'], {
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    // Never expose libpq/SQL stderr, which can contain credentials or row contents.
    child.stderr.resume();
    const timer = setTimeout(() => child.kill(), timeout);
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('No se pudo iniciar la herramienta PostgreSQL'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('La herramienta PostgreSQL falló; no se muestran datos privados'));
    });
  });
}
