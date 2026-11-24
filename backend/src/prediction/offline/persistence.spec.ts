import { evaluatePersistence, PersistenceBaseline, scorePairs } from './persistence-baseline';
import { buildPersistenceDataset } from './persistence-dataset';
import {
  parsePersistenceInput,
  type PersistenceInput,
  type PersistenceObservation,
} from './persistence-input';
import { syntheticPersistenceInput } from './persistence-demo';

const firstSample = (input: PersistenceInput) =>
  buildPersistenceDataset(input).dataset.samples.find(
    (row) => row.code === 'soil_1' && row.targetDay === input.from,
  );
function addObservation(input: PersistenceInput, extra: Partial<PersistenceObservation>) {
  input.observations.push({
    ...input.observations[0],
    eventId: 'extra',
    ingestionOrder: '1000',
    ...extra,
  });
}

describe('Pipeline offline de persistencia y evaluación cronológica', () => {
  it('conjunto sintético reproducible por zona con tres particiones ordenadas y sin ajuste del modelo', () => {
    const { dataset, report } = evaluatePersistence(syntheticPersistenceInput());
    expect(dataset.samples).toHaveLength(180);
    expect(dataset.diagnostics).toHaveLength(3);
    for (const zone of dataset.diagnostics) {
      expect(zone.train).toMatchObject({ samples: 31, candidateDays: 31 });
      expect(zone.validation.samples).toBe(14);
      expect(zone.test.samples).toBe(15);
    }
    expect(report).toMatchObject({
      status: 'experimental',
      fieldValidated: false,
      calibration: 'not_verified',
      uncertainty: 'not_calibrated',
      identity: { source: 'demo' },
      model: { name: 'persistence', fitted: false },
    });
    expect(report.zones.map((row) => row.test.samples)).toEqual([15, 15, 15]);
  });
  it('ordena canónicamente: invertir observaciones o propiedades no cambia hashes/dataset/reporte', () => {
    const input = syntheticPersistenceInput(),
      original = evaluatePersistence(input);
    input.observations.reverse();
    input.sensors.reverse();
    input.observations = input.observations.map(
      (row) =>
        Object.fromEntries(Object.entries(row).reverse()) as unknown as PersistenceObservation,
    );
    expect(evaluatePersistence(input)).toEqual(original);
  });
  it('no modifica el objeto de entrada y los artefactos cambian si cambia un dato', () => {
    const input = syntheticPersistenceInput(),
      copy = structuredClone(input);
    const before = evaluatePersistence(input);
    expect(input).toEqual(copy);
    input.observations[0].moisturePct = 0;
    const after = evaluatePersistence(input);
    expect(after.datasetHash).not.toBe(before.datasetHash);
    expect(after.dataset.inputHash).not.toBe(before.dataset.inputHash);
  });
  it('las features solo usan datos observados antes de emitir y recibidos a tiempo; labels se mantienen en su corte', () => {
    const input = syntheticPersistenceInput();
    for (const sample of buildPersistenceDataset(input).dataset.samples) {
      const issued = Date.parse(sample.issuedAt);
      expect(Date.parse(sample.featureEvidence.observedAt)).toBeLessThan(issued);
      expect(Date.parse(sample.featureEvidence.observedAt)).toBeGreaterThanOrEqual(
        issued - 86400000,
      );
      expect(Date.parse(sample.featureEvidence.availableAt)).toBeLessThanOrEqual(issued);
      expect(Date.parse(sample.target.observedAt)).toBeGreaterThanOrEqual(issued);
      expect(Date.parse(sample.target.observedAt)).toBeLessThan(issued + 86400000);
      const cutoff =
        sample.partition === 'train'
          ? input.trainUntil + 'T00:00:00.000Z'
          : sample.partition === 'validation'
            ? input.validationUntil + 'T00:00:00.000Z'
            : input.asOf;
      expect(Date.parse(sample.target.availableAt)).toBeLessThanOrEqual(Date.parse(cutoff));
    }
  });
  it('las fronteras pertenecen exactamente a validation y test, sin filas compartidas', () => {
    const input = syntheticPersistenceInput();
    const { samples } = buildPersistenceDataset(input).dataset;
    expect(samples.find((row) => row.targetDay === input.trainUntil)?.partition).toBe('validation');
    expect(samples.find((row) => row.targetDay === input.validationUntil)?.partition).toBe('test');
    expect(new Set(samples.map((row) => `${row.code}:${row.targetDay}`)).size).toBe(samples.length);
    expect(samples.some((row) => row.targetDay === input.toExclusive)).toBe(false);
  });
  it('cero es un valor válido, no ausencia ni un relleno', () => {
    const input = syntheticPersistenceInput();
    input.observations[0].moisturePct = 0;
    expect(firstSample(input)?.features.lastMoisturePct).toBe(0);
    expect(new PersistenceBaseline().predict({ lastMoisturePct: 0 })).toBe(0);
  });
  it.each(['missing', 'invalid', 'uncalibrated'] as const)(
    'última entrada %s bloquea la feature sin volver a una lectura vieja válida',
    (quality) => {
      const input = syntheticPersistenceInput();
      addObservation(input, {
        quality,
        moisturePct: quality === 'missing' ? null : 40,
        recordedAt: '2026-09-30T20:00:00.000Z',
        receivedAt: '2026-09-30T20:00:01.000Z',
      });
      expect(firstSample(input)).toBeUndefined();
      expect(buildPersistenceDataset(input).dataset.diagnostics[0].train.missingFeatureDays).toBe(
        1,
      );
    },
  );
  it('un día sin feature no arrastra datos de dos días antes ni interpola', () => {
    const input = syntheticPersistenceInput();
    input.observations = input.observations.filter(
      (row) => row.code !== 'soil_1' || row.recordedAt !== '2026-09-30T12:00:00.000Z',
    );
    addObservation(input, {
      recordedAt: '2026-09-29T12:00:00.000Z',
      receivedAt: '2026-09-29T12:00:01.000Z',
    });
    expect(firstSample(input)).toBeUndefined();
  });
  it('una entrada retrospectiva recibida después de emitir no entra en la feature', () => {
    const input = syntheticPersistenceInput();
    input.observations[0].receivedAt = '2026-10-01T00:00:01.000Z';
    // All zones of an event must retain identical timestamp/order provenance.
    for (const row of input.observations.filter((item) => item.eventId === 'synthetic-day-0'))
      row.receivedAt = input.observations[0].receivedAt;
    expect(firstSample(input)).toBeUndefined();
  });
  it('cambiar el resultado futuro no cambia la feature ni la predicción emitida', () => {
    const input = syntheticPersistenceInput(),
      before = firstSample(input)!;
    input.observations.find(
      (row) => row.code === 'soil_1' && row.recordedAt === '2026-10-01T12:00:00.000Z',
    )!.moisturePct = 99;
    const after = firstSample(input)!;
    expect(after.features).toEqual(before.features);
    expect(after.target.moisturePct).not.toBe(before.target.moisturePct);
    expect(new PersistenceBaseline().predict(after.features)).toBe(
      new PersistenceBaseline().predict(before.features),
    );
  });
  it('no usa labels de entrenamiento recibidas después del corte aunque existan al evaluar', () => {
    const input = syntheticPersistenceInput();
    for (const row of input.observations.filter(
      (item) => item.recordedAt === '2026-10-31T12:00:00.000Z',
    ))
      row.receivedAt = '2026-11-01T00:00:01.000Z';
    const dataset = buildPersistenceDataset(input).dataset;
    expect(dataset.samples.some((row) => row.targetDay === '2026-10-31')).toBe(false);
    expect(dataset.samples.some((row) => row.targetDay === '2026-11-01')).toBe(false);
  });
  it('un target ausente o inválido no recibe un valor imputado', () => {
    const input = syntheticPersistenceInput();
    const row = input.observations.find(
      (item) => item.code === 'soil_1' && item.recordedAt === '2026-10-01T12:00:00.000Z',
    )!;
    row.quality = 'missing';
    row.moisturePct = null;
    expect(firstSample(input)).toBeUndefined();
    expect(buildPersistenceDataset(input).dataset.diagnostics[0].train.missingTargetDays).toBe(1);
  });
  it('sin hora de dispositivo usa recepción como tiempo efectivo, con procedencia explícita', () => {
    const input = syntheticPersistenceInput();
    for (const row of input.observations.filter((item) => item.eventId === 'synthetic-day-0'))
      row.recordedAt = null;
    expect(firstSample(input)?.featureEvidence.observedAt).toBe(input.observations[0].receivedAt);
  });
  it('desempata por tiempo efectivo, recepción y finalmente orden BigInt, sin depender del orden del archivo', () => {
    const input = syntheticPersistenceInput();
    addObservation(input, { eventId: 'tie', ingestionOrder: '9007199254740993', moisturePct: 72 });
    addObservation(input, { eventId: 'tie2', ingestionOrder: '9007199254740992', moisturePct: 3 });
    expect(firstSample(input)?.features.lastMoisturePct).toBe(72);
    input.observations.reverse();
    expect(firstSample(input)?.features.lastMoisturePct).toBe(72);
  });
  it('sin observaciones o sin sonda retorna métricas null, no error cero', () => {
    const input = syntheticPersistenceInput();
    input.observations = [];
    input.sensors = [];
    const { dataset, report } = evaluatePersistence(input);
    expect(dataset.samples).toEqual([]);
    expect(report.zones[0].test).toEqual({
      status: 'no_evaluable_samples',
      samples: 0,
      maePp: null,
      rmsePp: null,
      biasPp: null,
    });
  });
  it('no mezcla las identidades de parcelas/dispositivos/orígenes/sondas', () => {
    for (const change of [
      { source: 'real' },
      { plotId: 'foreign' },
      { deviceId: 'foreign' },
      { sensorId: 'foreign' },
      { code: 'soil_2' },
    ]) {
      const input = syntheticPersistenceInput();
      Object.assign(input.observations[0], change);
      expect(() => parsePersistenceInput(input)).toThrow(/mezclan/);
    }
  });
  it('rechaza duplicados exactos y procedencias inconsistentes de un evento', () => {
    const input = syntheticPersistenceInput();
    input.observations.push({ ...input.observations[0] });
    expect(() => parsePersistenceInput(input)).toThrow(/duplicado/);
    const bad = syntheticPersistenceInput();
    bad.observations[1].receivedAt = '2026-09-30T13:00:00.000Z';
    expect(() => parsePersistenceInput(bad)).toThrow(/incoherente/);
  });
  it.each([
    { from: '2026-02-30' },
    { trainUntil: '2026-10-01' },
    { validationUntil: '2026-12-01' },
    { toExclusive: '2026-12-01' },
    { trainUntil: '2026-11-15', validationUntil: '2026-11-01' },
    { from: '2024-01-01' },
  ])('rechaza fechas, particiones y periodos incompletos/no acotados %j', (extra) => {
    expect(() => parsePersistenceInput({ ...syntheticPersistenceInput(), ...extra })).toThrow();
  });
  it.each([NaN, Infinity, -1, 101, '40'])(
    'rechaza humedad inválida sin convertir tipos %s',
    (value) => {
      const input = syntheticPersistenceInput();
      Object.assign(input.observations[0], { moisturePct: value });
      expect(() => parsePersistenceInput(input)).toThrow(/Humedad/);
    },
  );
  it('rechaza campos desconocidos y timestamps no canónicos', () => {
    expect(() => parsePersistenceInput({ ...syntheticPersistenceInput(), horizonDays: 7 })).toThrow(
      /Estructura/,
    );
    const input = syntheticPersistenceInput();
    input.asOf = '2026-11-30';
    expect(() => parsePersistenceInput(input)).toThrow(/timestamps/);
  });
  it('MAE/RMSE/sesgo verificables a mano, en puntos porcentuales', () => {
    const score = scorePairs([
      { predicted: 0, observed: 2 },
      { predicted: 4, observed: 0 },
    ]);
    expect(score).toMatchObject({ status: 'evaluated', samples: 2, maePp: 3, biasPp: 1 });
    expect(score.rmsePp).toBeCloseTo(Math.sqrt(10));
    expect(scorePairs([{ predicted: 0, observed: 0 }]).rmsePp).toBe(0);
    expect(scorePairs([]).maePp).toBeNull();
    expect(() => scorePairs([{ predicted: NaN, observed: 0 }])).toThrow();
  });
});
