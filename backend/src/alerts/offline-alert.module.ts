import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { OfflineAlertController } from './offline-alert.controller';
import { OfflineAlertDetector } from './offline-alert.detector';
import { OfflineAlertRepository } from './offline-alert.repository';
import { OfflineAlertService } from './offline-alert.service';

@Module({
  imports: [DatabaseModule, IntegrationsModule],
  controllers: [OfflineAlertController],
  providers: [OfflineAlertRepository, OfflineAlertDetector, OfflineAlertService],
})
export class OfflineAlertModule {}
