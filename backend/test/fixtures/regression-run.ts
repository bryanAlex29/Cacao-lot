import { syntheticPersistenceInput } from '../../src/prediction/offline/persistence-demo';
import { buildRegressionDataset } from '../../src/prediction/offline/regression-dataset';
import { scorePairs } from '../../src/prediction/offline/persistence-baseline';
import { inferRegression, RegressionArtifact } from '../../src/prediction/regression-artifact';

/** A serialization/inference fixture, NOT an agronomically trained model. Never seed main. */
export function syntheticRegressionRun(
  identity?: {
    plotId: string;
    deviceId: string;
    sensors: { id: string; code: string }[];
  },
  asOf = new Date('2026-11-30T00:00:00.000Z'),
) {
  const input = syntheticPersistenceInput();
  const shift = asOf.getTime() - Date.parse(input.asOf);
  const move = (date: string) => new Date(Date.parse(date) + shift).toISOString();
  input.asOf = move(input.asOf);
  for (const key of ['from', 'toExclusive', 'trainUntil', 'validationUntil'] as const)
    input[key] = move(`${input[key]}T00:00:00.000Z`).slice(0, 10);
  if (identity) {
    input.plotId = identity.plotId;
    input.deviceId = identity.deviceId;
    for (const sensor of input.sensors)
      sensor.id = identity.sensors.find((s) => s.code === sensor.code)!.id;
  }
  for (const row of input.observations) {
    row.plotId = input.plotId;
    row.deviceId = input.deviceId;
    row.sensorId = input.sensors.find((s) => s.code === row.code)!.id;
    if (row.recordedAt) row.recordedAt = move(row.recordedAt);
    row.receivedAt = move(row.receivedAt);
  }
  const built = buildRegressionDataset(input);
  const zones = input.sensors.map((sensor) => {
    const training = built.dataset.samples.filter(
      (r) => r.code === sensor.code && r.partition === 'train',
    );
    const artifact: RegressionArtifact = {
      version: 'linear-two-lag-1.0.0',
      sensorId: sensor.id,
      trainSamples: training.length,
      trainedUntilExclusive: input.trainUntil,
      firstTrainingTargetDay: training[0].targetDay,
      lastTrainingTargetDay: training.at(-1)!.targetDay,
      featureNames: ['lastMoisturePct', 'lag2MoisturePct'],
      scalerMean: [0, 0],
      scalerScale: [1, 1],
      coefficientsScaled: [0.5, 0.5],
      interceptScaled: 0,
      rank: 2,
    };
    const evaluate = (partition: 'validation' | 'test') => {
      const rows = built.dataset.samples.filter(
        (r) => r.code === sensor.code && r.partition === partition,
      );
      const prediction = (r: (typeof rows)[number]) =>
        inferRegression(artifact, r.features.lastMoisturePct, r.features.lag2MoisturePct);
      return {
        comparisonBasis: 'identical_rows',
        samples: rows.length,
        regression: {
          ...scorePairs(
            rows.map((r) => ({ observed: r.target.moisturePct, predicted: prediction(r) })),
          ),
          outOfRangePredictions: 0,
        },
        persistence: {
          ...scorePairs(
            rows.map((r) => ({
              observed: r.target.moisturePct,
              predicted: r.features.lastMoisturePct,
            })),
          ),
          outOfRangePredictions: 0,
        },
      };
    };
    return {
      code: sensor.code,
      status: 'fitted_experimental',
      reason: null,
      artifact,
      validation: evaluate('validation'),
      test: evaluate('test'),
    };
  });
  return {
    input,
    dataset: built.dataset,
    report: {
      schemaVersion: 'linear-comparison-v1',
      status: 'experimental',
      fieldValidated: false,
      preferredModel: null,
      uncertainty: 'not_calibrated',
      identity: built.dataset.identity,
      target: built.dataset.target,
      split: built.dataset.split,
      asOf: input.asOf,
      inputHash: built.dataset.inputHash,
      datasetHash: built.datasetHash,
      model: {
        name: 'StandardScaler+LinearRegression',
        version: 'linear-two-lag-1.0.0',
        fitPartition: 'train',
        minTrainingSamples: 4,
      },
      zones,
    },
  };
}
