import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, validate } from 'class-validator';
import { PredictionQueryDto } from './prediction.dto';
import { PredictionRepository } from './prediction.repository';
import { PredictionService, coverageWindow } from './prediction.service';
import { SourcePolicy } from '../integrations/source-policy.service';

describe('Disponibilidad de predicción, sin modelos ficticios', () => {
  const inspect = jest.fn();
  const requireSource = jest.fn();
  const repository = { inspect } as unknown as PredictionRepository;
  const sources = { require: requireSource } as unknown as SourcePolicy;
  beforeEach(() => {
    jest.clearAllMocks();
    inspect.mockResolvedValue({ device: null, zones: [] });
  });
  it.each(['2026-11-24T12:30:00Z', '2026-03-01T00:00:00Z', '2024-03-01T23:59:59Z'])(
    'usa 30 días UTC completos, excluye hoy y conserva fronteras %s',
    (date) => {
      const now = new Date(date),
        { from, to } = coverageWindow(now);
      expect(to.toISOString()).toBe(date.slice(0, 10) + 'T00:00:00.000Z');
      expect(to.getTime() - from.getTime()).toBe(30 * 86400000);
      expect(to.getTime()).toBeLessThanOrEqual(now.getTime());
    },
  );
  it('sin equipo devuelve tres zonas vacías, nunca valores, modelo o agua inventados', async () => {
    const result = await new PredictionService(repository, sources).get(
      'plot',
      'owner',
      new PredictionQueryDto(),
    );
    expect(result).toMatchObject({
      source: 'real',
      status: 'unavailable',
      reason: 'model_not_implemented',
      device: null,
      model: null,
      predictions: [],
      waterDemand: null,
      target: { unit: '%', horizonDays: 1 },
    });
    expect(result.zones.map((zone) => [zone.code, zone.sensorId, zone.validSamples])).toEqual([
      ['soil_1', null, 0],
      ['soil_2', null, 0],
      ['soil_3', null, 0],
    ]);
    expect(requireSource).toHaveBeenCalledWith('real');
  });
  it('con muchas muestras conserva indisponibilidad, separa códigos y no confunde cobertura con suficiencia', async () => {
    inspect.mockResolvedValue({
      device: { id: 'device', serial: 'demo', isActive: false },
      zones: [
        {
          code: 'soil_2',
          sensorId: 'sensor2',
          enabled: false,
          samples: 1000,
          validSamples: 500,
          validDaysUtc: 30,
          firstValidAt: new Date('2026-10-01T00:00:00Z'),
          lastValidAt: new Date('2026-10-30T00:00:00Z'),
        },
      ],
    });
    const query = Object.assign(new PredictionQueryDto(), { source: 'demo', deviceId: 'device' });
    const result = await new PredictionService(repository, sources).get('plot', 'owner', query);
    expect(result.source).toBe('demo');
    expect(result.status).toBe('unavailable');
    expect(result.model).toBeNull();
    expect(result.zones[1]).toMatchObject({
      code: 'soil_2',
      sensorId: 'sensor2',
      enabled: false,
      validSamples: 500,
      validDaysUtc: 30,
      firstValidAt: '2026-10-01T00:00:00.000Z',
    });
    expect(result.zones[0].validSamples).toBe(0);
    expect(inspect).toHaveBeenCalledWith(
      'plot',
      'owner',
      'demo',
      'device',
      expect.any(Date),
      expect.any(Date),
      expect.any(Date),
    );
  });
  it('origen no permitido falla antes de consultar', async () => {
    requireSource.mockImplementationOnce(() => {
      throw new Error('disabled');
    });
    await expect(
      new PredictionService(repository, sources).get('plot', 'owner', new PredictionQueryDto()),
    ).rejects.toThrow('disabled');
    expect(inspect).not.toHaveBeenCalled();
  });
  it.each([
    { horizonDays: '7' },
    { horizonDays: '0' },
    { horizonDays: '' },
    { source: 'all' },
    { deviceId: 'bad' },
    { horizonDays: ['1', '1'] },
  ])('rechaza consulta inválida %j', (input) => {
    expect(validateSync(plainToInstance(PredictionQueryDto, input)).length).toBeGreaterThan(0);
  });
  it('consulta por defecto o horizonte 1 explícito válidos', async () => {
    expect(await validate(new PredictionQueryDto())).toHaveLength(0);
    expect(
      await validate(plainToInstance(PredictionQueryDto, { horizonDays: '1', source: 'demo' })),
    ).toHaveLength(0);
  });
});
