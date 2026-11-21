import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { MoistureRepository } from './moisture.repository';
import { MoistureDetector } from './moisture.detector';
import {
  MoistureService,
  MoistureAlertController,
  MoisturePolicyController,
} from './moisture.controller';
@Module({
  imports: [DatabaseModule, IntegrationsModule],
  controllers: [MoistureAlertController, MoisturePolicyController],
  providers: [MoistureRepository, MoistureDetector, MoistureService],
})
export class MoistureModule {}
