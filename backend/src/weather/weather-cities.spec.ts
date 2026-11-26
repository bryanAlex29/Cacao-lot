import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CurrentWeatherQuery, WeatherCitySearchQuery } from './weather-cities.dto';
import { normalizeWeatherCity, WeatherCitiesProvider } from './weather-cities.provider';
import { WeatherCitiesService } from './weather-cities.service';
import { WeatherRepository } from './weather.repository';
import { WeatherService } from './weather.service';
import { CurrentWeatherProvider } from './current-weather.provider';

const rawCity = {
  id: 3659139,
  name: 'Chone',
  admin1: 'Manabí',
  country: 'Ecuador',
  country_code: 'EC',
  latitude: -0.698,
  longitude: -80.094,
};
const publicCity = {
  id: rawCity.id,
  name: 'Chone',
  region: 'Manabí',
  country: 'Ecuador',
  countryCode: 'EC',
};
const options = { whitelist: true, forbidNonWhitelisted: true };
describe('City weather lookup, without changing plot coordinates or permissions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it('validates and trims city search, allowing Spanish names and region qualifiers', async () => {
    const input = plainToInstance(WeatherCitySearchQuery, { name: '  Chone, Ecuador  ' });
    expect(await validate(input, options)).toHaveLength(0);
    expect(input.name).toBe('Chone, Ecuador');
  });
  it.each(['', 'a', 'x'.repeat(81), 'https://example.test', '<script>', ['Chone'], 4])(
    'rejects invalid city searches (%j)',
    async (name) => {
      expect(
        (await validate(plainToInstance(WeatherCitySearchQuery, { name }), options)).length,
      ).toBeGreaterThan(0);
    },
  );
  it.each(['-1', '0', '1.5', 'NaN', '', '2147483648'])(
    'rejects invalid city ID %s',
    async (cityId) => {
      expect(
        (await validate(plainToInstance(CurrentWeatherQuery, { cityId }), options)).length,
      ).toBeGreaterThan(0);
    },
  );
  it('accepts only the city identifier, not client coordinates, URL or owner', async () => {
    expect(
      await validate(plainToInstance(CurrentWeatherQuery, { cityId: String(rawCity.id) }), options),
    ).toHaveLength(0);
    expect(await validate(plainToInstance(CurrentWeatherQuery, {}), options)).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(CurrentWeatherQuery, {
            cityId: rawCity.id,
            latitude: 0,
            longitude: 0,
            ownerId: 'other',
          }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('normalizes provider locations, allowing absence of optional region', () => {
    expect(normalizeWeatherCity(rawCity)).toMatchObject({
      ...publicCity,
      latitude: rawCity.latitude,
    });
    expect(normalizeWeatherCity({ ...rawCity, admin1: undefined }).region).toBeNull();
  });
  it.each([
    { latitude: 91 },
    { longitude: Infinity },
    { id: 0 },
    { country_code: 'invalid' },
    { name: '' },
    { name: 'unsafe\nname' },
    { latitude: '0' },
  ])('rejects invalid location %j', (patch) => {
    expect(() => normalizeWeatherCity({ ...rawCity, ...patch })).toThrow();
  });
  it('uses fixed HTTPS geocoding with Spanish results, bounded count, cache and no redirects', async () => {
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({ results: [rawCity] })));
    const provider = new WeatherCitiesProvider();
    expect(await provider.search('Chone')).toEqual([publicCity]);
    expect(await provider.search('Chone')).toEqual([publicCity]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      'https://geocoding-api.open-meteo.com/v1/search?name=Chone&count=5&language=es&format=json',
    );
    expect(init?.redirect).toBe('error');
  });
  it('resolves ID on the server rather than accepting supplied coordinates or names', async () => {
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(rawCity)));
    expect(await new WeatherCitiesProvider().resolve(rawCity.id)).toEqual(
      normalizeWeatherCity(rawCity),
    );
    expect(String(fetcher.mock.calls[0][0])).toContain(`/get?id=${rawCity.id}`);
  });
  it('rejects a different ID returned by geocoding', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(rawCity)));
    await expect(new WeatherCitiesProvider().resolve(123)).rejects.toThrow('identity');
  });
  it('handles an empty search without manufacturing a location', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    expect(await new WeatherCitiesProvider().search('No-such-city')).toEqual([]);
  });
  it('rejects duplicate, oversized and incompatible result sets', async () => {
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        async () => new Response(JSON.stringify({ results: [rawCity, rawCity] })),
      );
    await expect(new WeatherCitiesProvider().search('Chone')).rejects.toThrow();
    fetcher.mockResolvedValue(new Response('x'.repeat(65537)));
    await expect(new WeatherCitiesProvider().search('Quito')).rejects.toThrow('too large');
  });
  it('coalesces concurrent searches and backs off failures', async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('private-detail'));
    const provider = new WeatherCitiesProvider();
    const replies = await Promise.allSettled([provider.search('Chone'), provider.search('Chone')]);
    expect(replies.every((r) => r.status === 'rejected')).toBe(true);
    await expect(provider.search('Chone')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  function setup() {
    const repository = { snapshot: jest.fn().mockResolvedValue({ profile: null }) };
    const weather = { isEnabled: jest.fn().mockReturnValue(true) };
    const cities = {
      search: jest.fn().mockResolvedValue([publicCity]),
      resolve: jest.fn().mockResolvedValue(normalizeWeatherCity(rawCity)),
    };
    const current = {
      read: jest.fn().mockResolvedValue({ provider: 'Open-Meteo', quality: 'modeled' }),
    };
    const service = new WeatherCitiesService(
      repository as unknown as WeatherRepository,
      weather as unknown as WeatherService,
      cities as unknown as WeatherCitiesProvider,
      current as unknown as CurrentWeatherProvider,
    );
    return { service, repository, weather, cities, current };
  }
  it.each(['search', 'get'] as const)(
    'checks plot ownership before provider or cache (%s)',
    async (method) => {
      const { service, repository, weather, cities, current } = setup();
      repository.snapshot.mockRejectedValue(new Error('not owned'));
      await expect(
        method === 'search'
          ? service.search('plot', 'other', 'Chone')
          : service.get('plot', 'other', rawCity.id),
      ).rejects.toThrow('not owned');
      expect(weather.isEnabled).not.toHaveBeenCalled();
      expect(cities.search).not.toHaveBeenCalled();
      expect(cities.resolve).not.toHaveBeenCalled();
      expect(current.read).not.toHaveBeenCalled();
    },
  );
  it('respects provider disabled even after a user has selected a city', async () => {
    const { service, weather, cities, current } = setup();
    weather.isEnabled.mockReturnValue(false);
    expect(await service.search('plot', 'owner', 'Chone')).toMatchObject({
      status: 'disabled',
      items: [],
    });
    expect(await service.get('plot', 'owner', rawCity.id)).toMatchObject({
      status: 'disabled',
      current: null,
    });
    expect(cities.search).not.toHaveBeenCalled();
    expect(current.read).not.toHaveBeenCalled();
  });
  it('returns a public city label without altering plot/profile, including when no profile exists', async () => {
    const { service, repository, current } = setup();
    const value = await service.get('plot', 'owner', rawCity.id);
    expect(value).toMatchObject({ plotId: 'plot', status: 'available', city: publicCity });
    expect(value.city).not.toHaveProperty('latitude');
    expect(current.read).toHaveBeenCalledWith(normalizeWeatherCity(rawCity));
    expect(repository.snapshot).toHaveBeenCalledTimes(2);
  });
  it('rechecks ownership after geocoding before returning a result', async () => {
    const { service, repository } = setup();
    repository.snapshot
      .mockResolvedValueOnce({ profile: null })
      .mockRejectedValueOnce(new Error('archived'));
    await expect(service.search('plot', 'owner', 'Chone')).rejects.toThrow('archived');
  });
  it('sanitizes upstream errors without leaking URLs or request contents', async () => {
    const { service, cities, current } = setup();
    cities.search.mockRejectedValue(new Error('secret-url'));
    current.read.mockRejectedValue(new Error('secret-url'));
    await expect(service.search('plot', 'owner', 'Chone')).rejects.toThrow(
      'No se pudieron buscar ciudades',
    );
    await expect(service.get('plot', 'owner', rawCity.id)).rejects.toThrow(
      'Clima de la ciudad no disponible',
    );
  });
});
