import { isAbsolute, relative, sep } from 'node:path';

export function localRestoreSource(env) {
  let source;
  try {
    source = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('Configuración PostgreSQL local inválida');
  }
  if (
    env.NODE_ENV === 'production' ||
    !['postgres:', 'postgresql:'].includes(source.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(source.hostname) ||
    [...source.searchParams.keys()].some((key) => !['schema', 'connect_timeout'].includes(key)) ||
    (source.searchParams.has('connect_timeout') &&
      !/^(?:[1-9]|[1-9]\d|1[01]\d|120)$/.test(source.searchParams.get('connect_timeout'))) ||
    decodeURIComponent(source.pathname.slice(1)) !== env.POSTGRES_DB ||
    decodeURIComponent(source.username) !== env.POSTGRES_USER ||
    (source.port || '5432') !== (env.POSTGRES_PORT || '5433')
  ) {
    throw new Error('Solo se permite la base local de Docker Compose, nunca producción');
  }
  return source;
}

export function requireBackupDirectory(base, directory) {
  const path = relative(base, directory);
  if (!path || isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) {
    throw new Error('El respaldo debe estar dentro de .local/backups');
  }
}

export function requireTemporaryDatabase(name, source) {
  if (
    !/^cacaosmart_restore_[a-f0-9]{16}$/.test(name) ||
    name === decodeURIComponent(source.pathname.slice(1))
  ) {
    throw new Error('Destino de restauración no temporal: operación rechazada');
  }
  return name;
}

export function readBackupManifest(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !/^[a-f0-9]{64}$/.test(value.dumpHash ?? '') ||
    !value.data ||
    typeof value.data !== 'object' ||
    Array.isArray(value.data) ||
    !Object.keys(value.data).length ||
    Object.entries(value.data).some(
      ([name, row]) =>
        !/^[a-z_]+$/.test(name) ||
        !row ||
        typeof row.count !== 'string' ||
        !/^\d+$/.test(row.count) ||
        typeof row.fingerprint !== 'string' ||
        !/^[a-f0-9]{32}$/.test(row.fingerprint),
    )
  ) {
    throw new Error('Manifiesto de respaldo inválido');
  }
  return value;
}

export function verifyRestoredTables(expected, actual) {
  if (
    JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(Object.keys(actual).sort()) ||
    Object.entries(expected).some(
      ([name, row]) =>
        actual[name]?.count !== row.count || actual[name]?.fingerprint !== row.fingerprint,
    )
  ) {
    throw new Error('La restauración no coincide con las tablas y huellas del respaldo');
  }
  return Object.keys(expected).length;
}
