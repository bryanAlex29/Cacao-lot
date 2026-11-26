import { createHash } from 'node:crypto';
import type { SoilSensorId } from '@cacaosmart/contracts';
import { scorePairs } from './offline/persistence-baseline';
import { buildRegressionDataset } from './offline/regression-dataset';
import { soilCodes, timestamp, utcDay } from './offline/persistence-input';

export interface RegressionArtifact {
  version: 'linear-two-lag-1.0.0';
  sensorId: string;
  trainSamples: number;
  trainedUntilExclusive: string;
  firstTrainingTargetDay: string;
  lastTrainingTargetDay: string;
  featureNames: ['lastMoisturePct', 'lag2MoisturePct'];
  scalerMean: [number, number];
  scalerScale: [number, number];
  coefficientsScaled: [number, number];
  interceptScaled: number;
  rank: 2;
}
export const artifactHash = (artifact: RegressionArtifact) =>
  createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error('Artefacto o evaluación de regresión incompatible');
}
function object(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function vector(value: unknown): [number, number] {
  requireValue(
    Array.isArray(value) &&
      value.length === 2 &&
      value.every((v) => typeof v === 'number' && Number.isFinite(v)),
  );
  return [value[0] as number, value[1] as number];
}
export function parseRegressionArtifact(value: unknown): RegressionArtifact {
  const a = object(value);
  const keys = [
    'version',
    'sensorId',
    'trainSamples',
    'trainedUntilExclusive',
    'firstTrainingTargetDay',
    'lastTrainingTargetDay',
    'featureNames',
    'scalerMean',
    'scalerScale',
    'coefficientsScaled',
    'interceptScaled',
    'rank',
  ];
  requireValue(Object.keys(a).length === keys.length && keys.every((key) => Object.hasOwn(a, key)));
  requireValue(
    a.version === 'linear-two-lag-1.0.0' &&
      typeof a.sensorId === 'string' &&
      a.sensorId.length > 0 &&
      a.sensorId.length <= 120,
  );
  requireValue(
    typeof a.trainSamples === 'number' &&
      Number.isInteger(a.trainSamples) &&
      a.trainSamples >= 4 &&
      a.trainSamples <= 366 &&
      a.rank === 2,
  );
  requireValue(
    typeof a.trainedUntilExclusive === 'string' &&
      typeof a.firstTrainingTargetDay === 'string' &&
      typeof a.lastTrainingTargetDay === 'string',
  );
  requireValue(
    utcDay(a.firstTrainingTargetDay) <= utcDay(a.lastTrainingTargetDay) &&
      utcDay(a.lastTrainingTargetDay) < utcDay(a.trainedUntilExclusive),
  );
  requireValue(
    JSON.stringify(a.featureNames) === JSON.stringify(['lastMoisturePct', 'lag2MoisturePct']),
  );
  const mean = vector(a.scalerMean),
    scale = vector(a.scalerScale),
    coefficients = vector(a.coefficientsScaled);
  requireValue(mean.every((n) => n >= 0 && n <= 100) && scale.every((n) => n > 0 && n <= 100));
  requireValue(typeof a.interceptScaled === 'number' && Number.isFinite(a.interceptScaled));
  return {
    version: 'linear-two-lag-1.0.0',
    sensorId: a.sensorId,
    trainSamples: a.trainSamples,
    trainedUntilExclusive: a.trainedUntilExclusive,
    firstTrainingTargetDay: a.firstTrainingTargetDay,
    lastTrainingTargetDay: a.lastTrainingTargetDay,
    featureNames: ['lastMoisturePct', 'lag2MoisturePct'],
    scalerMean: mean,
    scalerScale: scale,
    coefficientsScaled: coefficients,
    interceptScaled: a.interceptScaled,
    rank: 2,
  };
}
export function inferRegression(artifact: RegressionArtifact, lag1: number, lag2: number) {
  requireValue([lag1, lag2].every((n) => Number.isFinite(n) && n >= 0 && n <= 100));
  return (
    artifact.interceptScaled +
    [lag1, lag2].reduce(
      (sum, value, i) =>
        sum +
        ((value - artifact.scalerMean[i]) / artifact.scalerScale[i]) *
          artifact.coefficientsScaled[i],
      0,
    )
  );
}
export interface RegressionScores {
  samples: number;
  maePp: number;
  rmsePp: number;
  biasPp: number;
  outOfRangePredictions: number;
}
export interface RegressionEvaluation {
  validation: { regression: RegressionScores; persistence: RegressionScores };
  test: { regression: RegressionScores; persistence: RegressionScores };
}
export function parseRegressionEvaluation(value: unknown): RegressionEvaluation {
  const evaluation = object(value);
  const parsed = {} as RegressionEvaluation;
  for (const partition of ['validation', 'test'] as const) {
    const part = object(evaluation[partition]);
    const scores = {} as RegressionEvaluation['test'];
    for (const method of ['regression', 'persistence'] as const) {
      const m = object(part[method]);
      requireValue(
        typeof m.samples === 'number' &&
          Number.isInteger(m.samples) &&
          m.samples >= 1 &&
          m.samples <= 366,
      );
      requireValue(
        ['maePp', 'rmsePp', 'biasPp'].every(
          (key) => typeof m[key] === 'number' && Number.isFinite(m[key]),
        ),
      );
      requireValue((m.maePp as number) >= 0 && (m.rmsePp as number) + 1e-8 >= (m.maePp as number));
      requireValue(
        typeof m.outOfRangePredictions === 'number' &&
          Number.isInteger(m.outOfRangePredictions) &&
          m.outOfRangePredictions >= 0 &&
          m.outOfRangePredictions <= m.samples,
      );
      scores[method] = {
        samples: m.samples,
        maePp: m.maePp as number,
        rmsePp: m.rmsePp as number,
        biasPp: m.biasPp as number,
        outOfRangePredictions: m.outOfRangePredictions,
      };
    }
    requireValue(scores.regression.samples === scores.persistence.samples);
    parsed[partition] = scores;
  }
  return parsed;
}

/** Checks a known offline run; no Python objects, training, automatic winner or executable files. */
export function publicationsFromRun(input: unknown, reportValue: unknown, now: Date) {
  const built = buildRegressionDataset(input);
  const report = object(reportValue);
  requireValue(
    report.schemaVersion === 'linear-comparison-v1' &&
      report.status === 'experimental' &&
      report.fieldValidated === false &&
      report.preferredModel === null &&
      report.uncertainty === 'not_calibrated',
  );
  requireValue(
    report.datasetHash === built.datasetHash && report.inputHash === built.dataset.inputHash,
  );
  requireValue(
    JSON.stringify(report.identity) === JSON.stringify(built.dataset.identity) &&
      report.asOf === built.dataset.asOf,
  );
  requireValue(
    JSON.stringify(report.target) === JSON.stringify(built.dataset.target) &&
      JSON.stringify(report.split) === JSON.stringify(built.dataset.split),
  );
  const method = object(report.model);
  requireValue(
    method.name === 'StandardScaler+LinearRegression' &&
      method.version === 'linear-two-lag-1.0.0' &&
      method.fitPartition === 'train' &&
      method.minTrainingSamples === 4,
  );
  requireValue(timestamp(built.dataset.asOf) <= now.getTime());
  requireValue(Array.isArray(report.zones) && report.zones.length === 3);
  const models = [];
  for (const [index, code] of soilCodes.entries()) {
    const zone = object(report.zones[index]);
    requireValue(zone.code === code);
    if (zone.status === 'not_trained') {
      requireValue(zone.artifact === null);
      continue;
    }
    requireValue(zone.status === 'fitted_experimental' && zone.reason === null);
    const artifact = parseRegressionArtifact(zone.artifact);
    const training = built.dataset.samples.filter(
      (row) => row.code === code && row.partition === 'train',
    );
    requireValue(
      training.length === artifact.trainSamples &&
        training.every((row) => row.sensorId === artifact.sensorId),
    );
    requireValue(
      artifact.trainedUntilExclusive === built.dataset.split.trainUntil &&
        artifact.firstTrainingTargetDay === training[0]?.targetDay &&
        artifact.lastTrainingTargetDay === training.at(-1)?.targetDay,
    );
    const evaluation: Record<string, unknown> = {};
    for (const partition of ['validation', 'test'] as const) {
      const rows = built.dataset.samples.filter(
        (row) => row.code === code && row.partition === partition,
      );
      requireValue(rows.length > 0);
      const scores = object(zone[partition]);
      requireValue(scores.comparisonBasis === 'identical_rows' && scores.samples === rows.length);
      const predictions = rows.map((row) =>
        inferRegression(artifact, row.features.lastMoisturePct, row.features.lag2MoisturePct),
      );
      requireValue(predictions.every(Number.isFinite));
      const observed = rows.map((row) => row.target.moisturePct);
      const errors = predictions.map((n, i) => n - observed[i]);
      const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length;
      const regression = {
        samples: rows.length,
        maePp: mean(errors.map(Math.abs)),
        rmsePp: Math.sqrt(mean(errors.map((n) => n * n))),
        biasPp: mean(errors),
        outOfRangePredictions: predictions.filter((n) => n < 0 || n > 100).length,
      };
      const baseline = scorePairs(
        rows.map((row) => ({
          predicted: row.features.lastMoisturePct,
          observed: row.target.moisturePct,
        })),
      );
      const persistence = {
        samples: baseline.samples,
        maePp: baseline.maePp,
        rmsePp: baseline.rmsePp,
        biasPp: baseline.biasPp,
        outOfRangePredictions: 0,
      };
      for (const [method, actual] of [
        ['regression', regression],
        ['persistence', persistence],
      ] as const) {
        const claimed = object(scores[method]);
        requireValue(claimed.status === 'evaluated');
        for (const key of [
          'samples',
          'maePp',
          'rmsePp',
          'biasPp',
          'outOfRangePredictions',
        ] as const)
          requireValue(
            typeof claimed[key] === 'number' &&
              Math.abs((claimed[key] as number) - (actual[key] as number)) < 1e-7,
          );
      }
      evaluation[partition] = { regression, persistence };
    }
    models.push({
      code: code as SoilSensorId,
      artifact,
      evaluation: parseRegressionEvaluation(evaluation),
      artifactHash: artifactHash(artifact),
    });
  }
  requireValue(models.length > 0);
  return {
    identity: built.dataset.identity,
    inputHash: built.dataset.inputHash,
    datasetHash: built.datasetHash,
    evaluatedThrough: new Date(built.dataset.asOf),
    models,
  };
}
