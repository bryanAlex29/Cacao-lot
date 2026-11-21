import type { SensorThresholdRange } from '@cacaosmart/contracts';
import type { SensorThreshold } from '@prisma/client';

export function toThresholdRange(row: SensorThreshold): SensorThresholdRange {
  return {
    id: row.id,
    minValue: row.minValue,
    maxValue: row.maxValue,
    hysteresis: row.hysteresis,
    effectiveAt: row.effectiveAt.toISOString(),
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
