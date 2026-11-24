import { createHash } from 'node:crypto';
import type { SoilSensorId } from '@cacaosmart/contracts';
import {
  dayMs,
  parsePersistenceInput,
  PersistenceObservation,
  soilCodes,
  timestamp,
  utcDay,
} from './persistence-input';

export type TemporalPartition = 'train' | 'validation' | 'test';
export interface PersistenceSample {
  code: SoilSensorId;
  sensorId: string;
  partition: TemporalPartition;
  issuedAt: string;
  targetDay: string;
  features: { lastMoisturePct: number };
  featureEvidence: { eventId: string; observedAt: string; availableAt: string };
  target: { moisturePct: number; eventId: string; observedAt: string; availableAt: string };
}
export interface PartitionCounts {
  candidateDays: number;
  samples: number;
  missingFeatureDays: number;
  missingTargetDays: number;
}
export function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function compareObservations(a: PersistenceObservation, b: PersistenceObservation) {
  const effective =
    timestamp(a.recordedAt ?? a.receivedAt) - timestamp(b.recordedAt ?? b.receivedAt);
  const received = timestamp(a.receivedAt) - timestamp(b.receivedAt);
  return (
    effective ||
    received ||
    (BigInt(a.ingestionOrder) < BigInt(b.ingestionOrder)
      ? -1
      : BigInt(a.ingestionOrder) > BigInt(b.ingestionOrder)
        ? 1
        : 0)
  );
}
function usable(
  row: PersistenceObservation | undefined,
): row is PersistenceObservation & { moisturePct: number } {
  return !!row && row.quality === 'valid' && typeof row.moisturePct === 'number';
}
const emptyCounts = (): PartitionCounts => ({
  candidateDays: 0,
  samples: 0,
  missingFeatureDays: 0,
  missingTargetDays: 0,
});

export function buildPersistenceDataset(value: unknown) {
  const input = parsePersistenceInput(value);
  // Canonical order independent of file/object insertion order; explicit projection in parser.
  input.observations.sort(
    (a, b) => soilCodes.indexOf(a.code) - soilCodes.indexOf(b.code) || compareObservations(a, b),
  );
  const inputHash = fingerprint(input);
  const samples: PersistenceSample[] = [];
  const diagnostics = soilCodes.map((code) => ({
    code,
    sensorId: input.sensors.find((s) => s.code === code)?.id ?? null,
    train: emptyCounts(),
    validation: emptyCounts(),
    test: emptyCounts(),
  }));
  const from = utcDay(input.from),
    to = utcDay(input.toExclusive),
    train = utcDay(input.trainUntil),
    validation = utcDay(input.validationUntil),
    asOf = timestamp(input.asOf);
  const buckets = new Map<string, PersistenceObservation[]>();
  for (const row of input.observations) {
    const effective = timestamp(row.recordedAt ?? row.receivedAt);
    if (effective < from - dayMs || effective >= to || timestamp(row.receivedAt) > asOf) continue;
    const key = `${row.code}:${Math.floor(effective / dayMs)}`;
    const rows = buckets.get(key) ?? [];
    rows.push(row);
    buckets.set(key, rows);
  }
  const latest = (code: SoilSensorId, day: number, availableBy: number) => {
    const rows = buckets.get(`${code}:${Math.floor(day / dayMs)}`) ?? [];
    for (let index = rows.length - 1; index >= 0; index--) {
      if (timestamp(rows[index].receivedAt) <= availableBy) return rows[index];
    }
    return undefined;
  };
  for (const zone of diagnostics) {
    for (let day = from; day < to; day += dayMs) {
      const partition: TemporalPartition =
        day < train ? 'train' : day < validation ? 'validation' : 'test';
      const labelCutoff =
        partition === 'train' ? train : partition === 'validation' ? validation : asOf;
      const counts = zone[partition];
      counts.candidateDays++;
      // Only the previous UTC day's latest observation that was already received at issue time.
      // A later missing/invalid sample blocks the day instead of silently carrying an older value.
      const feature = latest(zone.code, day - dayMs, day);
      if (!usable(feature)) {
        counts.missingFeatureDays++;
        continue;
      }
      const target = latest(zone.code, day, labelCutoff);
      if (!usable(target)) {
        counts.missingTargetDays++;
        continue;
      }
      counts.samples++;
      samples.push({
        code: zone.code,
        sensorId: feature.sensorId,
        partition,
        issuedAt: new Date(day).toISOString(),
        targetDay: new Date(day).toISOString().slice(0, 10),
        features: { lastMoisturePct: feature.moisturePct },
        featureEvidence: {
          eventId: feature.eventId,
          observedAt: feature.recordedAt ?? feature.receivedAt,
          availableAt: feature.receivedAt,
        },
        target: {
          moisturePct: target.moisturePct,
          eventId: target.eventId,
          observedAt: target.recordedAt ?? target.receivedAt,
          availableAt: target.receivedAt,
        },
      });
    }
  }
  const dataset = {
    schemaVersion: 'soil-daily-asof-v1',
    inputHash,
    identity: { plotId: input.plotId, deviceId: input.deviceId, source: input.source },
    asOf: input.asOf,
    period: { from: input.from, toExclusive: input.toExclusive, timezone: 'UTC' as const },
    split: { trainUntil: input.trainUntil, validationUntil: input.validationUntil },
    featureSchema: [
      { name: 'lastMoisturePct', unit: '%', policy: 'latest_previous_utc_day_received_by_issue' },
    ],
    target: {
      variable: 'soil_moisture',
      unit: '%',
      horizonDays: 1,
      policy: 'latest_target_utc_day_received_by_partition_cutoff',
    },
    samples,
    diagnostics,
  };
  return { input, dataset, datasetHash: fingerprint(dataset) };
}
