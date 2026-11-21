import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ThresholdController } from './threshold.controller';
import { ThresholdRepository } from './threshold.repository';
import { ThresholdService } from './threshold.service';

@Module({
  imports: [DatabaseModule, IntegrationsModule],
  controllers: [ThresholdController],
  providers: [ThresholdRepository, ThresholdService],
})
export class ThresholdModule {}
