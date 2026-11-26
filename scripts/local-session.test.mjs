import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  localSessionCommands,
  localSessionConfig,
  requireFreePort,
  runLocalSession,
} from './local-session-core.mjs';

test('resuelve ejecutables desde cada workspace aunque nodemon no esté elevado a la raíz', async () => {
  const commands = localSessionCommands(fileURLToPath(new URL('../', import.meta.url)));
  await access(commands.backend);
  await access(commands.frontend);
  assert.match(commands.backend, /nodemon[/\\]bin[/\\]nodemon\.js$/);
  assert.match(commands.frontend, /cli[/\\]bin[/\\]ng\.js$/);
});

test('perfil local sin sustituir base ni proveedores', () => {
  const input = {
    NODE_ENV: 'development',
    DATABASE_URL: 'private-existing-database',
    AI_PROVIDER: 'mock',
  };
  const before = { ...input };
  assert.deepEqual(localSessionConfig(input), {
    api: 'http://127.0.0.1:3100',
    web: 'http://localhost:4200',
  });
  assert.deepEqual(input, before);
  for (const extra of [
    { NODE_ENV: 'production' },
    { NODE_ENV: 'test' },
    { HOST: '0.0.0.0' },
    { PORT: 3101 },
    { CORS_ORIGIN: 'http://127.0.0.1:4200' },
  ])
    assert.throws(() => localSessionConfig({ ...input, ...extra }));
});

test('puerto ocupado se rechaza sin detener el servidor existente', async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(requireFreePort(port, '127.0.0.1'));
  assert.equal(server.listening, true);
});

test('puerto libre se libera inmediatamente tras comprobarlo', async () => {
  await requireFreePort(0, '127.0.0.1');
});

test('si termina un servicio limpia ambos, exclusivamente los propios', async () => {
  const started = [];
  const stopped = [];
  await runLocalSession({
    start: async (kind) => {
      const child = {
        kind,
        finished: kind === 'frontend' ? Promise.resolve() : new Promise(() => {}),
      };
      started.push(child);
      return child;
    },
    stop: async (child) => stopped.push(child),
  });
  assert.equal(started.length, 2);
  assert.deepEqual(stopped, started);
});

test('fallo al iniciar frontend detiene solo el backend ya creado', async () => {
  const owned = { finished: new Promise(() => {}) };
  const stopped = [];
  await assert.rejects(
    runLocalSession({
      start: async (kind) => {
        if (kind === 'frontend') throw new Error('synthetic');
        return owned;
      },
      stop: async (child) => stopped.push(child),
    }),
  );
  assert.deepEqual(stopped, [owned]);
});

test('fallo del servicio se propaga después de detener los procesos propios', async () => {
  const stopped = [];
  await assert.rejects(
    runLocalSession({
      start: async (kind) => ({
        kind,
        finished:
          kind === 'frontend' ? Promise.reject(new Error('synthetic')) : new Promise(() => {}),
      }),
      stop: async (child) => stopped.push(child.kind),
    }),
  );
  assert.deepEqual(stopped, ['backend', 'frontend']);
});

test('el cierre espera a ambos servicios y notifica una sola limpieza', async () => {
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  const stopped = [];
  let notifications = 0;
  let completed = false;
  const session = runLocalSession({
    start: async (kind) => ({
      kind,
      finished: kind === 'backend' ? Promise.resolve() : new Promise(() => {}),
    }),
    stop: async (child) => {
      stopped.push(child.kind);
      if (child.kind === 'frontend') await delayed;
    },
    onStopping: () => {
      notifications++;
    },
  }).then(() => {
    completed = true;
  });
  // Give the async coordinator a turn without wall-clock sleeps.
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(stopped, ['backend', 'frontend']);
  assert.equal(completed, false);
  release();
  await session;
  assert.equal(completed, true);
  assert.equal(notifications, 1);
});

test('un fallo de limpieza se informa sin omitir el cierre del otro servicio', async () => {
  const stopped = [];
  await assert.rejects(
    runLocalSession({
      start: async (kind) => ({ kind, finished: Promise.resolve() }),
      stop: async (child) => {
        stopped.push(child.kind);
        if (child.kind === 'backend') throw new Error('Synthetic cleanup failure');
      },
    }),
    /Synthetic cleanup failure/,
  );
  assert.deepEqual(stopped, ['backend', 'frontend']);
});
