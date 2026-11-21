import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import {
  simulatorPayload,
  sendWithRetry,
  sendUntilAvailable,
  SimulatorUnavailableError,
  validateSimulatorConfig,
} from './simulator-core.mjs';

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

test('modo continuo conserva evento y payload y limita la espera entre recuperaciones', async () => {
  const payload = simulatorPayload(config.deviceId, 'restart', 1, '2026-11-21T00:00:00Z');
  const bodies = [],
    waits = [],
    notices = [];
  const result = await sendUntilAvailable(config, payload, {
    persistent: true,
    send: async (_config, input) => {
      bodies.push(JSON.stringify(input));
      if (bodies.length < 6) throw new SimulatorUnavailableError('temporary');
      return { duplicate: true, reading: { source: 'demo' } };
    },
    wait: async (ms) => waits.push(ms),
    onWaiting: (ms) => notices.push(ms),
  });
  assert.equal(result.duplicate, true);
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(waits, [5000, 10000, 20000, 30000, 30000]);
  assert.deepEqual(notices, waits);
});

test('ejecución finita no espera indefinidamente tras agotar su lote', async () => {
  let calls = 0;
  await assert.rejects(
    sendUntilAvailable(
      config,
      {},
      {
        send: async () => {
          calls++;
          throw new SimulatorUnavailableError('temporary');
        },
        wait: async () => assert.fail('No debe entrar en espera continua'),
      },
    ),
    SimulatorUnavailableError,
  );
  assert.equal(calls, 1);
});

test('modo continuo no oculta 400/401/403/409 ni origen real bajo reintentos', async () => {
  for (const status of [400, 401, 403, 409, 201]) {
    let calls = 0;
    await assert.rejects(
      sendUntilAvailable(
        config,
        {},
        {
          persistent: true,
          send: (cfg, payload, options) =>
            sendWithRetry(cfg, payload, {
              ...options,
              fetchFn: async () => {
                calls++;
                return status === 201
                  ? Response.json({ reading: { source: 'real' } }, { status })
                  : new Response('', { status });
              },
            }),
          wait: async () => assert.fail('Rechazos permanentes no se reintentan'),
        },
      ),
    );
    assert.equal(calls, 1);
  }
});

test('Ctrl+C durante la espera de recuperación no reenvía el evento', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    sendUntilAvailable(
      config,
      {},
      {
        persistent: true,
        signal: controller.signal,
        send: async () => {
          calls++;
          throw new SimulatorUnavailableError('temporary');
        },
        wait: async (_ms, _value, { signal }) => {
          controller.abort();
          signal.throwIfAborted();
        },
      },
    ),
  );
  assert.equal(calls, 1);
});

test('HTTP local real recupera cuatro 503 sin cambiar ID, fecha ni valores', async () => {
  const bodies = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    bodies.push(body);
    response.writeHead(bodies.length <= 4 ? 503 : 201, { 'Content-Type': 'application/json' });
    response.end(
      bodies.length <= 4 ? '{}' : JSON.stringify({ duplicate: false, reading: { source: 'demo' } }),
    );
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    const local = { ...config, endpoint: `http://127.0.0.1:${address.port}/api/v1/iot/telemetry` };
    const payload = simulatorPayload(config.deviceId, 'http-recovery', 0, '2026-11-21T00:00:00Z');
    const result = await sendUntilAvailable(local, payload, {
      persistent: true,
      wait: async () => {},
      send: (cfg, input, options) =>
        sendWithRetry(cfg, input, { ...options, wait: async () => {} }),
    });
    assert.equal(result.reading.source, 'demo');
    assert.equal(bodies.length, 5);
    assert.equal(new Set(bodies).size, 1);
    assert.deepEqual(JSON.parse(bodies[4]), payload);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
