import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { simulatorPayload, sendWithRetry, validateSimulatorConfig } from './simulator-core.mjs';

const config = {
  source: 'demo',
  endpoint: 'http://127.0.0.1:3100/api/v1/iot/telemetry',
  deviceId: randomUUID(),
  deviceKey: 'a'.repeat(64),
};
test('tres series deterministas, identidad estable y sin feedback físico inventado', () => {
  const a = simulatorPayload(config.deviceId, 'run', 4, null);
  assert.deepEqual(a, simulatorPayload(config.deviceId, 'run', 4, null));
  assert.equal(new Set(Object.values(a.soilMoisture)).size, 3);
  assert.equal(a.valve.feedbackOpen, null);
  assert.equal(a.source, 'demo');
  assert.notDeepEqual(
    a.soilMoisture,
    simulatorPayload(config.deviceId, 'run', 5, null).soilMoisture,
  );
});
test('solo endpoint local explícito y credenciales DEMO', () => {
  assert.equal(validateSimulatorConfig(config), config);
  for (const patch of [
    { source: 'real' },
    { endpoint: 'https://example.com/api/v1/iot/telemetry' },
    { endpoint: 'http://user:secret@localhost/api/v1/iot/telemetry' },
    { deviceKey: 'bad' },
  ])
    assert.throws(() => validateSimulatorConfig({ ...config, ...patch }));
});
test('reintentos acotados conservan exactamente el mismo cuerpo e identidad', async () => {
  const bodies = [];
  const waits = [];
  const result = await sendWithRetry(config, simulatorPayload(config.deviceId, 'run', 0, null), {
    fetchFn: async (_url, options) => {
      bodies.push(options.body);
      return bodies.length < 3
        ? new Response('', { status: 503 })
        : Response.json({ duplicate: true, reading: { source: 'demo' } });
    },
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  assert.equal(result.duplicate, true);
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(waits, [500, 1000]);
});
test('401 y 409 no se reintentan, tampoco se acepta respuesta real', async () => {
  for (const status of [401, 409]) {
    let calls = 0;
    await assert.rejects(
      sendWithRetry(
        config,
        {},
        {
          fetchFn: async () => {
            calls++;
            return new Response('', { status });
          },
        },
      ),
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    sendWithRetry(
      config,
      {},
      { fetchFn: async () => Response.json({ reading: { source: 'real' } }) },
    ),
  );
});
test('fallo persistente agota cuatro intentos; cancelación no envía', async () => {
  let calls = 0;
  await assert.rejects(
    sendWithRetry(
      config,
      {},
      {
        fetchFn: async () => {
          calls++;
          throw new Error('offline');
        },
        wait: async () => {},
      },
    ),
  );
  assert.equal(calls, 4);
  await assert.rejects(
    sendWithRetry(
      config,
      {},
      {
        signal: AbortSignal.abort(),
        fetchFn: async () => {
          throw new Error('No debe llamar');
        },
      },
    ),
  );
});
