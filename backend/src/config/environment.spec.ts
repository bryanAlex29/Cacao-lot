import { validateEnvironment } from './environment';

const base = {
  DATABASE_URL: 'postgresql://test:test@localhost:5433/test',
  JWT_SECRET: '1'.repeat(64),
};

describe('Configuración de entorno', () => {
  it('clima desactivado por defecto; exige confirmación no comercial explícita al habilitar', () => {
    expect(validateEnvironment(base).WEATHER_PROVIDER).toBe('disabled');
    expect(() => validateEnvironment({ ...base, WEATHER_PROVIDER: 'other' })).toThrow(
      'WEATHER_PROVIDER',
    );
    for (const value of [undefined, false, 'false', true])
      expect(() =>
        validateEnvironment({
          ...base,
          WEATHER_PROVIDER: 'open-meteo',
          WEATHER_NONCOMMERCIAL_CONFIRMED: value,
        }),
      ).toThrow('NONCOMMERCIAL');
    expect(
      validateEnvironment({
        ...base,
        WEATHER_PROVIDER: 'open-meteo',
        WEATHER_NONCOMMERCIAL_CONFIRMED: 'true',
      }).WEATHER_PROVIDER,
    ).toBe('open-meteo');
  });
  it('aplica valores seguros para desarrollo', () => {
    expect(validateEnvironment(base)).toMatchObject({
      HOST: '127.0.0.1',
      PORT: 3100,
      TELEMETRY_MODE: 'real',
    });
  });

  it.each([0, 65536, 'abc', 1.5])('rechaza puerto inválido %s', (PORT) => {
    expect(() => validateEnvironment({ ...base, PORT })).toThrow('PORT');
  });

  it.each(['', 'mysql://test:test@localhost/test', 'postgresql://test@localhost/test'])(
    'rechaza DATABASE_URL inválida sin exponer su valor',
    (DATABASE_URL) => {
      expect(() => validateEnvironment({ DATABASE_URL })).toThrow('DATABASE_URL');
    },
  );

  it.each(['*', 'http://localhost:4200/path', 'ftp://localhost'])(
    'rechaza CORS %s',
    (CORS_ORIGIN) => {
      expect(() => validateEnvironment({ ...base, CORS_ORIGIN })).toThrow('CORS_ORIGIN');
    },
  );

  it('impide demo en producción', () => {
    expect(() =>
      validateEnvironment({ ...base, NODE_ENV: 'production', TELEMETRY_MODE: 'demo' }),
    ).toThrow('demo');
  });

  it('permite demo explícita solo fuera de producción', () => {
    expect(validateEnvironment({ ...base, TELEMETRY_MODE: 'demo' }).TELEMETRY_MODE).toBe('demo');
  });

  it.each([undefined, '', 'short', 'z'.repeat(64)])(
    'rechaza JWT_SECRET ausente o inválido',
    (JWT_SECRET) => {
      expect(() => validateEnvironment({ ...base, JWT_SECRET })).toThrow('JWT_SECRET');
    },
  );
  it('usa mock solo en desarrollo y deshabilita diagnóstico por defecto en producción', () => {
    expect(validateEnvironment(base).AI_PROVIDER).toBe('mock');
    expect(validateEnvironment({ ...base, NODE_ENV: 'production' }).AI_PROVIDER).toBe('disabled');
    expect(() =>
      validateEnvironment({ ...base, NODE_ENV: 'production', AI_PROVIDER: 'mock' }),
    ).toThrow('AI_PROVIDER');
    expect(() => validateEnvironment({ ...base, AI_PROVIDER: 'openai' })).toThrow('OPENAI_API_KEY');
  });
  it('OpenAI requiere credencial privada y modelo válido sin exponer sus valores en errores', () => {
    const config = { ...base, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only-not-a-key' };
    expect(validateEnvironment(config).OPENAI_VISION_MODEL).toBe('gpt-5.4-mini');
    expect(validateEnvironment({ ...config, NODE_ENV: 'production' }).AI_PROVIDER).toBe('openai');
    expect(() => validateEnvironment({ ...config, OPENAI_VISION_MODEL: 'https://other' })).toThrow(
      'válidos',
    );
  });
  it.each([
    { AI_MAX_IMAGE_MB: 0 },
    { AI_MAX_IMAGE_MB: 9 },
    { AI_DAILY_LIMIT_PER_USER: -1 },
    { AI_DAILY_LIMIT_PER_USER: 1.5 },
    { AI_REQUEST_TIMEOUT_MS: 30001 },
    { IMAGE_RETENTION_DAYS: 0 },
    { IMAGE_RETENTION_DAYS: 31 },
  ])('rechaza límites de imágenes/IA incompatibles %j', (extra) => {
    expect(() => validateEnvironment({ ...base, ...extra })).toThrow();
  });
});
