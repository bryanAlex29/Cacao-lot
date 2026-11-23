import type {
  MonitoredSensorCode,
  SensorStatusEvent,
  TelemetrySubscription,
} from '@cacaosmart/contracts';

const codes: readonly MonitoredSensorCode[] = [
  'soil_1',
  'soil_2',
  'soil_3',
  'temperatureC',
  'airHumidityPct',
  'rainDetected',
];
const date = (value: unknown) =>
  typeof value === 'string' &&
  /(Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

export function matchesSensorStatus(
  value: unknown,
  selection: TelemetrySubscription,
): value is SensorStatusEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as SensorStatusEvent;
  if (
    event.schemaVersion !== '1.0' ||
    event.plotId !== selection.plotId ||
    event.deviceId !== selection.deviceId ||
    event.source !== selection.source ||
    !date(event.evaluatedAt) ||
    !(
      (event.readingId === null && event.observedAt === null) ||
      (typeof event.readingId === 'string' && !!event.readingId && date(event.observedAt))
    ) ||
    !Array.isArray(event.sensors) ||
    event.sensors.length < 1 ||
    event.sensors.length > 6
  )
    return false;
  const ids = new Set<string>(),
    seenCodes = new Set<string>();
  return event.sensors.every((sensor) => {
    if (
      !sensor ||
      typeof sensor !== 'object' ||
      typeof sensor.sensorId !== 'string' ||
      !sensor.sensorId ||
      !codes.includes(sensor.code) ||
      ids.has(sensor.sensorId) ||
      seenCodes.has(sensor.code) ||
      typeof sensor.enabled !== 'boolean' ||
      ![null, 'valid', 'missing', 'invalid', 'uncalibrated'].includes(sensor.quality) ||
      !['unknown', 'fresh', 'stale'].includes(sensor.freshness) ||
      ![null, 'low', 'within', 'high', 'unconfigured', 'not_applicable'].includes(sensor.range) ||
      !(
        sensor.rangeVersion === null ||
        (Number.isInteger(sensor.rangeVersion) && sensor.rangeVersion > 0)
      )
    )
      return false;
    if (
      event.readingId === null
        ? sensor.quality !== null || sensor.freshness !== 'unknown'
        : sensor.quality === null || sensor.freshness === 'unknown'
    )
      return false;
    if (
      (!sensor.enabled ||
        sensor.freshness !== 'fresh' ||
        sensor.quality === 'missing' ||
        sensor.quality === 'invalid') &&
      sensor.range !== null
    )
      return false;
    if (
      sensor.code === 'rainDetected'
        ? sensor.rangeVersion !== null ||
          (sensor.range !== null && sensor.range !== 'not_applicable')
        : sensor.range === 'not_applicable'
    )
      return false;
    if (
      (['low', 'within', 'high'].includes(sensor.range ?? '') && sensor.rangeVersion === null) ||
      (sensor.range === 'unconfigured' && sensor.rangeVersion !== null)
    )
      return false;
    ids.add(sensor.sensorId);
    seenCodes.add(sensor.code);
    return true;
  });
}
