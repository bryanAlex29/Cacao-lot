import { buildPersistenceDataset } from './persistence-dataset';
import { soilCodes } from './persistence-input';

export interface MoistureBaseline {
  readonly name: string;
  readonly version: string;
  predict(features: { lastMoisturePct: number }): number;
}
export class PersistenceBaseline implements MoistureBaseline {
  readonly name = 'persistence';
  readonly version = '1.0.0';
  predict(features: { lastMoisturePct: number }) {
    if (
      !Number.isFinite(features.lastMoisturePct) ||
      features.lastMoisturePct < 0 ||
      features.lastMoisturePct > 100
    )
      throw new Error('Entrada de persistencia inválida');
    return features.lastMoisturePct;
  }
}
export function scorePairs(pairs: { predicted: number; observed: number }[]) {
  if (!pairs.length)
    return {
      status: 'no_evaluable_samples' as const,
      samples: 0,
      maePp: null,
      rmsePp: null,
      biasPp: null,
    };
  if (
    pairs.some(
      ({ predicted, observed }) =>
        !Number.isFinite(predicted) ||
        !Number.isFinite(observed) ||
        predicted < 0 ||
        predicted > 100 ||
        observed < 0 ||
        observed > 100,
    )
  )
    throw new Error('Par de evaluación inválido');
  const errors = pairs.map(({ predicted, observed }) => predicted - observed);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    status: 'evaluated' as const,
    samples: pairs.length,
    maePp: mean(errors.map(Math.abs)),
    rmsePp: Math.sqrt(mean(errors.map((error) => error * error))),
    biasPp: mean(errors),
  };
}
export function evaluatePersistence(value: unknown) {
  const built = buildPersistenceDataset(value);
  const baseline = new PersistenceBaseline();
  const zones = soilCodes.map((code) => {
    const rows = built.dataset.samples.filter((row) => row.code === code);
    const evaluate = (partition: 'validation' | 'test') =>
      scorePairs(
        rows
          .filter((row) => row.partition === partition)
          .map((row) => ({
            predicted: baseline.predict(row.features),
            observed: row.target.moisturePct,
          })),
      );
    return {
      code,
      trainSamples: rows.filter((row) => row.partition === 'train').length,
      validation: evaluate('validation'),
      test: evaluate('test'),
    };
  });
  const report = {
    schemaVersion: 'persistence-evaluation-v1',
    status: 'experimental' as const,
    fieldValidated: false,
    inputHash: built.dataset.inputHash,
    datasetHash: built.datasetHash,
    asOf: built.input.asOf,
    identity: built.dataset.identity,
    target: built.dataset.target,
    split: built.dataset.split,
    model: {
      name: baseline.name,
      version: baseline.version,
      fitted: false,
      featureSchema: built.dataset.featureSchema,
    },
    calibration: 'not_verified',
    uncertainty: 'not_calibrated',
    zones,
    limitations: [
      'Evaluación retrospectiva; no es un pronóstico operativo.',
      'Datos DEMO no validan el cultivo real.',
      'Calidad válida no acredita calibración física.',
      'Sin regresión múltiple ni balance hídrico todavía.',
      'No calcula déficit, litros, ahorro o fecha de riego; no controla válvulas.',
    ],
  };
  return { ...built, report };
}
