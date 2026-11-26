import { ConflictException, Injectable, NotFoundException, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type AiDiagnosis } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { CreateDiagnosisDto, DiagnosisPageDto } from './diagnosis.dto';
import type { VisionResult } from './vision-analysis.provider';

@Injectable()
export class DiagnosisRepository {
  constructor(private readonly db: PrismaService) {}
  async reserve(
    userId: string,
    input: CreateDiagnosisDto,
    payloadHash: string,
    limit: number | null,
    retentionDays: number,
    provider: 'mock' | 'openai' = 'mock',
  ) {
    return this.db.$transaction(async (tx) => {
      // Serialize per user: concurrent uploads cannot exceed quota or reserve the same key twice.
      const active = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM users WHERE id = ${userId}::uuid AND is_active = true FOR UPDATE`;
      if (!active.length) throw new NotFoundException('Cuenta no disponible');
      if (
        !(await tx.plot.findFirst({
          where: { id: input.plotId, ownerId: userId, archivedAt: null },
        }))
      )
        throw new NotFoundException('Parcela no disponible');
      const previous = await tx.aiDiagnosis.findUnique({
        where: { userId_requestId: { userId, requestId: input.requestId } },
      });
      if (previous) {
        if (
          previous.payloadHash !== payloadHash ||
          previous.deletedAt ||
          previous.expiresAt <= new Date()
        )
          throw new ConflictException(
            'Solicitud ya utilizada. Consulta el historial antes de otra operación.',
          );
        return { record: previous, created: false };
      }
      const now = new Date();
      const day = new Date(now);
      day.setUTCHours(0, 0, 0, 0);
      if (
        limit !== null &&
        (await tx.aiDiagnosis.count({ where: { userId, createdAt: { gte: day } } })) >= limit
      )
        throw new HttpException('Cuota diaria de análisis alcanzada (día UTC)', 429);
      const id = randomUUID();
      const record = await tx.aiDiagnosis.create({
        data: {
          id,
          userId,
          plotId: input.plotId,
          requestId: input.requestId,
          payloadHash,
          provider,
          imageKey: `${id}.jpg`,
          status: 'pending',
          notes: input.notes?.trim() || null,
          consentVersion: input.consentVersion,
          consentAt: now,
          createdAt: now,
          expiresAt: new Date(now.getTime() + retentionDays * 86400000),
        },
      });
      return { record, created: true };
    });
  }
  async owned(id: string, userId: string): Promise<AiDiagnosis> {
    const record = await this.db.aiDiagnosis.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
        expiresAt: { gt: new Date() },
        plot: { ownerId: userId, archivedAt: null },
      },
    });
    if (!record) throw new NotFoundException('Análisis no disponible');
    return record;
  }
  async list(userId: string, page: DiagnosisPageDto) {
    const where: Prisma.AiDiagnosisWhereInput = {
      userId,
      plotId: page.plotId,
      deletedAt: null,
      expiresAt: { gt: new Date() },
      plot: { ownerId: userId, archivedAt: null },
      ...(page.status ? { status: page.status } : {}),
      ...(page.from && page.to
        ? { createdAt: { gte: new Date(page.from), lte: new Date(page.to) } }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.aiDiagnosis.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: page.limit,
          skip: page.offset,
        }),
        this.db.aiDiagnosis.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total, limit: page.limit, offset: page.offset };
  }
  finish(id: string, result: VisionResult) {
    return this.db.aiDiagnosis.updateMany({
      where: { id, status: 'pending', deletedAt: null, expiresAt: { gt: new Date() } },
      data: {
        status: 'completed',
        completedAt: new Date(),
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
  }
  fail(id: string) {
    return this.db.aiDiagnosis.updateMany({
      where: { id, status: 'pending', deletedAt: null },
      data: { status: 'failed', completedAt: new Date(), errorCode: 'ANALYSIS_FAILED' },
    });
  }
  markDeleted(id: string) {
    return this.db.aiDiagnosis.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        result: Prisma.DbNull,
        notes: null,
      },
    });
  }
  cleanupCandidates() {
    return this.db.aiDiagnosis.findMany({
      where: {
        OR: [
          { expiresAt: { lte: new Date() } },
          { deletedAt: { not: null }, imageKey: { not: null } },
        ],
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
  }
  clearImage(id: string) {
    return this.db.aiDiagnosis.updateMany({ where: { id }, data: { imageKey: null } });
  }
  purge(id: string) {
    return this.db.aiDiagnosis.deleteMany({ where: { id, expiresAt: { lte: new Date() } } });
  }
  interruptStale() {
    return this.db.aiDiagnosis.updateMany({
      where: { status: 'pending', createdAt: { lt: new Date(Date.now() - 300000) } },
      data: { status: 'failed', completedAt: new Date(), errorCode: 'ANALYSIS_INTERRUPTED' },
    });
  }
}
