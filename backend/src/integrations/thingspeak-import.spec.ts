import { randomUUID } from 'node:crypto';
import { ThingSpeakImportService } from './thingspeak-import.service';
import { ThingSpeakClient, ThingSpeakSnapshot } from './thingspeak.client';
import { PrismaService } from '../database/prisma.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { parseThingSpeakBinding } from './thingspeak-binding';
import { requireExternalObservation } from '../telemetry/external-observation';
import { TelemetryRepository } from '../telemetry/telemetry.repository';
import { toReading, StoredReading } from '../telemetry/telemetry.mapping';
import { SourcePolicy } from './source-policy.service';
import { RealtimeService } from '../realtime/realtime.service';

const target = {
  ownerId: randomUUID(),
  plotId: randomUUID(),
  deviceId: randomUUID(),
  channelId: 3554501,
  pollIntervalSeconds: 60,
};
const data: ThingSpeakSnapshot = {
  channelId: 3554501,
  mappingStatus: 'pending',
  entry: {
    entryId: 167,
    createdAt: '2026-11-26T00:12:12Z',
    fields: { field1: '26', field2: '62', field3: '0' },
  },
};
const device = {
  id: target.deviceId,
  plotId: target.plotId,
  source: 'real' as const,
  credentialHash: 'f'.repeat(64),
};

