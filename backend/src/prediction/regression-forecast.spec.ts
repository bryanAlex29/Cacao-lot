import 'reflect-metadata';
import type { PredictionModelVersion } from '@prisma/client';
import { syntheticRegressionRun } from '../../test/fixtures/regression-run';
import {
  artifactHash,
  inferRegression,
  parseRegressionArtifact,
  publicationsFromRun,
} from './regression-artifact';
import { regressionForecast, RegressionSnapshot } from './regression-forecast.service';

const now = new Date('2026-12-02T12:00:00.000Z');
const selection = { plotId: 'plot', deviceId: 'device', source: 'demo' as const };
const run = () => syntheticRegressionRun();
function snapshot(): RegressionSnapshot {
  const publication = publicationsFromRun(run().input, run().report, now);
  const artifact = publication.models[0];
  const model = {
    id: 'model',
    ownerId: 'owner',
    plotId: 'plot',
    deviceId: 'device',
    sensorId: artifact.artifact.sensorId,
    source: 'demo',
    version: artifact.artifact.version,
    artifact: artifact.artifact,
    evaluation: artifact.evaluation,
    artifactHash: artifact.artifactHash,
    trainedUntil: new Date('2026-11-01T00:00:00Z'),
    evaluatedThrough: publication.evaluatedThrough,
    registeredAt: new Date('2026-12-01T12:00:00Z'),
    enabled: true,
  } as unknown as PredictionModelVersion;
  return {
    isActive: true,
    sensors: [{ id: model.sensorId, code: 'soil_1', enabled: true }],
    models: [model],
    features: [1, 2].map((lag) => ({
      sensorId: model.sensorId,
      code: 'soil_1',
      lag,
      value: lag === 1 ? 0 : 40,
      quality: 'valid',
      observedAt: new Date(Date.parse('2026-12-02T00:00:00Z') - lag * 86400000 + 3600000),
      receivedAt: new Date('2026-12-01T23:00:00Z'),
    })),
  };
}
describe('Regresión publicada sin entrenamiento HTTP ni selección por test', () => {
  it('reconstruye coeficientes escalados y conserva cero en ambas entradas', () => {
    const a = parseRegressionArtifact(run().report.zones[0].artifact);
    expect(inferRegression(a, 0, 40)).toBe(20);
    expect(inferRegression(a, 0, 0)).toBe(0);
  });
  it('verifica identidad, hashes lógicos, particiones y métricas sobre las mismas filas', () => {
    const r = run();
    expect(publicationsFromRun(r.input, r.report, now).models).toHaveLength(3);
    r.report.zones[0].test.regression.maePp = 0;
    expect(() => publicationsFromRun(r.input, r.report, now)).toThrow();
  });
  it('rechaza experimento futuro o artefacto ejecutable/no finito/de otro esquema', () => {
    expect(() => publicationsFromRun(run().input, run().report, new Date('2026-11-20'))).toThrow();
    for (const patch of [
      { rank: 1 },
      { scalerScale: [0, 1] },
      { scalerMean: [NaN, 1] },
      { coefficientsScaled: [Infinity, 1] },
      { featureNames: ['lag2MoisturePct', 'lastMoisturePct'] },
      { executable: 'bad' },
    ])
      expect(() =>
        parseRegressionArtifact({ ...run().report.zones[0].artifact, ...patch }),
      ).toThrow();
  });
  it('infiere por sonda y compara con persistencia sobre las mismas features', () => {
    const data = regressionForecast(selection, snapshot(), now);
    expect(data.zones[0]).toMatchObject({
      reason: 'available',
      predictedPct: 20,
      persistencePct: 0,
    });
    expect(data.zones[0].model?.evaluation.test.regression.samples).toBe(15);
    expect(data.zones[1].reason).toBe('sensor_missing');
    expect(data).toMatchObject({
      fieldValidated: false,
      uncertainty: 'not_calibrated',
      waterDemand: null,
    });
    expect(JSON.stringify(data)).not.toMatch(/coefficientsScaled|artifactHash|reportHash/);
  });
  it('distingue ausencia de modelo, datos, calidad y deshabilitación sin rellenar', () => {
    const s = snapshot();
    s.models = [];
    expect(regressionForecast(selection, s, now).zones[0].reason).toBe('model_not_registered');
    s.models = snapshot().models;
    s.features.pop();
    expect(regressionForecast(selection, s, now).zones[0].reason).toBe('missing_features');
    s.features = snapshot().features;
    s.features[1].quality = 'uncalibrated';
    expect(regressionForecast(selection, s, now).zones[0].reason).toBe('unusable_features');
    s.sensors[0].enabled = false;
    expect(regressionForecast(selection, s, now).zones[0].reason).toBe('sensor_disabled');
    s.isActive = false;
    expect(regressionForecast(selection, s, now).zones[0].reason).toBe('device_disabled');
  });
  it('no publica información posterior al corte, ni versiones corruptas o de otro origen', () => {
    const s = snapshot();
    s.models[0]!.evaluatedThrough = new Date('2026-12-02T00:00:00.001Z');
    expect(regressionForecast(selection, s, now).zones[0].reason).toBe(
      'model_not_available_at_cutoff',
    );
    s.models = snapshot().models;
    s.models[0]!.artifactHash = 'bad';
    expect(regressionForecast(selection, s, now).zones[0].reason).toBe('model_incompatible');
    s.models = snapshot().models;
    s.models[0]!.source = 'real';
    expect(regressionForecast(selection, s, now).zones[0].reason).toBe('model_incompatible');
    s.models = snapshot().models;
    s.features[1].receivedAt = new Date('2026-12-02T00:00:00.001Z');
    expect(regressionForecast(selection, s, now).zones[0].reason).toBe('unusable_features');
  });
  it('bloquea salidas fuera de rango sin recortarlas ni esconder el baseline', () => {
    const s = snapshot();
    const a = parseRegressionArtifact(s.models[0]!.artifact);
    a.interceptScaled = 200;
    s.models[0]!.artifact = a as unknown as PredictionModelVersion['artifact'];
    s.models[0]!.artifactHash = artifactHash(a);
    expect(regressionForecast(selection, s, now).zones[0]).toMatchObject({
      reason: 'output_out_of_range',
      predictedPct: null,
      persistencePct: 0,
    });
  });
});
