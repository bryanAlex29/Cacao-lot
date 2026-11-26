import { simulatorPayload } from './simulator-core.mjs';

/** Deliberately fictional, repeatable scenarios; never an agronomic/firmware policy. */
export function simulationScenarios(deviceId, issuedAt) {
  const now = Date.parse(issuedAt);
  if (!Number.isFinite(now)) throw new Error('Fecha sintética inválida');
  const make = (name, age, changes = {}) => ({
    ...simulatorPayload(deviceId, 'scenario-v1', 0, new Date(now - age).toISOString()),
    eventId: `sim:scenario-v1:${name}`,
    soilMoisture: { soil_1: 45, soil_2: 55, soil_3: 65 },
    valve: { relayCommandedOpen: false, feedbackOpen: null },
    ...changes,
  });
  const normal = make('normal', 20000);
  return {
    schemaVersion: 'simulation-scenarios-v1',
    source: 'demo',
    disclaimer: 'Datos ficticios; no validan sensores, cultivo, predicciones ni riego físico.',
    hypotheticalRange: { min: 30, max: 70, unit: '%', agronomicallyValidated: false },
    steps: [
      { name: 'normal', expectedStatus: 201, payload: normal },
      {
        name: 'low',
        expectedStatus: 201,
        payload: make('low', 19000, { soilMoisture: { soil_1: 15, soil_2: 55, soil_3: 65 } }),
      },
      {
        name: 'high',
        expectedStatus: 201,
        payload: make('high', 18000, { soilMoisture: { soil_1: 15, soil_2: 85, soil_3: 65 } }),
      },
      {
        name: 'missing-soil-2',
        expectedStatus: 201,
        payload: make('missing', 17000, { soilMoisture: { soil_1: 0, soil_2: null, soil_3: 65 } }),
      },
      { name: 'sensor-recovered', expectedStatus: 201, payload: make('recovered', 16000) },
      {
        name: 'relay-observation',
        expectedStatus: 201,
        payload: make('relay', 15000, {
          valve: { relayCommandedOpen: true, feedbackOpen: null },
        }),
      },
      {
        name: 'rain-observation',
        expectedStatus: 201,
        payload: make('rain', 14000, { rainDetected: true }),
      },
      {
        name: 'duplicate',
        expectedStatus: 201,
        expectedDuplicate: true,
        payload: make('rain', 14000, { rainDetected: true }),
      },
      {
        name: 'conflicting-id',
        expectedStatus: 409,
        payload: make('rain', 14000, { rainDetected: false }),
      },
      {
        name: 'late-message',
        expectedStatus: 201,
        mustNotReplaceLatest: true,
        payload: make('late', 86400000),
      },
      {
        name: 'invalid-moisture',
        expectedStatus: 400,
        payload: make('invalid', 13000, { soilMoisture: { soil_1: 101, soil_2: 55, soil_3: 65 } }),
      },
      {
        name: 'future-clock',
        expectedStatus: 400,
        payload: make('future', -120000),
      },
      {
        name: 'source-spoof',
        expectedStatus: 201,
        expectedStoredSource: 'demo',
        payload: make('source', 12000, { source: 'real' }),
      },
    ],
  };
}
