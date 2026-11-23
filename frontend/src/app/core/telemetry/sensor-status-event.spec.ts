import { describe, expect, it } from 'vitest';
import type { SensorStatusEvent } from '@cacaosmart/contracts';
import { matchesSensorStatus } from './sensor-status-event';

const selection = { plotId: 'plot', deviceId: 'device', source: 'demo' } as const;
const event: SensorStatusEvent = {
  ...selection,
  schemaVersion: '1.0',
  evaluatedAt: '2026-11-22T12:00:00Z',
  readingId: 'reading',
  observedAt: '2026-11-22T11:59:00Z',
  sensors: [
    {
      sensorId: 'a',
      code: 'soil_1',
      enabled: true,
      quality: 'uncalibrated',
      freshness: 'fresh',
      range: 'within',
      rangeVersion: 1,
    },
  ],
};
describe('Validación sensor.status', () => {
  it('acepta estados actuales, missing y desconocido sin confundir calibración', () => {
    expect(matchesSensorStatus(event, selection)).toBe(true);
    expect(
      matchesSensorStatus(
        { ...event, sensors: [{ ...event.sensors[0], quality: 'missing', range: null }] },
        selection,
      ),
    ).toBe(true);
    expect(
      matchesSensorStatus(
        {
          ...event,
          readingId: null,
          observedAt: null,
          sensors: [{ ...event.sensors[0], quality: null, freshness: 'unknown', range: null }],
        },
        selection,
      ),
    ).toBe(true);
  });
  it.each([
    null,
    {},
    { ...event, schemaVersion: '1.2' },
    { ...event, plotId: 'other' },
    { ...event, source: 'real' },
    { ...event, deviceId: 'other' },
    { ...event, evaluatedAt: 'invalid' },
    { ...event, readingId: null },
    { ...event, sensors: [] },
    { ...event, sensors: [...event.sensors, ...event.sensors] },
  ])('rechaza envoltura incompatible: %j', (value) =>
    expect(matchesSensorStatus(value, selection)).toBe(false),
  );
  it.each([
    { sensorId: '' },
    { code: 'valve' },
    { enabled: 'true' },
    { quality: 'calibrated' },
    { freshness: 'online' },
    { range: 'normal' },
    { rangeVersion: 0 },
    { rangeVersion: null },
    { quality: 'missing' },
    { quality: 'invalid' },
    { freshness: 'stale' },
    { enabled: false },
    { code: 'rainDetected' },
    { range: 'not_applicable' },
    { range: 'unconfigured' },
  ])('rechaza estado incoherente: %j', (override) => {
    expect(
      matchesSensorStatus({ ...event, sensors: [{ ...event.sensors[0], ...override }] }, selection),
    ).toBe(false);
  });
});
