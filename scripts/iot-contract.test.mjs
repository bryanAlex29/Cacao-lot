import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectTelemetryPayload, readTelemetryInput } from './iot-contract-core.mjs';

const now = Date.parse('2026-11-25T04:00:00.000Z');
const example = await readTelemetryInput(['--demo']);
const payload = () => structuredClone(example);

test('ejemplo explícito DEMO conforme, sin acreditar equipo, calibración o credenciales', async () => {
  assert.deepEqual(await inspectTelemetryPayload(payload(), now), {
    ok: true,
    schemaVersion: '1.2',
    declaredSource: 'demo',
    soilValuesPresent: 3,
    timestampOrigin: 'server',
    credentialsVerified: false,
    hardwareVerified: false,
    calibrationVerified: false,
  });
});
test('tres sondas independientes, cero/false y datos parciales explícitos no se rellenan', async () => {
  const value = payload();
  value.soilMoisture = { soil_1: 0, soil_2: null, soil_3: 100 };
  value.temperatureC = null;
  value.airHumidityPct = null;
  value.rainDetected = false;
  value.valve = { relayCommandedOpen: null, feedbackOpen: null };
  const before = structuredClone(value);
  const result = await inspectTelemetryPayload(value, now);
  assert.equal(result.ok, true);
  assert.equal(result.soilValuesPresent, 2);
  assert.deepEqual(value, before);
});
test('origen declarado opcional no representa autenticación ni cambia el canal', async () => {
  const value = payload();
  delete value.source;
  assert.equal((await inspectTelemetryPayload(value, now)).declaredSource, null);
  value.source = 'real';
  const result = await inspectTelemetryPayload(value, now);
  assert.equal(result.ok, true);
  assert.equal(result.declaredSource, 'real');
  assert.equal(result.hardwareVerified, false);
});
for (const [label, change] of [
  [
    'versión distinta',
    (v) => {
      v.schemaVersion = '1.0';
    },
  ],
  [
    'UUID sustituido por serial',
    (v) => {
      v.deviceId = 'esp32-cacao-001';
    },
  ],
  [
    'evento vacío',
    (v) => {
      v.eventId = '';
    },
  ],
  [
    'evento demasiado largo',
    (v) => {
      v.eventId = 'x'.repeat(121);
    },
  ],
  [
    'sonda omitida',
    (v) => {
      delete v.soilMoisture.soil_2;
    },
  ],
  [
    'número como texto',
    (v) => {
      v.soilMoisture.soil_1 = '42';
    },
  ],
  [
    'humedad negativa',
    (v) => {
      v.soilMoisture.soil_1 = -1;
    },
  ],
  [
    'humedad excesiva',
    (v) => {
      v.soilMoisture.soil_3 = 101;
    },
  ],
  [
    'temperatura fuera de envolvente',
    (v) => {
      v.temperatureC = 101;
    },
  ],
  [
    'booleano como texto',
    (v) => {
      v.rainDetected = 'false';
    },
  ],
  [
    'feedback omitido',
    (v) => {
      delete v.valve.feedbackOpen;
    },
  ],
  [
    'estado ambiguo de válvula',
    (v) => {
      v.valveOpen = true;
    },
  ],
  [
    'clave adicional anidada',
    (v) => {
      v.soilMoisture.unexpected = 42;
    },
  ],
  [
    'objeto sustituido por array',
    (v) => {
      v.soilMoisture = [42, 28, 55];
    },
  ],
  [
    'fecha imposible',
    (v) => {
      v.recordedAt = '2026-02-30T04:00:00Z';
    },
  ],
])
  test(`rechaza estructura incompatible: ${label}`, async () => {
    const value = payload();
    change(value);
    assert.equal((await inspectTelemetryPayload(value, now)).ok, false);
  });
