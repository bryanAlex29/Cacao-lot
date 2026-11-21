import { setTimeout as delay } from 'node:timers/promises';

export function validateSimulatorConfig(config) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const endpoint = new URL(config.endpoint);
  if (
    config.source !== 'demo' ||
    !uuid.test(config.deviceId) ||
    !/^[a-f0-9]{64}$/.test(config.deviceKey) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) ||
    endpoint.protocol !== 'http:' ||
    endpoint.pathname !== '/api/v1/iot/telemetry'
  )
    throw new Error('El simulador requiere credenciales DEMO y endpoint HTTP local explícito.');
  return config;
}

/** Series ficticias independientes; no son política de riego ni calibración. */
export function simulatorPayload(deviceId, runId, sequence, recordedAt) {
  return {
    schemaVersion: '1.2',
    deviceId,
    eventId: `sim:${runId}:${sequence}`,
    recordedAt,
    source: 'demo',
    soilMoisture: {
      soil_1: 25 + (sequence % 31),
      soil_2: 45 + ((sequence * 3) % 29),
      soil_3: 65 - ((sequence * 7) % 41),
    },
    temperatureC: 26 + (sequence % 9) / 10,
    airHumidityPct: 70 + (sequence % 11),
    rainDetected: sequence % 8 === 7,
    valve: { relayCommandedOpen: sequence % 6 < 2, feedbackOpen: null },
  };
}

export async function sendWithRetry(
  config,
  payload,
  { fetchFn = fetch, wait = delay, signal, retries = 3 } = {},
) {
  // Se serializa una vez: todos los reintentos conservan ID, hora y valores.
  const body = JSON.stringify(payload);
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    let response;
    try {
      response = await fetchFn(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': config.deviceId,
          'X-Device-Key': config.deviceKey,
        },
        body,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000),
        redirect: 'error',
      });
    } catch {
      if (signal?.aborted) throw new Error('Simulación detenida');
      if (attempt >= retries) throw new Error('API local no disponible; reintentos agotados');
    }
    if (response?.ok) {
      const result = await response.json();
      if (result.reading?.source !== 'demo')
        throw new Error('El servidor no confirmó origen DEMO; simulación detenida');
      return result;
    }
    if (response && response.status !== 429 && response.status < 500)
      throw new Error(`Telemetría rechazada (HTTP ${response.status}); no se reintenta`);
    if (attempt >= retries) throw new Error('Reintentos agotados');
    await wait(500 * 2 ** attempt, undefined, { signal });
  }
}
