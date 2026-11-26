import { open, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { requireBackupDirectory } from './backup-restore-core.mjs';

export function periodicOptions(args) {
  let once = false,
    intervalMinutes = 60,
    intervalSeen = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--once' && !once) once = true;
    else if (arg === '--interval-minutes' && !intervalSeen) {
      const raw = args[++index];
      if (!/^[1-9]\d{0,4}$/.test(raw ?? '')) throw new Error('Intervalo inválido');
      intervalMinutes = Number(raw);
      intervalSeen = true;
    } else
      throw new Error('Uso: npm run backup:periodic -- [--once] [--interval-minutes 60..10080]');
  }
  if (intervalMinutes < 60 || intervalMinutes > 10080)
    throw new Error('El intervalo debe estar entre 60 y 10080 minutos');
  return { once, intervalMinutes };
}

export function createdBackup(root, stdout) {
  const value = JSON.parse(stdout);
  if (
    !value ||
    value.resultVersion !== 1 ||
    typeof value.directory !== 'string' ||
    isAbsolute(value.directory) ||
    !Number.isSafeInteger(value.tables) ||
    value.tables < 1 ||
    !Number.isSafeInteger(value.images) ||
    value.images < 0
  )
    throw new Error('Resultado de creación no compatible');
  const base = resolve(root, '.local/backups');
  const directory = resolve(root, value.directory);
  requireBackupDirectory(base, directory);
  const path = relative(base, directory);
  if (
    path.includes(sep) ||
    !/^bundle-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-f0-9]{16}$/.test(path)
  )
    throw new Error('El creador no devolvió un respaldo fechado del proyecto');
  return { directory, tables: value.tables, images: value.images };
}

/** Never remove somebody else's lock, even when it appears stale. */
export async function acquirePeriodicLock(base) {
  const path = join(base, 'periodic.lock');
  const token = randomUUID();
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
  } catch {
    throw new Error('No se pudo reservar periodic.lock; revisa si ya hay un proceso activo');
  }
  try {
    await handle.writeFile(
      JSON.stringify({ token, pid: process.pid, startedAt: new Date().toISOString() }),
    );
  } finally {
    await handle.close();
  }
  return async () => {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (value.token !== token) throw new Error('El bloqueo cambió; no se eliminó');
    await unlink(path);
  };
}

/** Fixed delay after completion: no overlap, no catch-up storm after sleep/failures. */
export async function runBackupSchedule(options, { signal, cycle, report, wait = delay }) {
  while (!signal.aborted) {
    let result,
      succeeded = false;
    try {
      result = await cycle();
      succeeded = true;
    } catch {
      // Do not forward child errors, URLs, credentials or stack traces.
    }
    await report(succeeded ? { status: 'verified', ...result } : { status: 'failed' });
    if (options.once) {
      if (!succeeded) throw new Error('El ciclo no pudo verificarse; no se declara protegido');
      return;
    }
    if (signal.aborted) return;
    try {
      await wait(options.intervalMinutes * 60000, undefined, { signal });
    } catch {
      if (!signal.aborted) throw new Error('Falló la espera entre respaldos');
    }
  }
}
