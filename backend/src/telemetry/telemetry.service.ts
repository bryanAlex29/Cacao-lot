import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthenticatedDevice } from '../devices/device-auth.service';
import { connectionStatus } from '../devices/connection-status';
import { SourcePolicy } from '../integrations/source-policy.service';
import { HistoryQueryDto, SnapshotQueryDto } from './telemetry.dto';
import { TelemetryRepository } from './telemetry.repository';
import type { IotTelemetryPayload } from '@cacaosmart/contracts';
import { RealtimeService } from '../realtime/realtime.service';
import { requireTelemetryTimestamp } from './ingestion-timestamp';
import { ExternalObservation, requireExternalObservation } from './external-observation';

@Injectable()
export class TelemetryService {
  constructor(
    private readonly repository: TelemetryRepository,
    private readonly sources: SourcePolicy,
    private readonly realtime: RealtimeService,
  ) {}

  async ingest(
    auth: AuthenticatedDevice,
    input: IotTelemetryPayload,
    external?: ExternalObservation,
  ) {
    if (external) {
      if (auth.source !== 'real')
        throw new ForbiddenException('El importador requiere origen REAL');
      requireExternalObservation(external, input.eventId, input.recordedAt);
    } else if (input.eventId.startsWith('thingspeak:')) {
      throw new BadRequestException('Namespace reservado para el importador ThingSpeak');
    }
    if (input.deviceId.toLowerCase() !== auth.id)
      throw new ForbiddenException('Identidad de dispositivo no coincidente');
    this.sources.require(auth.source);
    requireTelemetryTimestamp(input.recordedAt);
    const canonical = {
      schemaVersion: input.schemaVersion,
      deviceId: auth.id,
      eventId: input.eventId,
      recordedAt: input.recordedAt === null ? null : new Date(input.recordedAt).toISOString(),
      soilMoisture: {
        soil_1: input.soilMoisture.soil_1,
        soil_2: input.soilMoisture.soil_2,
        soil_3: input.soilMoisture.soil_3,
      },
      temperatureC: input.temperatureC,
      airHumidityPct: input.airHumidityPct,
      rainDetected: input.rainDetected,
      valve: {
        relayCommandedOpen: input.valve.relayCommandedOpen,
        feedbackOpen: input.valve.feedbackOpen,
      },
    };
    const result = await this.repository.ingest(
      auth,
      canonical,
      createHash('sha256')
        .update(JSON.stringify(external ? { canonical, external } : canonical))
        .digest('hex'),
      external,
    );
    if (!result.duplicate)
      void this.realtime
        .publish(
          { schemaVersion: '1.0', plotId: auth.plotId, reading: result.reading },
          result.irrigationUpdate,
        )
        .catch(() => undefined);
    return { duplicate: result.duplicate, reading: result.reading };
  }

  private async select(plotId: string, ownerId: string, query: SnapshotQueryDto) {
    this.sources.require(query.source);
    const devices = await this.repository.ownedDevices(
      plotId,
      ownerId,
      query.source,
      query.deviceId,
    );
    if (!devices || (query.deviceId && !devices.length))
      throw new NotFoundException('Recurso no encontrado');
    if (devices.length > 1)
      throw new ConflictException('Selecciona deviceId para consultar esta parcela');
    return devices[0] ?? null;
  }

  async snapshot(plotId: string, ownerId: string, query: SnapshotQueryDto) {
    const device = await this.select(plotId, ownerId, query);
    return {
      plotId,
      source: query.source,
      device: device
        ? {
            id: device.id,
            status: connectionStatus(device).toLowerCase(),
            lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
            expectedIntervalSeconds: device.expectedIntervalSeconds,
          }
        : null,
      reading: device ? await this.repository.latest(device.id, ownerId) : null,
    };
  }

  async history(plotId: string, ownerId: string, query: HistoryQueryDto) {
    const device = await this.select(plotId, ownerId, query);
    const { from, to } = this.period(query);
    return device
      ? this.repository.history(device.id, ownerId, from, to, query.limit, query.offset)
      : { items: [], total: 0, limit: query.limit, offset: query.offset };
  }

  async irrigationHistory(plotId: string, ownerId: string, query: HistoryQueryDto) {
    const device = await this.select(plotId, ownerId, query);
    const { from, to } = this.period(query);
    return device
      ? this.repository.irrigationHistory(
          device.id,
          plotId,
          ownerId,
          query.source,
          from,
          to,
          query.limit,
          query.offset,
        )
      : { items: [], total: 0, limit: query.limit, offset: query.offset };
  }

  async exportReadings(
    plotId: string,
    ownerId: string,
    query: Pick<HistoryQueryDto, 'source' | 'deviceId' | 'from' | 'to'>,
  ) {
    const device = await this.select(plotId, ownerId, query);
    const { from, to } = this.period(query);
    const page = device
      ? await this.repository.history(device.id, ownerId, from, to, 10001, 0)
      : { items: [] };
    return this.boundedExport(page.items);
  }

  async exportIrrigation(
    plotId: string,
    ownerId: string,
    query: Pick<HistoryQueryDto, 'source' | 'deviceId' | 'from' | 'to'>,
  ) {
    const device = await this.select(plotId, ownerId, query);
    const { from, to } = this.period(query);
    const page = device
      ? await this.repository.irrigationHistory(
          device.id,
          plotId,
          ownerId,
          query.source,
          from,
          to,
          10001,
          0,
        )
      : { items: [] };
    return this.boundedExport(page.items);
  }

  private boundedExport<T>(items: T[]): T[] {
    if (items.length > 10000)
      throw new PayloadTooLargeException('El reporte supera 10000 registros. Reduce el periodo.');
    return items;
  }

  private period(query: Pick<HistoryQueryDto, 'from' | 'to'>) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 86400000);
    if (
      [query.from, query.to].some((value) => value && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) ||
      from > to ||
      to.getTime() - from.getTime() > 31 * 86400000
    )
      throw new BadRequestException(
        'Rango UTC/con zona horaria requerido, ordenado y máximo 31 días',
      );
    return { from, to };
  }
}
