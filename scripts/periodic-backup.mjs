import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import {
  localRestoreSource,
  readBackupManifest,
  requireBackupDirectory,
} from './backup-restore-core.mjs';
import {
  acquirePeriodicLock,
  createdBackup,
  periodicOptions,
  runBackupSchedule,
} from './periodic-backup-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const controller = new AbortController();
const stop = () => {
  if (!controller.signal.aborted) {
    console.log('Detención solicitada: se termina el ciclo en curso antes de salir.');
    controller.abort();
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
let release;

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts', script), ...args], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: false,
      windowsHide: true,
      // A console Ctrl+C must not interrupt a verifier midway through its
      // temporary-database cleanup. Parent remains referenced and awaits close.
      detached: true,
    });
    let stdout = '',
      oversized = false;
    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length > 65536) oversized = true;
      else stdout += chunk.toString('utf8');
    });
    child.once('error', () => reject(new Error('No se pudo iniciar la herramienta local')));
    child.once('close', (code) => {
      if (code === 0 && !oversized) resolve(stdout);
      else reject(new Error('La herramienta de respaldo no completó su operación'));
    });
  });
}

try {
  const options = periodicOptions(process.argv.slice(2));
  loadEnvFile(join(root, '.env'));
  localRestoreSource(process.env);
  await mkdir(join(root, '.local/backups'), { recursive: true, mode: 0o700 });
  const base = await realpath(join(root, '.local/backups'));
  requireBackupDirectory(await realpath(root), base);
  release = await acquirePeriodicLock(base);
  console.log(
    options.once
      ? 'Respaldo local: un ciclo de creación y verificación aislada.'
      : `Respaldo periódico local: primer ciclo ahora; después ${options.intervalMinutes} minutos desde el fin de cada ciclo. Ctrl+C para detener.`,
  );
  console.log(
    'No hay borrado automático, copia externa ni tarea de Windows; requiere proceso activo y Docker.',
  );
  await runBackupSchedule(options, {
    signal: controller.signal,
    cycle: async () => {
      const result = createdBackup(root, await run('create-backup.mjs', ['--json']));
      const actual = await realpath(result.directory);
      requireBackupDirectory(base, actual);
      if (actual !== result.directory) throw new Error('No se siguen destinos enlazados');
      readBackupManifest(JSON.parse(await readFile(join(actual, 'before.json'), 'utf8')));
      await run('verify-backup.mjs', ['--directory', actual]);
      return { directory: relative(root, actual), tables: result.tables, images: result.images };
    },
    report: (result) => {
      if (result.status === 'verified')
        console.log(
          `Respaldo periódico verificado: ${result.directory} (${result.tables} tablas, ${result.images} fotografías).`,
        );
      else
        console.error(
          'Ciclo fallido: no se marcó como verificado. Revisa Docker, espacio y análisis pendientes. Se conservan las copias; el siguiente intento espera el intervalo completo.',
        );
    },
  });
} catch {
  console.error(
    'No se completó el respaldo periódico. Comprueba argumentos, entorno local, Docker y periodic.lock. No se borraron respaldos ni se restauró la principal.',
  );
  process.exitCode = 1;
} finally {
  if (release) {
    try {
      await release();
    } catch {
      console.error(
        'No se pudo liberar periodic.lock; revísalo antes de reiniciar, sin borrar un bloqueo activo.',
      );
      process.exitCode = 1;
    }
  }
  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
}
