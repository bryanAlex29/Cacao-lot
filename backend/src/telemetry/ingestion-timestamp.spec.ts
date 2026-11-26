import { requireTelemetryTimestamp } from './ingestion-timestamp';

describe('Reloj de ingreso compartido por HTTP y comprobación offline', () => {
  const now = Date.parse('2026-11-25T04:00:00.000Z');
  it.each([
    null,
    '2026-11-25T04:00:00.000Z',
    '2026-11-25T04:01:00.000Z',
    '2026-11-24T23:00:00.000-05:00',
    '2020-01-01T00:00:00Z',
  ])('acepta reloj nulo/antiguo y hasta el límite inclusivo %s', (value) => {
    expect(() => requireTelemetryTimestamp(value, now)).not.toThrow();
  });
  it.each(['2026-11-25T04:01:00.001Z', '2026-11-25T04:02:00Z', '2026-11-25T04:00:00'])(
    'rechaza adelanto excesivo o ausencia de zona %s',
    (value) => {
      expect(() => requireTelemetryTimestamp(value, now)).toThrow(
        'recordedAt requiere zona horaria',
      );
    },
  );
});