test('usa la misma regla temporal del ingreso HTTP, con límite inclusivo de 60 segundos', async () => {
  for (const recordedAt of [
    null,
    '2020-01-01T00:00:00Z',
    new Date(now + 60000).toISOString(),
    '2026-11-24T23:00:00-05:00',
  ]) {
    const value = { ...payload(), recordedAt };
    assert.equal((await inspectTelemetryPayload(value, now)).ok, true);
  }
  for (const recordedAt of [new Date(now + 60001).toISOString(), '2026-11-25T04:00:00']) {
    const result = await inspectTelemetryPayload({ ...payload(), recordedAt }, now);
    assert.equal(result.ok, false);
    assert.deepEqual(result.fields, ['recordedAt']);
  }
});
test('no expone valores ni claves desconocidas en los errores', async () => {
  const marker = 'synthetic-private-marker-never-print';
  const value = { ...payload(), [marker]: marker, valve: { ...payload().valve, [marker]: marker } };
  const result = await inspectTelemetryPayload(value, now);
  assert.equal(result.ok, false);
  assert.ok(result.fields.includes('campo_no_admitido'));
  assert.equal(JSON.stringify(result).includes(marker), false);
});
test('rechaza raíces que no son objetos', async () => {
  for (const value of [null, [], true, 'not-json-object'])
    assert.equal((await inspectTelemetryPayload(value, now)).ok, false);
});
test('archivos privados acotados; rechaza escapes, enlaces y argumentos ambiguos', async (t) => {
  const base = resolve('.local');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'unit-iot-contract-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, '.local'));
  await mkdir(join(directory, 'public'));
  await writeFile(join(directory, '.local', 'payload.json'), JSON.stringify(payload()));
  await writeFile(join(directory, 'public', 'payload.json'), JSON.stringify(payload()));
  assert.deepEqual(
    await readTelemetryInput(['--input', '.local/payload.json'], directory),
    payload(),
  );
  for (const args of [[], ['--send'], ['--demo', '--send'], ['--input', 'public/payload.json']])
    await assert.rejects(readTelemetryInput(args, directory));
  await writeFile(join(directory, '.local', 'large.json'), ' '.repeat(65537));
  await assert.rejects(readTelemetryInput(['--input', '.local/large.json'], directory), /64 KiB/);
  await writeFile(join(directory, '.local', 'payload.txt'), JSON.stringify(payload()));
  await assert.rejects(readTelemetryInput(['--input', '.local/payload.txt'], directory));
  await symlink(
    join(directory, 'public'),
    join(directory, '.local', 'alias'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(readTelemetryInput(['--input', '.local/alias/payload.json'], directory));
});
test('CLI de demo y archivo privado no necesita servicios y no imprime secretos al fallar', async (t) => {
  const base = resolve('.local');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'unit-iot-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = resolve('.');
  const run = (args) =>
    spawnSync(process.execPath, [join(root, 'scripts/iot-contract-check.mjs'), ...args], {
      cwd: root,
      timeout: 60000,
      encoding: 'utf8',
      // The command neither reads this setting nor attempts to connect.
      env: { ...process.env, DATABASE_URL: 'not-a-valid-database-url' },
    });
  const demo = run(['--demo']);
  assert.ifError(demo.error);
  assert.equal(demo.status, 0, demo.stderr);
  assert.match(demo.stdout, /no se enviaron datos/);
  const marker = 'synthetic-secret-never-print';
  const path = join(directory, 'payload.json');
  await writeFile(path, JSON.stringify({ ...payload(), deviceKey: marker }));
  const bad = run(['--input', path]);
  assert.ifError(bad.error);
  assert.equal(bad.status, 1);
  assert.equal((bad.stdout + bad.stderr).includes(marker), false);
  assert.match(bad.stderr, /campo_no_admitido/);
  await writeFile(path, JSON.stringify(payload()));
  const good = run(['--input', path]);
  assert.ifError(good.error);
  assert.equal(good.status, 0, good.stderr);
  await writeFile(path, 'invalid JSON ' + marker);
  const malformed = run(['--input', path]);
  assert.equal(malformed.status, 1);
  assert.equal((malformed.stdout + malformed.stderr).includes(marker), false);
});
