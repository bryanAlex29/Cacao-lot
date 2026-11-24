import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { WeatherRepository } from './weather.repository';
import { WeatherService } from './weather.service';

/** Serial, bounded per sweep. No external activity unless operator AND owner have opted in. */
@Injectable()
export class WeatherJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WeatherJob.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  private after?: string;
  constructor(private readonly repository: WeatherRepository, private readonly service: WeatherService) {}
  onApplicationBootstrap() {
    if (!this.service.isEnabled()) return;
    void this.scan();
    this.timer = setInterval(() => void this.scan(), 3600000);
    this.timer.unref();
  }
  scan(): Promise<void> {
    if (this.stopping || !this.service.isEnabled()) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.sweep().catch(() => {
      this.logger.warn('No se pudo revisar la sincronización meteorológica; sin datos de reemplazo.');
    }).finally(() => { this.running = undefined; });
    return this.running;
  }
  private async sweep() {
    const profiles = await this.repository.candidates(this.after);
    for (const profile of profiles) {
      if (this.stopping || !this.service.isEnabled()) return;
      if (profile.syncedAt && Date.now() - profile.syncedAt.getTime() < 86400000) continue;
      try { await this.service.sync(profile.plotId, profile.plot.ownerId); }
      catch { this.logger.warn('Clima no disponible para una parcela; se reintentará en otra revisión.'); }
    }
    this.after = profiles.length === 50 ? profiles.at(-1)!.plotId : undefined;
  }
  async onModuleDestroy() { this.stopping = true; clearInterval(this.timer); await this.running; }
}
