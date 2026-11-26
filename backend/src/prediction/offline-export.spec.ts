import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OfflineExportQueryDto } from './offline-export.dto';
import { OfflineExportService, offlineObservationLimit } from './offline-export.service';
import { PredictionRepository } from './prediction.repository';
import { SourcePolicy } from '../integrations/source-policy.service';
import type { PersistenceObservation } from './offline/persistence-input';
import { buildRegressionDataset } from './offline/regression-dataset';

describe('Exportación privada para evaluación offline', () => {
  const read = jest.fn();
  const requireSource = jest.fn();
  const repository = { exportOffline: read } as unknown as PredictionRepository;
  const sources = { require: requireSource } as unknown as SourcePolicy;
  const service = new OfflineExportService(repository, sources);
  const deviceId = 'e456f570-b7c2-4000-8000-000000000001';
  const query = (): OfflineExportQueryDto => ({
    source: 'demo',
    deviceId,
    from: '2026-01-03',
    trainUntil: '2026-01-05',
    validationUntil: '2026-01-07',
    toExclusive: '2026-01-09',
  });
  beforeEach(() => {
    jest.clearAllMocks();
    read.mockResolvedValue({ sensors: [], observations: [] });
  });
  it('congela asOf, incluye dos días de retardo y no fabrica datos ni métricas', async () => {
    const buffer = await service.export('plot', 'owner', query());
    const input = JSON.parse(buffer.toString());
    expect(input).toMatchObject({
      schemaVersion: '1.0',
      source: 'demo',
      observations: [],
      sensors: [],
    });
    expect(read).toHaveBeenCalledWith(
      'plot',
      'owner',
      'demo',
      deviceId,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-09T00:00:00Z'),
      expect.any(Date),
      offlineObservationLimit,
    );
    expect(input.asOf).toBe(read.mock.calls[0][6].toISOString());
    const data = buildRegressionDataset(input).dataset;
    expect(data.samples).toEqual([]);
    expect(data.diagnostics.every((zone) => zone.train.comparisonSamples === 0)).toBe(true);
    expect(requireSource).toHaveBeenCalledWith('demo');
  });
  it.each([
    { from: '2026-02-30' },
    { trainUntil: '2026-01-03' },
    { validationUntil: '2026-01-09' },
    { toExclusive: '2999-01-01' },
    { from: '2020-01-01' },
  ])('rechaza fechas/cortes inválidos antes de leer %j', async (change) => {
    await expect(service.export('plot', 'owner', { ...query(), ...change })).rejects.toMatchObject({
      status: 400,
    });
    expect(read).not.toHaveBeenCalled();
  });
  it('rechaza canal no permitido antes de acceder al repositorio', async () => {
    requireSource.mockImplementationOnce(() => {
      throw new Error('DEMO deshabilitado');
    });
    await expect(service.export('plot', 'owner', query())).rejects.toThrow('DEMO deshabilitado');
    expect(read).not.toHaveBeenCalled();
  });
  it('rechaza exceso de observaciones sin devolver una muestra truncada', async () => {
    read.mockResolvedValue({ sensors: [], observations: new Array(offlineObservationLimit + 1) });
    await expect(service.export('plot', 'owner', query())).rejects.toMatchObject({ status: 413 });
  });
  it('rechaza JSON mayor de 16 MB aunque no exceda el número de observaciones', async () => {
    const observations: PersistenceObservation[] = Array.from({ length: 60000 }, (_, index) => ({
      eventId: `event-${index}-${'x'.repeat(80)}`,
      ingestionOrder: String(index + 1),
      plotId: 'plot',
      deviceId,
      source: 'demo',
      sensorId: 'sensor',
      code: 'soil_1',
      recordedAt: null,
      receivedAt: '2026-01-04T00:00:00.000Z',
      moisturePct: 0,
      quality: 'valid',
    }));
    read.mockResolvedValue({ sensors: [{ id: 'sensor', code: 'soil_1' }], observations });
    await expect(service.export('plot', 'owner', query())).rejects.toMatchObject({ status: 413 });
  });
  it.each([
    { source: undefined },
    { deviceId: undefined },
    { source: 'mixed' },
    { deviceId: 'bad' },
    { from: ['2026-01-03'] },
    { from: '2026-01-03T00:00:00Z' },
  ])('DTO rechaza selección ausente, arrays y formatos no admitidos %j', (change) => {
    expect(
      validateSync(plainToInstance(OfflineExportQueryDto, { ...query(), ...change })).length,
    ).toBeGreaterThan(0);
  });
  it('DTO acepta selección explícita y días UTC', () => {
    expect(validateSync(plainToInstance(OfflineExportQueryDto, query()))).toEqual([]);
  });
});
