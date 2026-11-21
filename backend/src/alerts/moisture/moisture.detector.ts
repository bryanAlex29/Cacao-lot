import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { DataSource } from '@cacaosmart/contracts';
import { SourcePolicy } from '../../integrations/source-policy.service';
import { MoistureRepository } from './moisture.repository';

@Injectable()
export class MoistureDetector implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MoistureDetector.name);
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private running?: Promise<void>;
  constructor(
    private readonly repository: MoistureRepository,
    private readonly sources: SourcePolicy,
  ) {}
  onApplicationBootstrap(): void {
    void this.scan();
    this.timer = setInterval(() => {
      void this.scan();
    }, 5000);
    this.timer.unref();
  }
  scan(): Promise<void> {
    if (this.stopped || this.running) return this.running ?? Promise.resolve();
    this.running = this.sweep()
      .catch(() =>
        this.logger.warn(
          'No se pudieron evaluar alertas de humedad; no se generan avisos ficticios.',
        ),
      )
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async sweep(): Promise<void> {
    const sources = (['real', 'demo'] as DataSource[]).filter((source) =>
      this.sources.allows(source),
    );
    let after: string | undefined;
    while (!this.stopped) {
      const sensors = await this.repository.candidates(sources, after);
      for (const sensor of sensors) {
        if (this.stopped) return;
        try {
          await this.repository.synchronize(sensor.id, (source) => this.sources.allows(source));
        } catch {
          this.logger.warn(
            'No se pudo evaluar una sonda; se conserva su estado y continúan las demás.',
          );
        }
      }
      if (sensors.length < 50) return;
      after = sensors.at(-1)!.id;
    }
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    await this.running;
  }
}
