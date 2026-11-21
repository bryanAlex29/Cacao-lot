import { Injectable } from '@nestjs/common';
import { SourcePolicy } from '../integrations/source-policy.service';
import { OfflineAlertRepository } from './offline-alert.repository';
import { OfflineAlertQueryDto } from './offline-alert.dto';

@Injectable()
export class OfflineAlertService {
  constructor(
    private readonly repository: OfflineAlertRepository,
    private readonly sources: SourcePolicy,
  ) {}
  list(plotId: string, ownerId: string, query: OfflineAlertQueryDto) {
    return this.repository.list(plotId, ownerId, query, (source) => this.sources.require(source));
  }
  acknowledge(plotId: string, alertId: string, ownerId: string) {
    return this.repository.acknowledge(plotId, alertId, ownerId, (source) =>
      this.sources.require(source),
    );
  }
}
