import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { normalizeWeather, OpenMeteoProvider, weatherWindow } from './open-meteo.provider';
import { weatherFixture } from '../../test/weather-fixture';
import { WeatherProfileDto } from './weather.dto';

const profile = { latitude: 0, longitude: 0, timezone: 'America/Guayaquil' };
const from = '2026-11-01', to = '2026-11-07';
describe('Clima histórico normalizado, nunca sensores ni predicción', () => {
  afterEach(() => jest.restoreAllMocks());
  it('ventana cruza meses/años, siete días completos y margen siete días', () => {
    expect(weatherWindow(new Date('2026-01-05T23:59:59Z'))).toEqual({ from: '2025-12-23', to: '2025-12-29' });
  });
  it('28 agregados conservan unidades, medias, sumas, cero y procedencia ERA5', () => {
    const data = normalizeWeather(weatherFixture(from, to), profile, from, to);
    expect(data.items).toHaveLength(28);
    expect(data.items.filter((v) => v.variable === 'precipitation')[0]).toMatchObject({ value: 12, unit: 'mm', quality: 'modeled' });
    expect(data.items.filter((v) => v.variable === 'et0_fao_evapotranspiration')[0].value).toBe(2.4);
    expect(data.items[0].value).toBe(24);
    expect(data.provenance).toMatchObject({ dataset: 'ERA5', model: 'era5', requestedLatitude: 0, gridLatitude: 0, adapterVersion: 'era5-hourly-v1' });
    const zero = weatherFixture(from, to);
    zero.hourly.precipitation.fill(0);
    expect(normalizeWeather(zero, profile, from, to).items.find((v) => v.variable === 'precipitation')?.value).toBe(0);
  });
  it('una hora null invalida solo ese día y variable; nunca suma parcialmente', () => {
    const data = weatherFixture(from, to);
    data.hourly.precipitation[4] = null;
    const normalized = normalizeWeather(data, profile, from, to);
    expect(normalized.items.find((v) => v.date === from && v.variable === 'precipitation')).toMatchObject({ value: null, quality: 'missing' });
    expect(normalized.items.filter((v) => v.value === null)).toHaveLength(1);
  });
  it('Galápagos conserva fecha civil y desfase sin usar zona del servidor', () => {
    expect(normalizeWeather(weatherFixture(from, to, 'Pacific/Galapagos'), { ...profile, timezone: 'Pacific/Galapagos' }, from, to).items[0].date).toBe(from);
  });
  it.each(['temperature_2m', 'relative_humidity_2m', 'precipitation', 'et0_fao_evapotranspiration'])('rechaza unidad alterada %s', (variable) => {
    const data = weatherFixture(from, to);
    data.hourly_units[variable] = 'inventada';
    expect(() => normalizeWeather(data, profile, from, to)).toThrow();
  });
  it.each([-1, 101, '80', Infinity])('rechaza humedad inválida %s', (value) => {
    const data = weatherFixture(from, to);
    (data.hourly.relative_humidity_2m as unknown[])[0] = value;
    expect(() => normalizeWeather(data, profile, from, to)).toThrow();
  });
  it.each(['duplicate', 'missing', 'unsorted', 'different-day'])('rechaza cobertura temporal %s', (kind) => {
    const data = weatherFixture(from, to);
    if (kind === 'missing') data.hourly.time.pop();
    else data.hourly.time[3] = kind === 'duplicate' ? data.hourly.time[2] : kind === 'unsorted' ? data.hourly.time[4] : '2026-10-01T03:00';
    expect(() => normalizeWeather(data, profile, from, to)).toThrow();
  });
  it.each([{ timezone: 'auto' }, { utc_offset_seconds: 0 }, { latitude: 30 }, { longitude: '0' }, { hourly: null }])('rechaza identidad/estructura incompatible %j', (extra) => {
    expect(() => normalizeWeather({ ...weatherFixture(from, to), ...extra }, profile, from, to)).toThrow();
  });
  it('petición fija HTTPS ERA5 no envía identidades ni tokens y rechaza errores sin fallback', async () => {
    const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(weatherFixture(from, to))));
    const data = await new OpenMeteoProvider().fetch(profile, from, to);
    expect(data.items).toHaveLength(28);
    const url = mock.mock.calls[0][0] as URL;
    expect(url.origin).toBe('https://archive-api.open-meteo.com');
    expect(url.searchParams.get('models')).toBe('era5');
    expect(url.searchParams.has('apikey')).toBe(false);
    expect(mock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    mock.mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(new OpenMeteoProvider().fetch(profile, from, to)).rejects.toThrow('unavailable');
  });
  it('rechaza respuesta mayor al límite y JSON malformado', async () => {
    const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x'.repeat(262145)));
    await expect(new OpenMeteoProvider().fetch(profile, from, to)).rejects.toThrow('too large');
    mock.mockResolvedValue(new Response('not-json'));
    await expect(new OpenMeteoProvider().fetch(profile, from, to)).rejects.toThrow();
  });
});

describe('DTO de ubicación meteorológica', () => {
  const valid = { ...profile, enabled: false, expectedVersion: 0 };
  it('acepta cero y extremos válidos sin convertir cadenas', async () => {
    expect(await validate(plainToInstance(WeatherProfileDto, valid))).toEqual([]);
    expect(await validate(plainToInstance(WeatherProfileDto, { ...valid, latitude: -90, longitude: 180 }))).toEqual([]);
  });
  it.each([{ latitude: '0' }, { latitude: null }, { longitude: 181 }, { latitude: 91 }, { latitude: 0.123456 },
    { enabled: 'true' }, { enabled: null }, { timezone: 'UTC' }, { expectedVersion: -1 }, { expectedVersion: 0.5 },
    { ownerId: 'someone' }, { consentAt: '2020-01-01' }])('rechaza configuración inválida %j', async (extra) => {
    expect((await validate(plainToInstance(WeatherProfileDto, { ...valid, ...extra }),
      { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });
});
