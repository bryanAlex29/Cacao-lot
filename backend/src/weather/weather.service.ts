import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment';
import { WeatherRepository } from './weather.repository';
import { OpenMeteoProvider, weatherWindow } from './open-meteo.provider';
import { WeatherProfileDto } from './weather.dto';

@Injectable()
export class WeatherService {
  constructor(private readonly repository: WeatherRepository, private readonly provider: OpenMeteoProvider,
    private readonly config: ConfigService<Environment, true>) {}
  isEnabled(): boolean { return this.config.get('WEATHER_PROVIDER', { infer: true }) === 'open-meteo'; }
  async get(plotId: string, ownerId: string) {
    return { provider: this.isEnabled() ? 'open-meteo' : 'disabled', ...await this.repository.snapshot(plotId, ownerId) };
  }
  async save(plotId: string, ownerId: string, input: WeatherProfileDto) {
    await this.repository.save(plotId, ownerId, input);
    return this.get(plotId, ownerId);
  }
  async sync(plotId: string, ownerId: string) {
    // Authorization happens before provider availability is disclosed.
    await this.repository.snapshot(plotId, ownerId);
    if (!this.isEnabled()) throw new ServiceUnavailableException('Conexión meteorológica desactivada. No se enviaron coordenadas.');
    const now = new Date(), claim = await this.repository.claim(plotId, ownerId, now);
    if (claim.kind === 'not-enabled') throw new BadRequestException('Autoriza primero el uso de coordenadas para clima.');
    if (claim.kind === 'cooldown') return { status: 'cooldown', ...await this.get(plotId, ownerId) };
    const { from, to } = weatherWindow(now);
    try {
      const result = await this.provider.fetch(claim.profile, from, to);
      await this.repository.finish(plotId, ownerId, claim.profile.version, now, from, to, result);
    } catch (error) {
      await this.repository.fail(plotId, claim.profile.version, now);
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('No se pudo sincronizar el clima. No se sustituyen datos por ejemplos; reintento disponible después de 15 minutos.');
    }
    return { status: 'updated', ...await this.get(plotId, ownerId) };
  }
}
