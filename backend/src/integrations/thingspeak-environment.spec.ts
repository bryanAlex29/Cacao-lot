import { validateEnvironment } from '../config/environment';

const base = { DATABASE_URL: 'postgresql://test:test@localhost/test', JWT_SECRET: '1'.repeat(64) };

describe('ThingSpeak environment', () => {
  it('remains disabled and optional by default', () => {
    expect(validateEnvironment(base)).toMatchObject({
      THINGSPEAK_IMPORT_ENABLED: false,
      THINGSPEAK_CHANNEL_ID: '',
      THINGSPEAK_READ_API_KEY: '',
    });
  });
  it('retains configured variables through Nest environment validation', () => {
    expect(
      validateEnvironment({
        ...base,
        THINGSPEAK_IMPORT_ENABLED: 'true',
        THINGSPEAK_CHANNEL_ID: '3554501',
        THINGSPEAK_READ_API_KEY: 'READ123',
      }),
    ).toMatchObject({
      THINGSPEAK_IMPORT_ENABLED: true,
      THINGSPEAK_CHANNEL_ID: '3554501',
      THINGSPEAK_READ_API_KEY: 'READ123',
    });
  });
  it.each([
    { THINGSPEAK_IMPORT_ENABLED: 'true' },
    { THINGSPEAK_IMPORT_ENABLED: 'yes' },
    { THINGSPEAK_CHANNEL_ID: '../other' },
    { THINGSPEAK_READ_API_KEY: 'bad&key' },
    { THINGSPEAK_IMPORT_ENABLED: 'true', THINGSPEAK_CHANNEL_ID: '123' },
    { NODE_ENV: 'production', THINGSPEAK_IMPORT_ENABLED: 'true', THINGSPEAK_CHANNEL_ID: '3554501' },
  ])('rejects incompatible config without exposing secrets', (overrides) => {
    expect(() => validateEnvironment({ ...base, ...overrides })).toThrow('ThingSpeak');
  });
});
