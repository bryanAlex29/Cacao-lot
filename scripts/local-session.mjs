import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readOperationEnvironment } from './operations-core.mjs';
import {
  localSessionCommands,
  localSessionConfig,
  requireFreePort,
  runLocalSession,
} from './local-session-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const controller = new AbortController();
const interrupt = () => controller.abort();
let interrupted = false;
let completed = false;
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

try {
  if (process.argv.length !== 2) throw new Error('El arranque no admite argumentos');
  const input = await readOperationEnvironment(root, '.env');
  const config = localSessionConfig(input);
  if (process.env.NODE_ENV === 'production') throw new Error('No ejecutar en producción');
  for (const [key, value] of Object.entries(input)) {
    if (process.env[key] !== undefined && process.env[key] !== value)
      throw new Error('Variables heredadas difieren del archivo privado');
  }
  const commands = localSessionCommands(root);
  await access(commands.backend);
  await access(commands.frontend);
  await requireFreePort(3100, '127.0.0.1');
  await requireFreePort(4200, 'localhost');
  controller.signal.throwIfAborted();
  console.log(`Inicio local: ${config.web}/login · API ${config.api}`);
  console.log('Ctrl+C detiene solo los servicios iniciados por este comando.');
  console.log(
    'No inicia simulador, respaldos ni migraciones; conserva los proveedores configurados.',
  );

  await runLocalSession({
    start: async (kind) => {
      controller.signal.throwIfAborted();
      const backend = kind === 'backend';
      const child = spawn(
        process.execPath,
        backend
          ? [commands.backend, '--config', 'nodemon.json']
          : [commands.frontend, 'serve', '--host', 'localhost', '--port', '4200'],
        {
          cwd: join(root, backend ? 'backend' : 'frontend'),
          env: { ...process.env, ...input },
          stdio: 'inherit',
          shell: false,
          // Isolate each owned tree from the supervisor's console Ctrl+C.
          // Otherwise watchers can exit before the supervisor handles SIGINT.
          detached: true,
          windowsHide: true,
        },
      );
      const finished = new Promise((resolve, reject) => {
        child.once('error', () => reject(new Error('No se pudo iniciar un servicio local')));
        child.once('exit', (code) => {
          if (code === 0 || controller.signal.aborted) resolve();
          else reject(new Error('Un servicio local terminó con error'));
        });
      });
      // A spawn failure must be observed even if the second service cannot start.
      finished.catch(() => {});
      const aborted = new Promise((resolve) => {
        if (controller.signal.aborted) resolve();
        else controller.signal.addEventListener('abort', resolve, { once: true });
      });
      return { child, finished: Promise.race([finished, aborted]) };
    },
    stop: async ({ child }) => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
      if (process.platform === 'win32') {
        // Exact PID owned by this invocation, including its watcher/workers.
        // Never target by process name, port, or a PID loaded from disk.
        await new Promise((resolve, reject) => {
          const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            shell: false,
            windowsHide: true,
          });
          killer.once('error', () => reject(new Error('No se pudo cerrar un servicio propio')));
          killer.once('close', (code) => {
            if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve();
            else reject(new Error('No se confirmó el cierre de un servicio propio'));
          });
        });
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
    },
    onStopping: () => {
      interrupted = controller.signal.aborted;
      console.log('Cerrando los servicios de esta sesión local; otros procesos no se tocan.');
    },
  });
  completed = true;
} catch {
  console.error(
    'No se completó el arranque local. Revisa .env, dependencias y puertos 3100/4200. No se modificó la configuración ni se cerraron servicios preexistentes.',
  );
  if (!controller.signal.aborted || interrupted) process.exitCode = 1;
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
  if (interrupted && completed) console.log('Sesión local detenida.');
}
