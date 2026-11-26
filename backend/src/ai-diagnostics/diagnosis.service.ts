import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { AiDiagnosis } from '@prisma/client';
import type { Environment } from '../config/environment';
import { PlotsService } from '../plots/plots.service';
import { CreateDiagnosisDto, DiagnosisPageDto } from './diagnosis.dto';
import { DiagnosisRepository } from './diagnosis.repository';
import { PrivateImageStore } from './private-image.store';
import { validateVisionResult, VisionAnalysisProvider } from './vision-analysis.provider';

@Injectable()
export class DiagnosisService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private cleaning = false;
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly plots: PlotsService,
    private readonly repository: DiagnosisRepository,
    private readonly images: PrivateImageStore,
    private readonly provider: VisionAnalysisProvider,
  ) {}
  onModuleInit(): void {
    // Bounded housekeeping; DB unavailability must not block telemetry or startup.
    void this.cleanup().catch(() => undefined);
    this.timer = setInterval(() => {
      void this.cleanup().catch(() => undefined);
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
  options(userId?: string) {
    return {
      provider: this.config.get('AI_PROVIDER', { infer: true }),
      maxImageBytes: this.config.get('AI_MAX_IMAGE_MB', { infer: true }) * 1024 * 1024,
      dailyLimit:
        userId && userId === this.config.get('AI_UNLIMITED_USER_ID', { infer: true })
          ? null
          : this.config.get('AI_DAILY_LIMIT_PER_USER', { infer: true }),
      retentionDays: this.config.get('IMAGE_RETENTION_DAYS', { infer: true }),
      consentVersion:
        this.config.get('AI_PROVIDER', { infer: true }) === 'openai' ? 'openai-v1' : 'demo-v1',
    };
  }
  private requireEnabled(): void {
    if (this.options().provider === 'disabled')
      throw new ServiceUnavailableException('Diagnóstico no habilitado');
  }
  async create(userId: string, input: CreateDiagnosisDto, file?: { buffer: Buffer }) {
    this.requireEnabled();
    const provider = this.options().provider;
    if (input.consentVersion !== this.options().consentVersion)
      throw new BadRequestException('Revisa y acepta el consentimiento del proveedor actual');
    await this.plots.requireOwned(input.plotId, userId);
    if (!file?.buffer) throw new BadRequestException('Selecciona una imagen');
    const sanitized = await this.images.sanitize(file.buffer);
    const hash = createHash('sha256')
      .update(file.buffer)
      .update(
        JSON.stringify([
          input.plotId,
          input.notes?.trim() || null,
          input.consentVersion,
          input.retentionDays,
        ]),
      )
      .digest('hex');
    const reservation = await this.repository.reserve(
      userId,
      input,
      hash,
      this.options(userId).dailyLimit,
      Math.min(input.retentionDays, this.options().retentionDays),
      provider as 'mock' | 'openai',
    );
    if (!reservation.created) return this.public(reservation.record);
    const record = reservation.record;
    let deadline: NodeJS.Timeout | undefined;
    const controller = new AbortController();
    try {
      await this.images.put(record.imageKey!, sanitized);
      const output: unknown = await Promise.race([
        this.provider.analyze(sanitized, input.notes?.trim(), controller.signal),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(
            () => {
              controller.abort();
              reject(new Error('Analysis timeout'));
            },
            this.config.get('AI_REQUEST_TIMEOUT_MS', { infer: true }),
          );
        }),
      ]);
      const result = validateVisionResult(output);
      await this.repository.finish(record.id, result);
    } catch {
      await this.repository.fail(record.id);
      // A failed upload/process does not retain the photograph unnecessarily.
      await this.images
        .remove(record.imageKey!)
        .then(() => this.repository.clearImage(record.id))
        .catch(() => undefined);
    } finally {
      if (deadline) clearTimeout(deadline);
    }
    return this.public(await this.repository.owned(record.id, userId));
  }
  async list(userId: string, page: DiagnosisPageDto) {
    this.requireEnabled();
    await this.plots.requireOwned(page.plotId, userId);
    if (page.from !== undefined || page.to !== undefined) {
      const from = Date.parse(page.from ?? ''),
        to = Date.parse(page.to ?? '');
      if (
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        from > to ||
        to - from > 31 * 86400000
      ) {
        throw new BadRequestException(
          'Indica Desde y Hasta válidos, ordenados y separados por no más de 31 días.',
        );
      }
    }
    const result = await this.repository.list(userId, page);
    return { ...result, items: result.items.map((item) => this.public(item)) };
  }
  async get(id: string, userId: string) {
    this.requireEnabled();
    return this.public(await this.repository.owned(id, userId));
  }
  async image(id: string, userId: string) {
    this.requireEnabled();
    const record = await this.repository.owned(id, userId);
    if (!record.imageKey) throw new NotFoundException('Imagen no disponible');
    try {
      return await this.images.read(record.imageKey);
    } catch {
      throw new NotFoundException('Imagen no disponible');
    }
  }
  async remove(id: string, userId: string): Promise<void> {
    this.requireEnabled();
    const record = await this.repository.owned(id, userId);
    if (record.status === 'pending')
      throw new ConflictException('Análisis pendiente: espera a que termine antes de eliminarlo.');
    await this.repository.markDeleted(id);
    if (record.imageKey) {
      await this.images
        .remove(record.imageKey)
        .then(() => this.repository.clearImage(id))
        .catch(() => undefined);
    }
  }
  async cleanup(): Promise<void> {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      await this.repository.interruptStale();
      for (const record of await this.repository.cleanupCandidates()) {
        try {
          if (record.imageKey) await this.images.remove(record.imageKey);
          await this.repository.clearImage(record.id);
          await this.repository.purge(record.id);
        } catch {
          /* Retry next sweep; no private paths or image contents in logs. */
        }
      }
    } finally {
      this.cleaning = false;
    }
  }
  private public(record: AiDiagnosis) {
    return {
      id: record.id,
      plotId: record.plotId,
      requestId: record.requestId,
      status: record.status,
      source: record.provider === 'openai' ? ('real' as const) : ('demo' as const),
      provider: record.provider,
      notes: record.notes,
      result: record.result,
      errorCode: record.errorCode,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      expiresAt: record.expiresAt,
      hasImage: !!record.imageKey,
    };
  }
}