describe('ThingSpeak import isolation and provenance', () => {
  const oldEnv = { ...process.env };
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.THINGSPEAK_CHANNEL_ID = '3554501';
  });
  afterEach(() => {
    process.env = { ...oldEnv };
  });
  const setup = () => {
    const db = { device: { findFirst: jest.fn().mockResolvedValue(device) } };
    const telemetry = { ingest: jest.fn().mockResolvedValue({ duplicate: false }) };
    const client = { readLatest: jest.fn().mockResolvedValue(data) };
    const service = new ThingSpeakImportService(
      db as unknown as PrismaService,
      telemetry as unknown as TelemetryService,
      client as unknown as ThingSpeakClient,
    );
    return { service, db, telemetry, client };
  };

  it('binds the real device and owner, preserves provider time and missing sensors', async () => {
    const { service, db, telemetry } = setup();
    expect(await service.runOnce(target)).toEqual({ status: 'imported', entryId: 167 });
    expect(db.device.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: target.deviceId,
          plotId: target.plotId,
          source: 'real',
          isActive: true,
          plot: { ownerId: target.ownerId, archivedAt: null, owner: { isActive: true } },
        }),
      }),
    );
    expect(telemetry.ingest).toHaveBeenCalledWith(
      device,
      expect.objectContaining({
        eventId: 'thingspeak:3554501:167',
        recordedAt: null,
        soilMoisture: { soil_1: 0, soil_2: null, soil_3: null },
        temperatureC: 26,
        airHumidityPct: 62,
        rainDetected: null,
        valve: { relayCommandedOpen: null, feedbackOpen: null },
      }),
      expect.objectContaining({
        providerObservedAt: data.entry!.createdAt,
        ownerId: target.ownerId,
        quality: expect.objectContaining({
          soil_1: 'valid',
          soil_2: 'missing',
          soil_3: 'missing',
          temperatureC: 'uncalibrated',
          airHumidityPct: 'uncalibrated',
        }),
      }),
    );
  });

  it('does not read or ingest when device, plot, owner or source is not authorized', async () => {
    const { service, db, client, telemetry } = setup();
    db.device.findFirst.mockResolvedValue(null);
    await expect(service.runOnce(target)).rejects.toThrow('no autorizada');
    expect(client.readLatest).not.toHaveBeenCalled();
    expect(telemetry.ingest).not.toHaveBeenCalled();
  });

  it.each([
    ['1', true],
    ['0', false],
    ['unknown', null],
  ] as const)('passes field4=%s through the existing ingestion pipeline', async (field4, relay) => {
    const { service, client, telemetry } = setup();
    client.readLatest.mockResolvedValue({
      ...data,
      entry: { ...data.entry!, fields: { ...data.entry!.fields, field4 } },
    });
    await service.runOnce(target);
    expect(telemetry.ingest).toHaveBeenCalledWith(
      device,
      expect.objectContaining({ valve: { relayCommandedOpen: relay, feedbackOpen: null } }),
      expect.objectContaining({
        quality: expect.objectContaining({
          relayCommandedOpen: relay === null ? 'invalid' : 'valid',
          feedbackOpen: 'missing',
        }),
      }),
    );
  });

  it('does not create artificial events for an empty feed or provider failure', async () => {
    const { service, client, telemetry } = setup();
    client.readLatest.mockResolvedValue({ ...data, entry: null });
    expect(await service.runOnce(target)).toEqual({ status: 'empty' });
    client.readLatest.mockRejectedValue(new Error('network'));
    await expect(service.runOnce(target)).rejects.toThrow('network');
    expect(telemetry.ingest).not.toHaveBeenCalled();
  });

  it('retains the same event identity on retries and reports duplicates', async () => {
    const { service, telemetry } = setup();
    telemetry.ingest.mockResolvedValue({ duplicate: true });
    expect(await service.runOnce(target)).toEqual({ status: 'duplicate', entryId: 167 });
    await service.runOnce(target);
    expect(telemetry.ingest.mock.calls[0]).toEqual(telemetry.ingest.mock.calls[1]);
  });

  it('does not import in production or into a different channel', async () => {
    const { service, client } = setup();
    process.env.NODE_ENV = 'production';
    await expect(service.runOnce(target)).rejects.toThrow('no configurado');
    process.env.NODE_ENV = 'development';
    process.env.THINGSPEAK_CHANNEL_ID = '2';
    await expect(service.runOnce(target)).rejects.toThrow('no configurado');
    expect(client.readLatest).not.toHaveBeenCalled();
  });

  it('validates binding and forbids accidental fast polling or owner ambiguity', () => {
    expect(parseThingSpeakBinding(target)).toEqual(target);
    expect(parseThingSpeakBinding({ ...target, pollIntervalSeconds: 20 }).pollIntervalSeconds).toBe(
      20,
    );
    for (const invalid of [
      { ...target, pollIntervalSeconds: 19 },
      { ...target, pollIntervalSeconds: 5 },
      { ...target, ownerId: '' },
      { ...target, channelId: 123 },
      { ...target, deviceKey: 'not-allowed' },
    ])
      expect(() => parseThingSpeakBinding(invalid)).toThrow('inválida');
  });

  it('rejects provider timestamps from the future, invalid dates or non-null device dates', () => {
    const base = {
      ownerId: target.ownerId,
      channelId: 3554501,
      entryId: 167,
      providerObservedAt: 'invalid',
      quality: {} as Parameters<typeof requireExternalObservation>[0]['quality'],
    };
    expect(() => requireExternalObservation(base, 'thingspeak:3554501:167', null)).toThrow();
    expect(() =>
      requireExternalObservation(
        {
          ...base,
          providerObservedAt: new Date(Date.now() + 120000).toISOString(),
        },
        'thingspeak:3554501:167',
        null,
      ),
    ).toThrow();
    expect(() =>
      requireExternalObservation(
        {
          ...base,
          providerObservedAt: data.entry!.createdAt,
        },
        'thingspeak:3554501:167',
        data.entry!.createdAt,
      ),
    ).toThrow();
  });

  it('projects provider time independently from the actual backend receipt time', () => {
    const row = {
      eventId: 'thingspeak:3554501:167',
      deviceId: device.id,
      source: 'real',
      recordedAt: null,
      timestampOrigin: 'server',
      receivedAt: new Date('2026-11-26T02:00:00Z'),
      effectiveAt: new Date(data.entry!.createdAt),
      soilReadings: [],
      quality: {},
      temperatureC: 26,
      airHumidityPct: 62,
      rainDetected: null,
      relayCommandedOpen: null,
      feedbackOpen: null,
    } as unknown as StoredReading;
    expect(toReading(row)).toMatchObject({
      providerObservedAt: '2026-11-26T00:12:12.000Z',
      receivedAt: '2026-11-26T02:00:00.000Z',
      recordedAt: null,
      timestampOrigin: 'server',
    });
  });

  it('rechecks owner and serial under the ingestion transaction before even deduplicating', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      device: {
        findUnique: jest.fn().mockResolvedValue({
          ...device,
          isActive: true,
          serial: 'thingspeak-3554501',
          lastSeenAt: null,
          plot: { ownerId: randomUUID(), archivedAt: null, owner: { isActive: true } },
        }),
      },
      reading: { findUnique: jest.fn() },
    };
    const db = { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) };
    const repo = new TelemetryRepository(db as unknown as PrismaService);
    await expect(
      repo.ingest(
        device,
        {
          schemaVersion: '1.2',
          deviceId: device.id,
          eventId: 'thingspeak:3554501:167',
          recordedAt: null,
          soilMoisture: { soil_1: 0, soil_2: null, soil_3: null },
          temperatureC: 26,
          airHumidityPct: 62,
          rainDetected: null,
          valve: { relayCommandedOpen: null, feedbackOpen: null },
        },
        'hash',
        {
          ownerId: target.ownerId,
          channelId: 3554501,
          entryId: 167,
          providerObservedAt: data.entry!.createdAt,
          quality: {} as Parameters<typeof requireExternalObservation>[0]['quality'],
        },
      ),
    ).rejects.toThrow('Credencial');
    expect(tx.reading.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a forged ThingSpeak namespace from ordinary HTTP ingestion', async () => {
    const telemetry = new TelemetryService(
      {} as TelemetryRepository,
      {} as SourcePolicy,
      {} as RealtimeService,
    );
    await expect(
      telemetry.ingest(device, {
        schemaVersion: '1.2',
        deviceId: device.id,
        eventId: 'thingspeak:3554501:167',
        recordedAt: null,
        soilMoisture: { soil_1: 0, soil_2: null, soil_3: null },
        temperatureC: 26,
        airHumidityPct: 62,
        rainDetected: null,
        valve: { relayCommandedOpen: null, feedbackOpen: null },
      }),
    ).rejects.toThrow('Namespace reservado');
  });
});
