import {
  buildPersistenceDataset,
  fingerprint,
  type PersistenceSample,
  type TemporalPartition,
} from './persistence-dataset';
import {
  dayMs,
  soilCodes,
  timestamp,
  utcDay,
  type PersistenceObservation,
} from './persistence-input';

export interface RegressionSample extends PersistenceSample {
  features: { lastMoisturePct: number; lag2MoisturePct: number };
  lag2Evidence: PersistenceSample['featureEvidence'];
}
const partitionCounts = () => ({ baselineEligible: 0, excludedLag2: 0, comparisonSamples: 0 });

/** A separate versioned dataset: never change the established one-feature baseline artifacts. */
export function buildRegressionDataset(value: unknown) {
  const base = buildPersistenceDataset(value);
  const from = utcDay(base.input.from),
    to = utcDay(base.input.toExclusive),
    asOf = timestamp(base.input.asOf);
  const buckets = new Map<string, PersistenceObservation[]>();
  // base.input is normalized and ordered by code/effective time/receipt/BigInt ingestion order.
  for (const row of base.input.observations) {
    const effective = timestamp(row.recordedAt ?? row.receivedAt);
    if (effective < from - 2 * dayMs || effective >= to || timestamp(row.receivedAt) > asOf)
      continue;
    const key = `${row.code}:${Math.floor(effective / dayMs)}`;
    const rows = buckets.get(key) ?? [];
    rows.push(row);
    buckets.set(key, rows);
  }
  const samples: RegressionSample[] = [];
  const diagnostics = soilCodes.map((code) => ({
    code,
    train: partitionCounts(),
    validation: partitionCounts(),
    test: partitionCounts(),
  }));
  for (const row of base.dataset.samples) {
    const counts = diagnostics.find((zone) => zone.code === row.code)![
      row.partition as TemporalPartition
    ];
    counts.baselineEligible++;
    const issuedAt = timestamp(row.issuedAt);
    const candidates = buckets.get(`${row.code}:${Math.floor(issuedAt / dayMs) - 2}`) ?? [];
    let previous: PersistenceObservation | undefined;
    for (let index = candidates.length - 1; index >= 0; index--) {
      if (timestamp(candidates[index].receivedAt) <= issuedAt) {
        previous = candidates[index];
        break;
      }
    }
    if (!previous || previous.quality !== 'valid' || previous.moisturePct === null) {
      counts.excludedLag2++;
      continue;
    }
    counts.comparisonSamples++;
    samples.push({
      ...row,
      features: { ...row.features, lag2MoisturePct: previous.moisturePct },
      lag2Evidence: {
        eventId: previous.eventId,
        observedAt: previous.recordedAt ?? previous.receivedAt,
        availableAt: previous.receivedAt,
      },
    });
  }
  const dataset = {
    ...base.dataset,
    schemaVersion: 'soil-two-lag-asof-v1',
    featureSchema: [
      { name: 'lastMoisturePct', unit: '%', policy: 'latest_previous_utc_day_received_by_issue' },
      {
        name: 'lag2MoisturePct',
        unit: '%',
        policy: 'latest_two_utc_days_before_received_by_issue',
      },
    ],
    samples,
    diagnostics,
  };
  return { input: base.input, dataset, datasetHash: fingerprint(dataset) };
}
