import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CurrentWeather, WeatherCitySearch } from '@cacaosmart/contracts';
import { WeatherRepository } from './weather.repository';
import { WeatherService } from './weather.service';
import { CurrentWeatherProvider } from './current-weather.provider';
import { publicWeatherCity, WeatherCitiesProvider } from './weather-cities.provider';

@Injectable()
export class WeatherCitiesService {
  constructor(
    private readonly repository: WeatherRepository,
    private readonly weather: WeatherService,
    private readonly cities: WeatherCitiesProvider,
    private readonly current: CurrentWeatherProvider,
  ) {}
  async search(plotId: string, ownerId: string, name: string): Promise<WeatherCitySearch> {
    await this.repository.snapshot(plotId, ownerId);
    if (!this.weather.isEnabled()) return { plotId, status: 'disabled', items: [] };
    let items;
    try {
      items = await this.cities.search(name.trim());
    } catch {
      throw new ServiceUnavailableException('No se pudieron buscar ciudades. Intenta más tarde.');
    }
    await this.repository.snapshot(plotId, ownerId);
    return { plotId, status: 'available', items };
  }
  async get(plotId: string, ownerId: string, cityId: number): Promise<CurrentWeather> {
    await this.repository.snapshot(plotId, ownerId);
    if (!this.weather.isEnabled()) return { plotId, status: 'disabled', current: null };
    let city, conditions;
    try {
      city = await this.cities.resolve(cityId);
      conditions = await this.current.read(city);
    } catch {
      throw new ServiceUnavailableException('Clima de la ciudad no disponible. Intenta más tarde.');
    }
    await this.repository.snapshot(plotId, ownerId);
    return { plotId, city: publicWeatherCity(city), status: 'available', current: conditions };
  }
}
