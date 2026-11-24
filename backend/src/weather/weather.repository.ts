import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { WeatherProfileDto } from './weather.dto';
import type { WeatherData } from './open-meteo.provider';

@Injectable()
export class WeatherRepository {
  constructor(private readonly db: PrismaService) {}
  private async lock(tx: Prisma.TransactionClient, plotId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`weather:${plotId}`}, 0))`;
  }
  private async requireOwned(tx: Prisma.TransactionClient, plotId: string, ownerId: string, admin = false) {
    const plot = await tx.plot.findFirst({ where: { id: plotId, ownerId, archivedAt: null,
      owner: { isActive: true, ...(admin ? { role: 'ADMIN' as const } : {}) } }, select: { id: true } });
    if (!plot) throw new NotFoundException('Parcela no encontrada');
  }
  snapshot(plotId: string, ownerId: string) {
    return this.db.$transaction(async (tx) => {
      await this.requireOwned(tx, plotId, ownerId);
      const profile = await tx.weatherProfile.findUnique({ where: { plotId } });
      const batch = profile ? await tx.weatherBatch.findFirst({
        where: { plotId, profileVersion: profile.version }, orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, provenance: true, fetchedAt: true, fromDate: true, toDate: true },
      }) : null;
      const items = batch ? await tx.weatherObservation.findMany({ where: { batchId: batch.id },
        orderBy: [{ date: 'desc' }, { variable: 'asc' }], take: 28,
        select: { date: true, variable: true, value: true, quality: true, unit: true } }) : [];
      return { profile: profile ? {
        latitude: profile.latitude, longitude: profile.longitude, timezone: profile.timezone,
        enabled: profile.enabled, version: profile.version, updatedAt: profile.updatedAt,
        consentAt: profile.consentAt, syncedAt: profile.syncedAt, lastError: profile.lastError,
        nextAttemptAt: profile.attemptAt ? new Date(profile.attemptAt.getTime() + 15 * 60000) : null,
      } : null, items, provenance: batch ? { ...batch.provenance as object,
        fetchedAt: batch.fetchedAt, from: batch.fromDate, to: batch.toDate } : null };
    }, { isolationLevel: 'RepeatableRead' });
  }
  save(plotId: string, ownerId: string, input: WeatherProfileDto) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, plotId);
      await this.requireOwned(tx, plotId, ownerId, true);
      const before = await tx.weatherProfile.findUnique({ where: { plotId } });
      if ((before?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException('La ubicación cambió; actualiza y revisa antes de guardar.');
      const version = input.expectedVersion + 1, now = new Date();
      const data = { latitude: input.latitude, longitude: input.longitude, timezone: input.timezone,
        enabled: input.enabled, version, updatedBy: ownerId, updatedAt: now,
        consentAt: input.enabled ? now : null, attemptAt: null, syncedAt: null, lastError: null };
      await tx.weatherProfile.upsert({ where: { plotId }, create: { plotId, ...data }, update: data });
      await tx.weatherProfileRevision.create({ data: { plotId, version, actorId: ownerId,
        snapshot: { latitude: input.latitude, longitude: input.longitude, timezone: input.timezone,
          enabled: input.enabled, consentVersion: 'open-meteo-coordinates-v1', updatedAt: now.toISOString() } } });
    });
  }
  claim(plotId: string, ownerId: string, now: Date) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, plotId);
      await this.requireOwned(tx, plotId, ownerId);
      const profile = await tx.weatherProfile.findUnique({ where: { plotId } });
      if (!profile?.enabled || !profile.consentAt) return { kind: 'not-enabled' as const };
      if (profile.attemptAt && now.getTime() - profile.attemptAt.getTime() < 15 * 60000)
        return { kind: 'cooldown' as const };
      await tx.weatherProfile.update({ where: { plotId }, data: { attemptAt: now, lastError: null } });
      return { kind: 'claimed' as const, profile };
    });
  }
  async finish(plotId: string, ownerId: string, version: number, attempt: Date, from: string, to: string, result: WeatherData) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, plotId);
      await this.requireOwned(tx, plotId, ownerId);
      const current = await tx.weatherProfile.findFirst({ where: { plotId, version, enabled: true, attemptAt: attempt } });
      if (!current) throw new ConflictException('La configuración cambió; no se guardó la respuesta anterior.');
      const fetchedAt = new Date();
      const batch = await tx.weatherBatch.create({ data: { plotId, profileVersion: version,
        fromDate: from, toDate: to, fetchedAt, raw: result.raw as Prisma.InputJsonObject,
        provenance: result.provenance } });
      for (const item of result.items) {
        const identity = { plotId, profileVersion: version, date: item.date, variable: item.variable };
        await tx.weatherObservation.upsert({ where: { plotId_profileVersion_date_variable: identity },
          create: { ...identity, ...item, batchId: batch.id },
          update: { value: item.value, quality: item.quality, unit: item.unit, batchId: batch.id } });
      }
      await tx.weatherProfile.update({ where: { plotId }, data: { syncedAt: fetchedAt, lastError: null } });
    }, { timeout: 10000 });
  }
  async fail(plotId: string, version: number, attempt: Date) {
    await this.db.weatherProfile.updateMany({ where: { plotId, version, attemptAt: attempt },
      data: { lastError: 'provider_unavailable' } });
  }
  candidates(after?: string) {
    return this.db.weatherProfile.findMany({ where: { enabled: true, consentAt: { not: null },
      plot: { archivedAt: null, owner: { isActive: true } }, ...(after ? { plotId: { gt: after } } : {}) },
      orderBy: { plotId: 'asc' }, take: 50, select: { plotId: true, syncedAt: true, plot: { select: { ownerId: true } } } });
  }
}
