import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  acquirePeriodicLock,
  createdBackup,
  periodicOptions,
  runBackupSchedule,
} from './periodic-backup-core.mjs';

test('intervalo explícito acotado, sin repetidos ni argumentos de restauración o destinos externos', () => {
  assert.deepEqual(periodicOptions([]), { once: false, intervalMinutes: 60 });
  assert.deepEqual(periodicOptions(['--once']), { once: true, intervalMinutes: 60 });
  assert.deepEqual(periodicOptions(['--interval-minutes', '10080', '--once']), {
    once: true,
    intervalMinutes: 10080,
  });
  for (const args of [
    ['--once', '--once'],
    ['--interval-minutes'],
    ['--interval-minutes', '59'],
    ['--interval-minutes', '10081'],
    ['--interval-minutes', '-1'],
    ['--interval-minutes', '1.5'],
    ['--interval-minutes', '060'],
    ['--interval-minutes', '60', '--interval-minutes', '60'],
    ['--directory', 'public'],
    ['--restore'],
    ['--delete-old'],
  ])
    assert.throws(() => periodicOptions(args));
});

test('consume JSON versionado del creador sin depender del texto humano ni aceptar escapes', () => {
  const root = resolve('.');
  const directory = join('.local', 'backups', 'bundle-2026-11-25T02-00-00.000Z-0123456789abcdef');
  const value = { resultVersion: 1, directory, tables: 20, images: 0 };
  assert.deepEqual(createdBackup(root, JSON.stringify(value)), {
    directory: resolve(root, directory),
    tables: 20,
    images: 0,
  });
  for (const extra of [
    { resultVersion: 2 },
    { tables: 0 },
    { images: -1 },
    { tables: '20' },
    { directory: resolve(root, directory) },
    { directory: '.local/backups-other/bundle-x' },
    { directory: '.local/backups/../../public' },
    { directory: '.local/backups' },
    { directory: '.local/backups/not-a-created-bundle' },
    { directory: `${directory}/child` },
  ])
    assert.throws(() => createdBackup(root, JSON.stringify({ ...value, ...extra })));
  assert.throws(() => createdBackup(root, 'Respaldo creado: secreto no analizable'));
});

test('un ciclo solo informa verificado después de terminar y no espera otra vez', async () => {
  const events = [];
  const controller = new AbortController();
  await runBackupSchedule(periodicOptions(['--once']), {
    signal: controller.signal,
    cycle: async () => {
      events.push('create-and-verify');
      return { directory: 'private' };
    },
    report: (result) => events.push(result),
    wait: () => {
      throw new Error('No debe esperar');
    },
  });
  assert.deepEqual(events, ['create-and-verify', { status: 'verified', directory: 'private' }]);
});

test('fallo en modo único da error sin declarar verificación ni filtrar excepciones', async () => {
  const events = [];
  await assert.rejects(
    runBackupSchedule(periodicOptions(['--once']), {
      signal: new AbortController().signal,
      cycle: async () => {
        throw new Error('postgresql://test-only-secret');
      },
      report: (result) => events.push(result),
    }),
    /no pudo verificarse/,
  );
  assert.deepEqual(events, [{ status: 'failed' }]);
});

test('modo continuo espera intervalo completo tras éxito y fallo, siempre secuencial', async () => {
  const controller = new AbortController();
  const reports = [],
    delays = [];
  let attempts = 0,
    running = false;
  await runBackupSchedule(periodicOptions(['--interval-minutes', '120']), {
    signal: controller.signal,
    cycle: async () => {
      assert.equal(running, false);
      running = true;
      attempts++;
      await Promise.resolve();
      running = false;
      if (attempts === 1) throw new Error('synthetic failure');
      return { directory: 'verified-copy' };
    },
    report: (result) => reports.push(result),
    wait: async (ms, _, options) => {
      assert.equal(running, false);
      assert.equal(options.signal, controller.signal);
      delays.push(ms);
      if (attempts === 2) controller.abort();
    },
  });
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [120 * 60000, 120 * 60000]);
  assert.deepEqual(reports, [
    { status: 'failed' },
    { status: 'verified', directory: 'verified-copy' },
  ]);
});

test('detener durante un ciclo no abandona verificación ni inicia otro', async () => {
  const controller = new AbortController(),
    events = [];
  await runBackupSchedule(periodicOptions([]), {
    signal: controller.signal,
    cycle: async () => {
      events.push('created');
      controller.abort();
      await Promise.resolve();
      events.push('verification-cleanup-done');
      return { directory: 'private' };
    },
    report: (value) => events.push(value.status),
    wait: () => {
      throw new Error('No debe esperar ni iniciar otro ciclo');
    },
  });
  assert.deepEqual(events, ['created', 'verification-cleanup-done', 'verified']);
});

test('cancelación durante espera es normal; otros fallos de espera no se ocultan', async () => {
  const controller = new AbortController();
  await runBackupSchedule(periodicOptions([]), {
    signal: controller.signal,
    cycle: async () => ({}),
    report: () => {},
    wait: async () => {
      controller.abort();
      throw new Error('aborted');
    },
  });
  await assert.rejects(
    runBackupSchedule(periodicOptions([]), {
      signal: new AbortController().signal,
      cycle: async () => ({}),
      report: () => {},
      wait: async () => {
        throw new Error('clock failed');
      },
    }),
    /espera/,
  );
});

test('señal ya detenida no inicia ciclos ni escribe éxito', async () => {
  const controller = new AbortController();
  controller.abort();
  await runBackupSchedule(periodicOptions([]), {
    signal: controller.signal,
    cycle: () => {
      throw new Error('No debe empezar');
    },
    report: () => {
      throw new Error('No debe informar');
    },
  });
});

test('bloqueo exclusivo por proyecto, limpieza propia y rechazo sin eliminar bloqueos ajenos', async (t) => {
  const base = resolve('.local/backups');
  await mkdir(base, { recursive: true });
  const temporary = await mkdtemp(join(base, 'unit-periodic-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const release = await acquirePeriodicLock(temporary);
  const original = await readFile(join(temporary, 'periodic.lock'), 'utf8');
  await assert.rejects(acquirePeriodicLock(temporary), /activo/);
  assert.equal(await readFile(join(temporary, 'periodic.lock'), 'utf8'), original);
  await release();
  const nextRelease = await acquirePeriodicLock(temporary);
  await writeFile(join(temporary, 'periodic.lock'), JSON.stringify({ token: 'someone-else' }));
  await assert.rejects(nextRelease(), /cambió/);
  assert.equal(
    JSON.parse(await readFile(join(temporary, 'periodic.lock'), 'utf8')).token,
    'someone-else',
  );
});
