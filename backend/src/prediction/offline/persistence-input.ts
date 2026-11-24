import type { SensorHealth, DataSource, SoilSensorId } from '@cacaosmart/contracts';

export const soilCodes: SoilSensorId[] = ['soil_1', 'soil_2', 'soil_3'];
export const dayMs = 86400000;
export interface PersistenceObservation {
  eventId: string;
  ingestionOrder: string;
  plotId: string;
  deviceId: string;
  source: DataSource;
  sensorId: string;
  code: SoilSensorId;
  recordedAt: string | null;
  receivedAt: string;
  moisturePct: number | null;
  quality: SensorHealth;
}
export interface PersistenceInput {
  schemaVersion: '1.0';
  plotId: string;
  deviceId: string;
  source: DataSource;
  asOf: string;
  from: string;
  toExclusive: string;
  trainUntil: string;
  validationUntil: string;
  sensors: { id: string; code: SoilSensorId }[];
  observations: PersistenceObservation[];
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error('Estructura de entrada offline inválida');
  return value as Record<string, unknown>;
}
function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 120)
    throw new Error('Identificador offline inválido');
}
export function timestamp(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('Usa timestamps UTC ISO con milisegundos');
  return Date.parse(value);
}
export function utcDay(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Fecha UTC inválida');
  return timestamp(`${value}T00:00:00.000Z`);
}

export function parsePersistenceInput(value: unknown): PersistenceInput {
  const input = object(value, [
    'schemaVersion',
    'plotId',
    'deviceId',
    'source',
    'asOf',
    'from',
    'toExclusive',
    'trainUntil',
    'validationUntil',
    'sensors',
    'observations',
  ]);
  if (input.schemaVersion !== '1.0' || (input.source !== 'real' && input.source !== 'demo'))
    throw new Error('Versión u origen no soportado');
  text(input.plotId);
  text(input.deviceId);
  const asOf = timestamp(input.asOf),
    from = utcDay(input.from),
    to = utcDay(input.toExclusive);
  const train = utcDay(input.trainUntil),
    validation = utcDay(input.validationUntil);
  if (
    !(from < train && train < validation && validation < to) ||
    to > Math.floor(asOf / dayMs) * dayMs ||
    to - from > 366 * dayMs
  )
    throw new Error(
      'Cortes cronológicos inválidos: tres periodos completos ordenados y máximo 366 días',
    );
  if (
    !Array.isArray(input.sensors) ||
    input.sensors.length > 3 ||
    !Array.isArray(input.observations) ||
    input.observations.length > 100000
  )
    throw new Error('Inventario o volumen offline fuera de límites');
  const sensorByCode = new Map<string, string>(),
    sensorIds = new Set<string>();
  for (const item of input.sensors) {
    const sensor = object(item, ['id', 'code']);
    text(sensor.id);
    if (
      !soilCodes.includes(sensor.code as SoilSensorId) ||
      sensorByCode.has(String(sensor.code)) ||
      sensorIds.has(sensor.id)
    )
      throw new Error('Inventario de sondas duplicado o inválido');
    sensorByCode.set(String(sensor.code), sensor.id);
    sensorIds.add(sensor.id);
  }
  const seen = new Set<string>(),
    events = new Map<string, string>(),
    orders = new Map<string, string>();
  const observations = input.observations.map((item) => {
    const row = object(item, [
      'eventId',
      'ingestionOrder',
      'plotId',
      'deviceId',
      'source',
      'sensorId',
      'code',
      'recordedAt',
      'receivedAt',
      'moisturePct',
      'quality',
    ]);
    text(row.eventId);
    if (
      row.plotId !== input.plotId ||
      row.deviceId !== input.deviceId ||
      row.source !== input.source ||
      !soilCodes.includes(row.code as SoilSensorId) ||
      sensorByCode.get(String(row.code)) !== row.sensorId
    )
      throw new Error('No se mezclan parcelas, dispositivos, orígenes o identidades de sonda');
    if (
      typeof row.ingestionOrder !== 'string' ||
      !/^[1-9]\d{0,18}$/.test(row.ingestionOrder) ||
      BigInt(row.ingestionOrder) > 9223372036854775807n
    )
      throw new Error('Orden de ingesta inválido');
    timestamp(row.receivedAt);
    if (row.recordedAt !== null) timestamp(row.recordedAt);
    if (
      typeof row.quality !== 'string' ||
      !['valid', 'missing', 'invalid', 'uncalibrated'].includes(row.quality) ||
      (row.moisturePct !== null &&
        (typeof row.moisturePct !== 'number' ||
          !Number.isFinite(row.moisturePct) ||
          row.moisturePct < 0 ||
          row.moisturePct > 100))
    )
      throw new Error('Humedad o calidad inválida; no se corrigen ni imputan valores');
    const identity = JSON.stringify([row.eventId, row.code]);
    const event = JSON.stringify([row.ingestionOrder, row.recordedAt, row.receivedAt]);
    if (
      seen.has(identity) ||
      (events.has(row.eventId) && events.get(row.eventId) !== event) ||
      (orders.has(row.ingestionOrder) && orders.get(row.ingestionOrder) !== row.eventId)
    )
      throw new Error('Evento duplicado o desempate de ingesta incoherente');
    seen.add(identity);
    events.set(row.eventId, event);
    orders.set(row.ingestionOrder, row.eventId);
    return {
      eventId: row.eventId,
      ingestionOrder: row.ingestionOrder,
      plotId: row.plotId,
      deviceId: row.deviceId,
      source: row.source,
      sensorId: row.sensorId,
      code: row.code,
      recordedAt: row.recordedAt,
      receivedAt: row.receivedAt,
      moisturePct: row.moisturePct,
      quality: row.quality,
    } as PersistenceObservation;
  });
  return {
    schemaVersion: '1.0',
    plotId: input.plotId,
    deviceId: input.deviceId,
    source: input.source as DataSource,
    asOf: input.asOf as string,
    from: input.from as string,
    toExclusive: input.toExclusive as string,
    trainUntil: input.trainUntil as string,
    validationUntil: input.validationUntil as string,
    sensors: soilCodes.flatMap((code) =>
      sensorByCode.has(code) ? [{ id: sensorByCode.get(code)!, code }] : [],
    ),
    observations,
  };
}
