import type { Prisma } from '@prisma/client';
import type {
  MonitoredSensorCode,
  SensorHealth,
  SensorStatusEvent,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import { readingInclude, toReading } from '../telemetry/telemetry.mapping';

/** Consistent evidence snapshot; credentials and private reading metadata are never projected. */
export const sensorStatusSelect = {
  isActive: true,
  expectedIntervalSeconds: true,
  sensors: {
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      enabled: true,
      thresholds: { select: { minValue: true, maxValue: true, version: true } },
    },
  },
  readings: {
    take: 1,
    orderBy: [{ effectiveAt: 'desc' }, { receivedAt: 'desc' }, { ingestionOrder: 'desc' }],
    include: readingInclude,
  },
} satisfies Prisma.DeviceSelect;

type Evidence = Prisma.DeviceGetPayload<{ select: typeof sensorStatusSelect }>;
const qualities: readonly SensorHealth[] = ['valid', 'missing', 'invalid', 'uncalibrated'];

export function sensorStatus(
  sub: TelemetrySubscription,
  device: Evidence,
  now = new Date(),
): SensorStatusEvent {
  const stored = device.readings[0];
  const reading = stored ? toReading(stored) : null;
  const freshness = !stored
    ? 'unknown'
    : now.getTime() - stored.effectiveAt.getTime() > device.expectedIntervalSeconds * 2000
      ? 'stale'
      : 'fresh';
  return {
    schemaVersion: '1.0',
    ...sub,
    evaluatedAt: now.toISOString(),
    readingId: stored?.id ?? null,
    observedAt: stored?.effectiveAt.toISOString() ?? null,
    sensors: device.sensors.map((sensor) => {
      const code: MonitoredSensorCode = sensor.code;
      const rawQuality = reading?.quality[code];
      const quality = !reading ? null : qualities.includes(rawQuality!) ? rawQuality! : 'invalid';
      const value = !reading
        ? null
        : code === 'soil_1' || code === 'soil_2' || code === 'soil_3'
          ? reading.soilMoisture[code]
          : reading[code];
      const range = sensor.thresholds[0];
      let comparison: SensorStatusEvent['sensors'][number]['range'] = null;
      if (
        device.isActive &&
        sensor.enabled &&
        freshness === 'fresh' &&
        quality !== 'missing' &&
        quality !== 'invalid' &&
        value !== null
      ) {
        if (code === 'rainDetected') comparison = 'not_applicable';
        else if (typeof value === 'number' && Number.isFinite(value))
          comparison = !range
            ? 'unconfigured'
            : value < range.minValue
              ? 'low'
              : value > range.maxValue
                ? 'high'
                : 'within';
      }
      return {
        sensorId: sensor.id,
        code,
        enabled: device.isActive && sensor.enabled,
        quality,
        freshness,
        range: comparison,
        rangeVersion: range?.version ?? null,
      };
    }),
  };
}

/** Dates/reading IDs are evidence, not changes of health. Avoid periodic identical invalidations. */
export function sensorStatusSignature(event: SensorStatusEvent): string {
  return JSON.stringify(event.sensors);
}
