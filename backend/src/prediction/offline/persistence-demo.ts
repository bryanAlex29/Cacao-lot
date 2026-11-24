import type { PersistenceInput, PersistenceObservation } from './persistence-input';
import { dayMs, soilCodes } from './persistence-input';

/** Deterministic software fixture, never measurements or a crop response model. */
export function syntheticPersistenceInput(): PersistenceInput {
  const observations: PersistenceObservation[] = [];
  const sensors = soilCodes.map((code) => ({ code, id: `synthetic-${code}` }));
  const start = Date.parse('2026-09-30T00:00:00.000Z');
  for (let day = 0; day < 61; day++) {
    const observed = new Date(start + day * dayMs + 12 * 3600000).toISOString();
    for (const [zone, sensor] of sensors.entries()) {
      observations.push({
        eventId: `synthetic-day-${day}`,
        ingestionOrder: String(day + 1),
        plotId: 'synthetic-plot',
        deviceId: 'synthetic-device',
        source: 'demo',
        sensorId: sensor.id,
        code: sensor.code,
        recordedAt: observed,
        receivedAt: new Date(Date.parse(observed) + 1000).toISOString(),
        moisturePct: 20 + zone * 15 + ((day * (zone + 1)) % 11),
        quality: 'valid',
      });
    }
  }
  return {
    schemaVersion: '1.0',
    plotId: 'synthetic-plot',
    deviceId: 'synthetic-device',
    source: 'demo',
    asOf: '2026-11-30T00:00:00.000Z',
    from: '2026-10-01',
    toExclusive: '2026-11-30',
    trainUntil: '2026-11-01',
    validationUntil: '2026-11-15',
    sensors,
    observations,
  };
}
