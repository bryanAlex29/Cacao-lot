import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { SourcePolicy } from '../integrations/source-policy.service';
import { PredictionRepository } from './prediction.repository';
import { OfflineExportQueryDto } from './offline-export.dto';
import { dayMs, parsePersistenceInput, type PersistenceInput } from './offline/persistence-input';

export const offlineObservationLimit = 100000;
export const offlineByteLimit = 16 * 1024 * 1024;

@Injectable()
export class OfflineExportService {
  constructor(
    private readonly repository: PredictionRepository,
    private readonly sources: SourcePolicy,
  ) {}

  async export(plotId: string, ownerId: string, query: OfflineExportQueryDto): Promise<Buffer> {
    this.sources.require(query.source);
    // Freeze the receipt cutoff once. Future observations never enter this export.
    const asOf = new Date();
    let input: PersistenceInput;
    try {
      input = parsePersistenceInput({
        schemaVersion: '1.0',
        plotId,
        deviceId: query.deviceId,
        source: query.source,
        asOf: asOf.toISOString(),
        from: query.from,
        toExclusive: query.toExclusive,
        trainUntil: query.trainUntil,
        validationUntil: query.validationUntil,
        sensors: [],
        observations: [],
      });
    } catch {
      throw new BadRequestException(
        'Usa días UTC reales, from < trainUntil < validationUntil < toExclusive, solo días completos y máximo 366 días',
      );
    }
    const data = await this.repository.exportOffline(
      plotId,
      ownerId,
      query.source,
      query.deviceId,
      new Date(Date.parse(`${query.from}T00:00:00.000Z`) - 2 * dayMs),
      new Date(`${query.toExclusive}T00:00:00.000Z`),
      asOf,
      offlineObservationLimit,
    );
    if (data.observations.length > offlineObservationLimit)
      throw new PayloadTooLargeException('Más de 100000 observaciones de sonda; no se trunca');
    const output = parsePersistenceInput({ ...input, ...data });
    const buffer = Buffer.from(JSON.stringify(output), 'utf8');
    if (buffer.length > offlineByteLimit)
      throw new PayloadTooLargeException('El JSON supera 16 MB; no se trunca');
    return buffer;
  }
}
