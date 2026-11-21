import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { DataSource } from '@cacaosmart/contracts';
import { SourcePolicy } from '../integrations/source-policy.service';
import { OfflineAlertRepository } from './offline-alert.repository';

/** Polls independently of Socket.IO clients. Restart/concurrent scans reuse persisted episodes. */
@Injectable()
export class OfflineAlertDetector implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OfflineAlertDetector.name);
  private timer?: ReturnType<typeof setInterval>;
  private scanning = false;
  private stopping = false;
  private running?: Promise<void>;
  constructor(
    private readonly repository: OfflineAlertRepository,
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
    if (this.scanning || this.stopping) return this.running ?? Promise.resolve();
    this.scanning = true;
    this.running = this.sweep()
      .catch(() => {
        this.logger.warn(
          'No se pudo evaluar la desconexión; se reintentará sin generar alertas ficticias.',
        );
      })
      .finally(() => {
        this.scanning = false;
      });
    return this.running;
  }

  private async sweep(): Promise<void> {
    const sources = (['real', 'demo'] as DataSource[]).filter((source) =>
      this.sources.allows(source),
    );
    let after: string | undefined;
    while (!this.stopping) {
      const devices = await this.repository.candidates(sources, after);
      for (const device of devices) {
        if (this.stopping) return;
        try {
          await this.repository.synchronize(device.id, (source) => this.sources.allows(source));
        } catch {
          this.logger.warn('No se pudo evaluar un dispositivo; las demás evaluaciones continúan.');
        }
      }
      if (devices.length < 100) return;
      after = devices.at(-1)!.id;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }
}
