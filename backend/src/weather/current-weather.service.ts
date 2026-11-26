import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CurrentWeather } from '@cacaosmart/contracts';
import { WeatherRepository } from './weather.repository';
import { WeatherService } from './weather.service';
import { CurrentWeatherProvider } from './current-weather.provider';

@Injectable()
export class CurrentWeatherService {
  constructor(
    private readonly repository: WeatherRepository,
    private readonly weather: WeatherService,
    private readonly provider: CurrentWeatherProvider,
  ) {}
  async get(plotId: string, ownerId: string): Promise<CurrentWeather> {
    const { profile } = await this.repository.snapshot(plotId, ownerId);
    if (!this.weather.isEnabled()) return { plotId, status: 'disabled', current: null };
    if (!profile?.enabled || !profile.consentAt)
      return { plotId, status: 'location_required', current: null };
    let current: NonNullable<CurrentWeather['current']>;
    try {
      current = await this.provider.read(profile);
    } catch {
      throw new ServiceUnavailableException('Clima actual no disponible. Intenta más tarde.');
    }
    // Recheck ownership and consent even on cache hits and after the external request.
    const latest = await this.repository.snapshot(plotId, ownerId);
    if (
      !latest.profile?.enabled ||
      !latest.profile.consentAt ||
      latest.profile.version !== profile.version
    )
      throw new ConflictException('La ubicación o autorización cambió. Actualiza la tarjeta.');
    return { plotId, status: 'available', current };
  }
}
