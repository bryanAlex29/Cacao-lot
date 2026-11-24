import { buildRegressionDataset } from './regression-dataset';
import { buildPersistenceDataset } from './persistence-dataset';
import { syntheticPersistenceInput } from './persistence-demo';

describe('Dataset de dos retardos para comparar regresión con persistencia', () => {
  it('mantiene intacto v1 y compara únicamente fechas elegibles para ambos métodos', () => {
    const input = syntheticPersistenceInput();
    const before = buildPersistenceDataset(input);
    const result = buildRegressionDataset(input);
    expect(result.dataset.schemaVersion).toBe('soil-two-lag-asof-v1');
    expect(result.dataset.samples).toHaveLength(177);
    expect(result.dataset.diagnostics[0]).toEqual({
      code: 'soil_1',
      train: { baselineEligible: 31, excludedLag2: 1, comparisonSamples: 30 },
      validation: { baselineEligible: 14, excludedLag2: 0, comparisonSamples: 14 },
      test: { baselineEligible: 15, excludedLag2: 0, comparisonSamples: 15 },
    });
    expect(buildPersistenceDataset(input)).toEqual(before);
    for (const row of result.dataset.samples) {
      const original = before.dataset.samples.find(
        (item) => item.code === row.code && item.targetDay === row.targetDay,
      )!;
      expect(row.features.lastMoisturePct).toBe(original.features.lastMoisturePct);
      expect(row.target).toEqual(original.target);
      expect(row.partition).toBe(original.partition);
    }
  });
  it('segunda feature usa exactamente el día -2, con recepción conocida al emitir', () => {
    for (const row of buildRegressionDataset(syntheticPersistenceInput()).dataset.samples) {
      const issue = Date.parse(row.issuedAt),
        second = Date.parse(row.lag2Evidence.observedAt);
      expect(second).toBeGreaterThanOrEqual(issue - 2 * 86400000);
      expect(second).toBeLessThan(issue - 86400000);
      expect(Date.parse(row.lag2Evidence.availableAt)).toBeLessThanOrEqual(issue);
    }
  });
  it('última lag2 inválida no se imputa ni se sustituye por otro día', () => {
    const input = syntheticPersistenceInput();
    const observation = input.observations.find(
      (row) => row.code === 'soil_1' && row.recordedAt === '2026-10-01T12:00:00.000Z',
    )!;
    observation.quality = 'invalid';
    const result = buildRegressionDataset(input);
    expect(
      result.dataset.samples.some((row) => row.code === 'soil_1' && row.targetDay === '2026-10-03'),
    ).toBe(false);
    expect(
      result.dataset.samples.some((row) => row.code === 'soil_2' && row.targetDay === '2026-10-03'),
    ).toBe(true);
  });
  it('datos retrospectivos de día -2 recibidos después de la emisión quedan fuera', () => {
    const input = syntheticPersistenceInput();
    for (const row of input.observations.filter(
      (item) => item.recordedAt === '2026-10-01T12:00:00.000Z',
    ))
      row.receivedAt = '2026-10-03T00:00:00.001Z';
    expect(
      buildRegressionDataset(input).dataset.samples.some((row) => row.targetDay === '2026-10-03'),
    ).toBe(false);
  });
  it('reproducible con filas invertidas, cero válido y sin observaciones inventadas', () => {
    const input = syntheticPersistenceInput();
    input.observations.find(
      (row) => row.code === 'soil_1' && row.recordedAt === '2026-10-01T12:00:00.000Z',
    )!.moisturePct = 0;
    const before = buildRegressionDataset(input);
    expect(
      before.dataset.samples.find((row) => row.code === 'soil_1' && row.targetDay === '2026-10-03')
        ?.features.lag2MoisturePct,
    ).toBe(0);
    input.observations.reverse();
    expect(buildRegressionDataset(input)).toEqual(before);
    input.observations = [];
    expect(buildRegressionDataset(input).dataset.samples).toEqual([]);
  });
  it('rechaza mezcla de origen y de equipos igual que el preparador base', () => {
    const input = syntheticPersistenceInput();
    input.observations[0].source = 'real';
    expect(() => buildRegressionDataset(input)).toThrow(/mezclan/);
  });
});
