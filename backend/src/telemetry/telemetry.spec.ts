import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { IngestTelemetryDto } from './telemetry.dto';
import { normalize } from './telemetry.mapping';
import { connectionStatus } from '../devices/connection-status';
import { SourcePolicy } from '../integrations/source-policy.service';
import { ConfigService } from '@nestjs/config';

const input = {
  schemaVersion: '1.2' as const,
  deviceId: randomUUID(),
  eventId: 'test:1',
  recordedAt: null,
  soilMoisture: { soil_1: 0, soil_2: 42, soil_3: null },
  temperatureC: 28,
  airHumidityPct: 80,
  rainDetected: false,
  valve: { relayCommandedOpen: true, feedbackOpen: null },
};

describe('Contrato y normalización de telemetría', () => {
  it('acepta null explícito y preserva cero/false sin inferir válvula física', async () => {
    expect(await validate(plainToInstance(IngestTelemetryDto, input))).toHaveLength(0);
    const reading = normalize(
      input,
      new Set(['soil_1', 'soil_2', 'temperatureC', 'airHumidityPct', 'rainDetected']),
      new Date(),
      'real',
    );
    expect(reading.soilMoisture).toEqual(input.soilMoisture);
    expect(reading.rainDetected).toBe(false);
    expect(reading.valve.feedbackOpen).toBeNull();
    expect(reading.quality).toMatchObject({
      soil_1: 'uncalibrated',
      soil_3: 'missing',
      rainDetected: 'valid',
      feedbackOpen: 'missing',
    });
  });
  it.each([
    { soilMoisture: { soil_1: 1, soil_2: 2 } },
    { soilMoisture: { soil_1: 101, soil_2: 2, soil_3: 3 } },
    { soilMoisture: null },
    { valve: null },
    { rainDetected: 'false' },
    { temperatureC: '28' },
    { temperatureC: Infinity },
    { temperatureC: -274 },
    { temperatureC: 101 },
    { recordedAt: '2026-02-30T01:00:00Z' },
    { recordedAt: undefined },
    { airHumidityPct: undefined },
    { valve: { relayCommandedOpen: false } },
    { schemaVersion: '1.0' },
    { deviceId: 'serial' },
  ])('rechaza datos inválidos %j', async (override) => {
    expect(
      (await validate(plainToInstance(IngestTelemetryDto, { ...input, ...override }))).length,
    ).toBeGreaterThan(0);
  });
  it('no arrastra valores de sondas deshabilitadas', () => {
    const reading = normalize(input, new Set(), new Date(), 'demo');
    expect(reading.soilMoisture).toEqual({ soil_1: null, soil_2: null, soil_3: null });
    expect(reading.temperatureC).toBeNull();
    expect(reading.source).toBe('demo');
  });
});

describe('Conexión derivada del intervalo configurado', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  const base = { isActive: true, expectedIntervalSeconds: 60 };
  it.each([
    [0, 'ONLINE'],
    [120000, 'ONLINE'],
    [120001, 'STALE'],
    [300000, 'STALE'],
    [300001, 'OFFLINE'],
  ])('edad %s', (age, status) => {
    expect(
      connectionStatus({ ...base, lastSeenAt: new Date(now.getTime() - Number(age)) }, now),
    ).toBe(status);
  });
  it('no dice online sin evidencia ni con dispositivo deshabilitado', () => {
    expect(connectionStatus({ ...base, lastSeenAt: null }, now)).toBe('UNKNOWN');
    expect(connectionStatus({ ...base, isActive: false, lastSeenAt: now }, now)).toBe('OFFLINE');
  });
});

describe('Canal demo explícito', () => {
  it.each([
    ['production', 'demo', false],
    ['development', 'real', false],
    ['test', 'demo', true],
  ])('%s/%s', (NODE_ENV, TELEMETRY_MODE, allowed) => {
    const policy = new SourcePolicy(new ConfigService({ NODE_ENV, TELEMETRY_MODE }));
    expect(policy.allows('demo')).toBe(allowed);
    expect(policy.allows('real')).toBe(true);
    expect(policy.allows('untrusted' as 'real')).toBe(false); // Entrada desconocida en tiempo de ejecución.
  });
});
