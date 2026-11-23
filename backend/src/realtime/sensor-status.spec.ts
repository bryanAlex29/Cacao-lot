import { sensorStatus, sensorStatusSignature } from './sensor-status';

const now = new Date('2026-11-22T12:00:00Z');
const sub = { plotId: 'plot', deviceId: 'device', source: 'demo' } as const;
function evidence(): Parameters<typeof sensorStatus>[1] {
  return {
    isActive: true,
    expectedIntervalSeconds: 60,
    sensors: [
      {
        id: 'a',
        code: 'soil_1',
        enabled: true,
        thresholds: [{ minValue: 20, maxValue: 60, version: 1 }],
      },
      { id: 'b', code: 'soil_2', enabled: true, thresholds: [] },
      { id: 'c', code: 'soil_3', enabled: true, thresholds: [] },
      { id: 'rain', code: 'rainDetected', enabled: true, thresholds: [] },
    ],
    readings: [
      {
        id: 'reading',
        deviceId: 'device',
        source: 'demo',
        eventId: 'evt',
        payloadHash: 'private',
        ingestionOrder: 1n,
        effectiveAt: now,
        recordedAt: null,
        receivedAt: now,
        timestampOrigin: 'server',
        temperatureC: 28,
        airHumidityPct: 70,
        rainDetected: false,
        relayCommandedOpen: true,
        feedbackOpen: null,
        quality: {
          soil_1: 'uncalibrated',
          soil_2: 'missing',
          soil_3: 'uncalibrated',
          rainDetected: 'valid',
        },
        soilReadings: [
          {
            id: 'ra',
            readingId: 'reading',
            sensorId: 'a',
            sensor: { code: 'soil_1' },
            moisturePct: 20,
            quality: 'uncalibrated',
          },
          {
            id: 'rb',
            readingId: 'reading',
            sensorId: 'b',
            sensor: { code: 'soil_2' },
            moisturePct: null,
            quality: 'missing',
          },
          {
            id: 'rc',
            readingId: 'reading',
            sensorId: 'c',
            sensor: { code: 'soil_3' },
            moisturePct: 0,
            quality: 'uncalibrated',
          },
        ],
      },
    ],
  };
}

describe('Estado observado por sensor', () => {
  it('sin lecturas conserva UUID y no inventa contacto, calidad ni rango', () => {
    const device = evidence();
    device.readings = [];
    const event = sensorStatus(sub, device, now);
    expect(event).toMatchObject({ readingId: null, observedAt: null });
    expect(
      event.sensors.every(
        (s) => s.quality === null && s.freshness === 'unknown' && s.range === null,
      ),
    ).toBe(true);
  });
  it('missing no afecta otras sondas; cero/false y calidad sin calibrar se conservan', () => {
    const event = sensorStatus(sub, evidence(), now);
    expect(event.sensors).toEqual([
      expect.objectContaining({
        sensorId: 'a',
        code: 'soil_1',
        quality: 'uncalibrated',
        range: 'within',
        freshness: 'fresh',
      }),
      expect.objectContaining({
        sensorId: 'b',
        quality: 'missing',
        range: null,
        freshness: 'fresh',
      }),
      expect.objectContaining({ sensorId: 'c', range: 'unconfigured' }),
      expect.objectContaining({ sensorId: 'rain', quality: 'valid', range: 'not_applicable' }),
    ]);
    expect(JSON.stringify(event)).not.toMatch(/private|payloadHash|ingestionOrder|relay|feedback/);
  });
  it.each([
    [19, 'low'],
    [20, 'within'],
    [60, 'within'],
    [61, 'high'],
  ] as const)('valor %s compara %s sin inventar calibración', (value, comparison) => {
    const device = evidence();
    device.readings[0]!.soilReadings[0]!.moisturePct = value;
    expect(sensorStatus(sub, device, now).sensors[0]).toMatchObject({
      range: comparison,
      quality: 'uncalibrated',
    });
  });
  it('antigüedad usa tiempo efectivo, no recepción/contacto nuevo; límite dos intervalos inclusivo', () => {
    expect(sensorStatus(sub, evidence(), new Date(+now + 120000)).sensors[0]!.freshness).toBe(
      'fresh',
    );
    const stale = sensorStatus(sub, evidence(), new Date(+now + 120001));
    expect(stale.sensors.every((s) => s.freshness === 'stale' && s.range === null)).toBe(true);
  });
  it('deshabilitar monitoreo no cambia la calidad persistida ni permite comparación', () => {
    const device = evidence();
    device.sensors[0]!.enabled = false;
    expect(sensorStatus(sub, device, now).sensors[0]).toMatchObject({
      enabled: false,
      quality: 'uncalibrated',
      range: null,
    });
    device.isActive = false;
    expect(
      sensorStatus(sub, device, now).sensors.every((s) => !s.enabled && s.range === null),
    ).toBe(true);
  });
  it('calidad inválida no compara; metadatos desconocidos fallan de forma cerrada', () => {
    const device = evidence();
    device.readings[0]!.quality = { soil_1: 'unexpected' };
    expect(sensorStatus(sub, device, now).sensors[0]).toMatchObject({
      quality: 'invalid',
      range: null,
    });
  });
  it('firma ignora relojes/IDs pero detecta rango y antigüedad', () => {
    const event = sensorStatus(sub, evidence(), now);
    expect(sensorStatusSignature(event)).toBe(
      sensorStatusSignature({
        ...event,
        readingId: 'other',
        evaluatedAt: new Date(+now + 1000).toISOString(),
      }),
    );
    const device = evidence();
    device.sensors[0]!.thresholds[0]!.version++;
    expect(sensorStatusSignature(event)).not.toBe(
      sensorStatusSignature(sensorStatus(sub, device, now)),
    );
    expect(sensorStatusSignature(event)).not.toBe(
      sensorStatusSignature(sensorStatus(sub, evidence(), new Date(+now + 120001))),
    );
  });
});
