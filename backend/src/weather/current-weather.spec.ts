import { CurrentWeatherProvider, normalizeCurrentWeather } from './current-weather.provider';
import { CurrentWeatherService } from './current-weather.service';
import { WeatherRepository } from './weather.repository';
import { WeatherService } from './weather.service';

const location = { latitude: -0.7, longitude: -80.1 };
const now = new Date('2026-11-26T03:00:00Z');
function fixture() {
  return {
    ...location,
    timezone: 'GMT',
    utc_offset_seconds: 0,
    current_units: {
      time: 'unixtime',
      interval: 'seconds',
      temperature_2m: '°C',
      apparent_temperature: '°C',
      relative_humidity_2m: '%',
      precipitation: 'mm',
      weather_code: 'wmo code',
      is_day: '',
    },
    current: {
      time: now.getTime() / 1000,
      interval: 900,
      temperature_2m: 26,
      apparent_temperature: 28,
      relative_humidity_2m: 80,
      precipitation: 0,
      weather_code: 3,
      is_day: 0,
    },
  };
}
describe('Current modeled weather, independent of sensor telemetry', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it('preserves zero precipitation, night, units and provenance', () => {
    expect(normalizeCurrentWeather(fixture(), location, now)).toMatchObject({
      observedAt: now.toISOString(),
      temperatureC: 26,
      precipitationMm: 0,
      isDay: false,
      provider: 'Open-Meteo',
      quality: 'modeled',
      intervalSeconds: 900,
    });
  });
  it('keeps a missing value null without filling from another source', () => {
    const raw = fixture();
    expect(
      normalizeCurrentWeather(
        { ...raw, current: { ...raw.current, temperature_2m: null } },
        location,
        now,
      ).temperatureC,
    ).toBeNull();
  });
  it.each([
    { timezone: 'America/Guayaquil' },
    { latitude: 50 },
    { current_units: { ...fixture().current_units, precipitation: '%' } },
    { current: { ...fixture().current, time: now.getTime() / 1000 - 7200 } },
    { current: { ...fixture().current, relative_humidity_2m: 101 } },
    { current: { ...fixture().current, weather_code: 4 } },
    { current: { ...fixture().current, temperature_2m: '26' } },
    { current: { ...fixture().current, interval: 0 } },
  ])('rejects incompatible location, time, values and units (%j)', (patch) => {
    expect(() => normalizeCurrentWeather({ ...fixture(), ...patch }, location, now)).toThrow();
  });
  it('coalesces requests, caches 15 minutes and uses only fixed HTTPS endpoint', async () => {
    jest.useFakeTimers().setSystemTime(now);
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify(fixture())));
    const provider = new CurrentWeatherProvider();
    const [a, b] = await Promise.all([provider.read(location), provider.read(location)]);
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toContain('https://api.open-meteo.com/v1/forecast?');
    expect(String(url)).toContain('timeformat=unixtime');
    expect(options?.redirect).toBe('error');
    await provider.read(location);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('backs off failed responses and does not return fabricated current values', async () => {
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('private provider detail'));
    const provider = new CurrentWeatherProvider();
    await expect(provider.read(location)).rejects.toThrow();
    await expect(provider.read(location)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  function setup() {
    const profile = { ...location, version: 1, enabled: true, consentAt: now };
    const repository = { snapshot: jest.fn().mockResolvedValue({ profile }) };
    const weather = { isEnabled: jest.fn().mockReturnValue(true) };
    const provider = {
      read: jest.fn().mockResolvedValue(normalizeCurrentWeather(fixture(), location, now)),
    };
    return {
      repository,
      weather,
      provider,
      service: new CurrentWeatherService(
        repository as unknown as WeatherRepository,
        weather as unknown as WeatherService,
        provider as unknown as CurrentWeatherProvider,
      ),
    };
  }
  it('authorizes ownership before calling or revealing provider availability', async () => {
    const { service, repository, weather, provider } = setup();
    repository.snapshot.mockRejectedValue(new Error('not owned'));
    await expect(service.get('plot', 'other')).rejects.toThrow('not owned');
    expect(weather.isEnabled).not.toHaveBeenCalled();
    expect(provider.read).not.toHaveBeenCalled();
  });
  it('does not send coordinates when provider is disabled', async () => {
    const { service, weather, provider } = setup();
    weather.isEnabled.mockReturnValue(false);
    expect(await service.get('plot', 'owner')).toEqual({
      plotId: 'plot',
      status: 'disabled',
      current: null,
    });
    expect(provider.read).not.toHaveBeenCalled();
  });
  it('does not infer coordinates or consent from the plot name', async () => {
    const { service, repository, provider } = setup();
    repository.snapshot.mockResolvedValue({ profile: null });
    expect((await service.get('plot', 'owner')).status).toBe('location_required');
    expect(provider.read).not.toHaveBeenCalled();
  });
  it('rejects consent/profile changes during the request', async () => {
    const { service, repository } = setup();
    repository.snapshot
      .mockResolvedValueOnce({
        profile: { ...location, version: 1, enabled: true, consentAt: now },
      })
      .mockResolvedValueOnce({
        profile: { ...location, version: 2, enabled: false, consentAt: null },
      });
    await expect(service.get('plot', 'owner')).rejects.toThrow('autorización cambió');
  });
  it('sanitizes provider failure without leaking upstream details', async () => {
    const { service, provider } = setup();
    provider.read.mockRejectedValue(new Error('secret-url'));
    await expect(service.get('plot', 'owner')).rejects.toThrow('Clima actual no disponible');
  });
  it('returns conditions after a second ownership/consent verification', async () => {
    const { service, repository } = setup();
    expect(await service.get('plot', 'owner')).toMatchObject({
      plotId: 'plot',
      status: 'available',
      current: { quality: 'modeled', provider: 'Open-Meteo' },
    });
    expect(repository.snapshot).toHaveBeenCalledTimes(2);
  });
});
