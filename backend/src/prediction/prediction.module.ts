import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PredictionController } from './prediction.controller';
import { PredictionRepository } from './prediction.repository';
import { PredictionService } from './prediction.service';

@Module({
  imports: [DatabaseModule, IntegrationsModule],
  controllers: [PredictionController],
  providers: [PredictionRepository, PredictionService],
})
export class PredictionModule {}
