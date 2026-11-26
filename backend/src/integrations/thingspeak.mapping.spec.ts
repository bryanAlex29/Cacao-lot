import type { ThingSpeakSnapshot } from './thingspeak.client';
import { mapThingSpeakSnapshot } from './thingspeak.mapping';

function snapshot(fields: Record<string, string | null>): ThingSpeakSnapshot {
  return {
    channelId: 3554501,
    mappingStatus: 'pending',
    entry: { entryId: 1, createdAt: '2026-11-26T00:00:00Z', fields },
  };
}

describe('Confirmed ThingSpeak channel mapping', () => {
  it('maps environmental fields and only soil A, not hardcoded current values', () => {
    const result = mapThingSpeakSnapshot(snapshot({ field1: '26', field2: '62', field3: '43.5' }));
    expect(result).toMatchObject({
      temperatureC: 26,
      airHumidityPct: 62,
      soilMoisture: { soil_1: 43.5, soil_2: null, soil_3: null },
      rainDetected: null,
      valve: { relayCommandedOpen: null, feedbackOpen: null },
      soilCalibration: { soil_1: 'user-confirmed' },
      quality: { soil_1: 'valid', soil_2: 'missing', soil_3: 'missing' },
    });
    expect(mapThingSpeakSnapshot(snapshot({ field1: '27' }))?.temperatureC).toBe(27);
    expect(result).not.toHaveProperty('recordedAt');
  });

  it('keeps missing measurements null instead of zero', () => {
    const result = mapThingSpeakSnapshot(snapshot({ field1: '', field2: '  ', field3: null }));
    expect(result?.soilMoisture.soil_1).toBeNull();
    expect(result?.quality.soil_1).toBe('missing');
    expect(result?.quality.temperatureC).toBe('missing');
  });

  it.each([
    ['1', true],
    ['0', false],
    [' 1 ', true],
    [' 0 ', false],
  ])('maps relay %s without inferring valve position', (field4, value) => {
    const result = mapThingSpeakSnapshot(snapshot({ field4: String(field4) }));
    expect(result?.valve).toEqual({ relayCommandedOpen: value, feedbackOpen: null });
    expect(result?.quality.relayCommandedOpen).toBe('valid');
    expect(result?.quality.feedbackOpen).toBe('missing');
  });

  it.each([undefined, null, '', '  '])('keeps missing relay unknown (%s), never off', (field4) => {
    const result = mapThingSpeakSnapshot(snapshot(field4 === undefined ? {} : { field4 }));
    expect(result?.valve.relayCommandedOpen).toBeNull();
    expect(result?.quality.relayCommandedOpen).toBe('missing');
  });

  it.each(['2', '-1', 'true', 'false', 'activo', 'NaN', '1.0', '01', '0x1'])(
    'rejects ambiguous or invalid relay %s',
    (field4) => {
      const result = mapThingSpeakSnapshot(snapshot({ field4 }));
      expect(result?.valve).toEqual({ relayCommandedOpen: null, feedbackOpen: null });
      expect(result?.quality.relayCommandedOpen).toBe('invalid');
    },
  );

  it.each(['NaN', 'Infinity', '0x10', 'false', '62%', '1,5', '-1', '101', '1e999'])(
    'marks invalid soil %s without fabricating a measurement',
    (field3) => {
      const result = mapThingSpeakSnapshot(snapshot({ field3 }));
      expect(result?.soilMoisture.soil_1).toBeNull();
      expect(result?.quality.soil_1).toBe('invalid');
    },
  );

  it.each(['0', '100'])('accepts calibrated boundary %s without diagnosing failure', (field3) => {
    expect(mapThingSpeakSnapshot(snapshot({ field3 }))?.quality.soil_1).toBe('valid');
  });

  it('applies physical bounds to environmental measurements', () => {
    const result = mapThingSpeakSnapshot(snapshot({ field1: '-51', field2: '101' }));
    expect(result?.quality.temperatureC).toBe('invalid');
    expect(result?.quality.airHumidityPct).toBe('invalid');
    expect(result?.temperatureC).toBeNull();
  });

  it('handles an empty channel', () => {
    expect(mapThingSpeakSnapshot({ ...snapshot({}), entry: null })).toBeNull();
  });

  it('never applies the map to another channel', () => {
    expect(() => mapThingSpeakSnapshot({ ...snapshot({}), channelId: 123 })).toThrow(
      'mapa confirmado',
    );
  });
});
