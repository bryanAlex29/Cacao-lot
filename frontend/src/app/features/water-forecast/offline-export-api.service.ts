import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { mergeMap, timeout } from 'rxjs';
import type { TelemetrySubscription } from '@cacaosmart/contracts';

export interface OfflineDates {
  from: string;
  trainUntil: string;
  validationUntil: string;
  toExclusive: string;
}
const dayMs = 86400000;
const dateKeys = ['from', 'trainUntil', 'validationUntil', 'toExclusive'] as const;

function utcDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}
export function validOfflineDates(dates: OfflineDates, now = Date.now()): boolean {
  const [from, train, validation, to] = dateKeys.map((key) => utcDay(dates[key]));
  return (
    from < train &&
    train < validation &&
    validation < to &&
    to <= Math.floor(now / dayMs) * dayMs &&
    to - from <= 366 * dayMs
  );
}
function object(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function iso(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
const codes = ['soil_1', 'soil_2', 'soil_3'];
const observationKeys = [
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
];

/** Reject a mismatched/oversized response before handing a private file to the browser. */
export async function checkedOfflineFile(
  blob: Blob,
  selection: TelemetrySubscription,
  dates: OfflineDates,
): Promise<{ blob: Blob; count: number }> {
  const invalid = () => new Error('Archivo offline incompatible');
  if (blob.size > 16 * 1024 * 1024 || !/^application\/json(?:;|$)/i.test(blob.type))
    throw invalid();
  const value: unknown = JSON.parse(await blob.text());
  const keys = [
    'schemaVersion',
    'plotId',
    'deviceId',
    'source',
    'asOf',
    ...dateKeys,
    'sensors',
    'observations',
  ];
  if (
    !object(value, keys) ||
    value['schemaVersion'] !== '1.0' ||
    value['plotId'] !== selection.plotId ||
    value['deviceId'] !== selection.deviceId ||
    value['source'] !== selection.source ||
    !iso(value['asOf']) ||
    !validOfflineDates(dates, Date.parse(value['asOf'])) ||
    dateKeys.some((key) => value[key] !== dates[key]) ||
    !Array.isArray(value['sensors']) ||
    value['sensors'].length > 3 ||
    !Array.isArray(value['observations']) ||
    value['observations'].length > 100000
  )
    throw invalid();
  const sensors = new Map<string, string>();
  const ids = new Set<string>();
  for (const sensor of value['sensors']) {
    if (
      !object(sensor, ['id', 'code']) ||
      typeof sensor['id'] !== 'string' ||
      !sensor['id'] ||
      typeof sensor['code'] !== 'string' ||
      !codes.includes(sensor['code']) ||
      sensors.has(sensor['code']) ||
      ids.has(sensor['id'])
    )
      throw invalid();
    sensors.set(sensor['code'], sensor['id']);
    ids.add(sensor['id']);
  }
  const seen = new Set<string>();
  for (const row of value['observations']) {
    if (
      !object(row, observationKeys) ||
      row['plotId'] !== selection.plotId ||
      row['deviceId'] !== selection.deviceId ||
      row['source'] !== selection.source ||
      typeof row['code'] !== 'string' ||
      !sensors.has(row['code']) ||
      row['sensorId'] !== sensors.get(row['code']) ||
      typeof row['eventId'] !== 'string' ||
      !row['eventId'] ||
      row['eventId'].length > 120 ||
      typeof row['ingestionOrder'] !== 'string' ||
      !/^[1-9]\d{0,18}$/.test(row['ingestionOrder']) ||
      BigInt(row['ingestionOrder']) > 9223372036854775807n ||
      !iso(row['receivedAt']) ||
      (row['recordedAt'] !== null && !iso(row['recordedAt'])) ||
      typeof row['quality'] !== 'string' ||
      !['valid', 'missing', 'invalid', 'uncalibrated'].includes(row['quality']) ||
      (row['moisturePct'] !== null &&
        (typeof row['moisturePct'] !== 'number' ||
          !Number.isFinite(row['moisturePct']) ||
          row['moisturePct'] < 0 ||
          row['moisturePct'] > 100))
    )
      throw invalid();
    const effective = Date.parse((row['recordedAt'] ?? row['receivedAt']) as string);
    const identity = JSON.stringify([row['eventId'], row['code']]);
    if (
      seen.has(identity) ||
      Date.parse(row['receivedAt']) > Date.parse(value['asOf']) ||
      effective < utcDay(dates.from) - 2 * dayMs ||
      effective >= utcDay(dates.toExclusive)
    )
      throw invalid();
    seen.add(identity);
  }
  return { blob, count: value['observations'].length };
}

@Injectable({ providedIn: 'root' })
export class OfflineExportApi {
  private readonly http = inject(HttpClient);
  download(selection: TelemetrySubscription, dates: OfflineDates) {
    return this.http
      .get(`/api/v1/plots/${encodeURIComponent(selection.plotId)}/predictions/offline-input.json`, {
        params: { ...dates, deviceId: selection.deviceId, source: selection.source },
        responseType: 'blob',
      })
      .pipe(
        mergeMap((blob) => checkedOfflineFile(blob, selection, dates)),
        timeout(45000),
      );
  }
}
