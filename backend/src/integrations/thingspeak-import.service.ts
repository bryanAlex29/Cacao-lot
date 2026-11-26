import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ThingSpeakClient } from './thingspeak.client';
import { mapThingSpeakSnapshot } from './thingspeak.mapping';
import { parseThingSpeakBinding, ThingSpeakBinding } from './thingspeak-binding';

@Injectable()
export class ThingSpeakImportService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ThingSpeakImportService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private stopped = false;
  private failures = 0;

  constructor(
    private readonly db: PrismaService,
    private readonly telemetry: TelemetryService,
    private readonly client: ThingSpeakClient,
  ) {}

  private async binding() {
    return parseThingSpeakBinding(
      JSON.parse(await readFile(resolve(__dirname, '../../../.local/thingspeak.json'), 'utf8')),
    );
  }

  async runOnce(binding?: ThingSpeakBinding) {
    const target = parseThingSpeakBinding(binding ?? (await this.binding()));
    if (
      process.env.NODE_ENV !== 'development' ||
      process.env.THINGSPEAK_CHANNEL_ID !== String(target.channelId)
    ) {
      throw new Error('Importador local no configurado.');
    }
    const device = await this.db.device.findFirst({
      where: {
        id: target.deviceId,
        plotId: target.plotId,
        serial: `thingspeak-${target.channelId}`,
        source: 'real',
        isActive: true,
        plot: { ownerId: target.ownerId, archivedAt: null, owner: { isActive: true } },
      },
      select: { id: true, plotId: true, source: true, credentialHash: true },
    });
    if (!device) throw new Error('Asociación externa no autorizada.');
    const mapped = mapThingSpeakSnapshot(await this.client.readLatest());
    if (!mapped) return { status: 'empty' as const };
    const result = await this.telemetry.ingest(
      device,
      {
        schemaVersion: '1.2',
        deviceId: device.id,
        eventId: `thingspeak:${target.channelId}:${mapped.entryId}`,
        recordedAt: null,
        soilMoisture: mapped.soilMoisture,
        temperatureC: mapped.temperatureC,
        airHumidityPct: mapped.airHumidityPct,
        rainDetected: null,
        valve: mapped.valve,
      },
      {
        ownerId: target.ownerId,
        channelId: target.channelId,
        entryId: mapped.entryId,
        providerObservedAt: mapped.providerCreatedAt,
        // Calibración de suelo declarada por el usuario; ambiente no acreditado técnicamente.
        quality: {
          ...mapped.quality,
          temperatureC:
            mapped.quality.temperatureC === 'valid' ? 'uncalibrated' : mapped.quality.temperatureC,
          airHumidityPct:
            mapped.quality.airHumidityPct === 'valid'
              ? 'uncalibrated'
              : mapped.quality.airHumidityPct,
        },
      },
    );
    return {
      status: result.duplicate ? ('duplicate' as const) : ('imported' as const),
      entryId: mapped.entryId,
    };
  }

  async onApplicationBootstrap() {
    if (process.env.THINGSPEAK_IMPORT_ENABLED !== 'true') return;
    try {
      const target = await this.binding();
      this.logger.log(`Importación ThingSpeak habilitada cada ${target.pollIntervalSeconds}s.`);
      this.schedule(target, 0);
    } catch {
      this.logger.error(
        'Asociación ThingSpeak inválida; importación desactivada. No se muestran secretos.',
      );
    }
  }

  private schedule(target: ThingSpeakBinding, delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.active = this.tick(target);
    }, delay);
    this.timer.unref();
  }

  private async tick(target: ThingSpeakBinding) {
    try {
      const result = await this.runOnce(target);
      this.failures = 0;
      if (result.status === 'imported')
        this.logger.log(`Entrada ThingSpeak ${result.entryId} importada.`);
    } catch {
      this.failures++;
      this.logger.warn(
        'No se pudo importar ThingSpeak. Se conserva la lectura anterior y se reintentará; no se sustituyen datos.',
      );
    } finally {
      this.schedule(
        target,
        Math.min(900, target.pollIntervalSeconds * 2 ** Math.min(this.failures, 4)) * 1000,
      );
    }
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.active;
  }
}
