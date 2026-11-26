import type { Prisma } from '@prisma/client';
import type { IotTelemetryPayload, QualityKey, TelemetryReading } from '@cacaosmart/contracts';

export const soilCodes = ['soil_1', 'soil_2', 'soil_3'] as const;
export const readingInclude = {
  soilReadings: { include: { sensor: { select: { code: true } } } },
} satisfies Prisma.ReadingInclude;
export type StoredReading = Prisma.ReadingGetPayload<{ include: typeof readingInclude }>;

export function normalize(
  input: IotTelemetryPayload,
  enabled: ReadonlySet<string>,
  receivedAt: Date,
  source: 'real' | 'demo',
): TelemetryReading {
  const sensorValue = <T>(code: string, value: T | null): T | null =>
    enabled.has(code) ? value : null;
  const soilMoisture = {
    soil_1: sensorValue('soil_1', input.soilMoisture.soil_1),
    soil_2: sensorValue('soil_2', input.soilMoisture.soil_2),
    soil_3: sensorValue('soil_3', input.soilMoisture.soil_3),
  };
  const temperatureC = sensorValue('temperatureC', input.temperatureC);
  const airHumidityPct = sensorValue('airHumidityPct', input.airHumidityPct);
  const rainDetected = sensorValue('rainDetected', input.rainDetected);
  const qualityOf = (value: number | boolean | null) =>
    value === null
      ? ('missing' as const)
      : typeof value === 'number'
        ? ('uncalibrated' as const)
        : ('valid' as const);
  return {
    eventId: input.eventId,
    deviceId: input.deviceId,
    recordedAt: input.recordedAt === null ? null : new Date(input.recordedAt).toISOString(),
    receivedAt: receivedAt.toISOString(),
    timestampOrigin: input.recordedAt === null ? 'server' : 'device',
    source,
    soilMoisture,
    temperatureC,
    airHumidityPct,
    rainDetected,
    valve: { ...input.valve },
    quality: {
      soil_1: qualityOf(soilMoisture.soil_1),
      soil_2: qualityOf(soilMoisture.soil_2),
      soil_3: qualityOf(soilMoisture.soil_3),
      temperatureC: qualityOf(temperatureC),
      airHumidityPct: qualityOf(airHumidityPct),
      rainDetected: qualityOf(rainDetected),
      relayCommandedOpen: qualityOf(input.valve.relayCommandedOpen),
      feedbackOpen: qualityOf(input.valve.feedbackOpen),
    },
  };
}

export function toReading(row: StoredReading): TelemetryReading {
  const soilMoisture: TelemetryReading['soilMoisture'] = {
    soil_1: null,
    soil_2: null,
    soil_3: null,
  };
  for (const soil of row.soilReadings) {
    const code = soil.sensor.code;
    if (code === 'soil_1' || code === 'soil_2' || code === 'soil_3')
      soilMoisture[code] = soil.moisturePct;
  }
  return {
    eventId: row.eventId,
    deviceId: row.deviceId,
    recordedAt: row.recordedAt?.toISOString() ?? null,
    receivedAt: row.receivedAt.toISOString(),
    ...(row.timestampOrigin === 'server' &&
    row.recordedAt === null &&
    /^thingspeak:3554501:[1-9]\d*$/.test(row.eventId)
      ? { providerObservedAt: row.effectiveAt.toISOString() }
      : {}),
    timestampOrigin: row.timestampOrigin === 'device' ? 'device' : 'server',
    source: row.source,
    soilMoisture,
    temperatureC: row.temperatureC,
    airHumidityPct: row.airHumidityPct,
    rainDetected: row.rainDetected,
    valve: { relayCommandedOpen: row.relayCommandedOpen, feedbackOpen: row.feedbackOpen },
    quality: row.quality as unknown as Record<QualityKey, TelemetryReading['quality'][QualityKey]>,
  };
}
