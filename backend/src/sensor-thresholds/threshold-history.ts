import { ConflictException } from '@nestjs/common';
import type { SensorThresholdInterval } from '@cacaosmart/contracts';
import type { SensorThresholdAudit } from '@prisma/client';
import { toThresholdRange } from './threshold.mapping';
import type { OwnedSensor } from './threshold.repository';

export const MAX_THRESHOLD_CHANGES = 1000;
const unavailable = (): never => {
  throw new ConflictException(
    'Historial de rangos incompleto o inconsistente; no se infieren límites',
  );
};

function snapshot(value: unknown, sensor: OwnedSensor) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable();
  const row = value as Record<string, unknown>;
  if (
    row['variable'] !== sensor.variable ||
    row['unit'] !== sensor.unit ||
    typeof row['id'] !== 'string' ||
    typeof row['updatedBy'] !== 'string' ||
    typeof row['minValue'] !== 'number' ||
    !Number.isFinite(row['minValue']) ||
    typeof row['maxValue'] !== 'number' ||
    !Number.isFinite(row['maxValue']) ||
    row['minValue'] < (sensor.unit === 'PERCENT' ? 0 : -50) ||
    row['maxValue'] > 100 ||
    row['minValue'] >= row['maxValue'] ||
    row['hysteresis'] !== 0 ||
    typeof row['version'] !== 'number' ||
    !Number.isInteger(row['version']) ||
    row['version'] < 1 ||
    typeof row['effectiveAt'] !== 'string' ||
    !Number.isFinite(Date.parse(row['effectiveAt']))
  )
    return unavailable();
  return {
    id: row['id'],
    updatedBy: row['updatedBy'],
    minValue: row['minValue'],
    maxValue: row['maxValue'],
    version: row['version'],
    effectiveAt: row['effectiveAt'],
    hysteresis: 0,
  };
}

type Snapshot = ReturnType<typeof snapshot>;
const same = (a: Snapshot | null, b: Snapshot | null) => JSON.stringify(a) === JSON.stringify(b);

/** Validate the window's audit chain plus both boundaries; never fall back to today's range. */
export function thresholdIntervals(
  sensor: OwnedSensor,
  from: Date,
  to: Date,
  before: SensorThresholdAudit | null,
  changes: SensorThresholdAudit[],
  after: SensorThresholdAudit | null,
): SensorThresholdInterval[] {
  if (changes.length > MAX_THRESHOLD_CHANGES)
    throw new ConflictException('Demasiados cambios de rango; consulta un periodo menor');
  const checked = (audit: SensorThresholdAudit): Snapshot => {
    const value = snapshot(audit.newValue, sensor);
    if (
      audit.sensorId !== sensor.id ||
      audit.plotId !== sensor.device.plotId ||
      audit.source !== sensor.device.source ||
      audit.variable !== sensor.variable ||
      value.version !== audit.version ||
      value.updatedBy !== audit.actorId ||
      Date.parse(value.effectiveAt) !== audit.changedAt.getTime()
    )
      return unavailable();
    return value;
  };
  let current = before ? checked(before) : null;
  if (before && before.changedAt > from) return unavailable();
  let start = from.getTime();
  const intervals: SensorThresholdInterval[] = [];
  const append = (end: number) => {
    if (end <= start) return; // Multiple edits in one millisecond: highest version wins.
    intervals.push({
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
      threshold: current
        ? {
            minValue: current.minValue,
            maxValue: current.maxValue,
            version: current.version,
            effectiveAt: current.effectiveAt,
          }
        : null,
    });
    start = end;
  };
  const advance = (audit: SensorThresholdAudit) => {
    const value = checked(audit);
    const old = audit.oldValue === null ? null : snapshot(audit.oldValue, sensor);
    if (
      value.version !== (current?.version ?? 0) + 1 ||
      !same(old, current) ||
      (current && Date.parse(value.effectiveAt) < Date.parse(current.effectiveAt))
    )
      return unavailable();
    return value;
  };
  for (const audit of changes) {
    if (audit.changedAt.getTime() < start || audit.changedAt >= to) return unavailable();
    const next = advance(audit);
    append(audit.changedAt.getTime());
    current = next;
  }
  if (after) {
    if (after.changedAt < to) return unavailable();
    advance(after); // The first later snapshot proves where the last visible interval ends.
  } else {
    const stored = sensor.thresholds[0];
    const latest = stored
      ? snapshot(
          { ...toThresholdRange(stored), variable: stored.variable, unit: stored.unit },
          sensor,
        )
      : null;
    if (!same(current, latest)) return unavailable();
  }
  append(to.getTime());
  return intervals;
}
