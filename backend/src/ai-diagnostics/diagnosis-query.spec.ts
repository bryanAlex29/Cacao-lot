import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DiagnosisPageDto } from './diagnosis.dto';

describe('Consulta filtrada de diagnósticos', () => {
  const base = { plotId: '31851c38-80dd-4eb4-b86c-a427f6210ae4' };
  const errors = (value: object) =>
    validate(plainToInstance(DiagnosisPageDto, { ...base, ...value }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  it.each([
    {},
    { status: 'pending' },
    { status: 'completed' },
    { status: 'failed' },
    {
      from: '2026-11-23T00:00:00-05:00',
      to: '2026-11-23T23:59:59-05:00',
      limit: '10',
      offset: '10',
    },
  ])('acepta filtros opcionales %j', async (value) => {
    expect(await errors(value)).toHaveLength(0);
  });
  it.each([
    { status: 'all' },
    { status: '' },
    { status: ['pending', 'failed'] },
    { from: '2026-02-30T00:00:00Z' },
    { from: '2026-11-23' },
    { from: '2026-11-23T12:00:00' },
    { to: 'not-date' },
    { from: ['2026-11-23T00:00:00Z'] },
    { ownerId: 'client' },
    { provider: 'openai' },
    { source: 'real' },
    { limit: 101 },
  ])('rechaza filtros inválidos o campos ajenos %j', async (value) => {
    expect((await errors(value)).length).toBeGreaterThan(0);
  });
});
