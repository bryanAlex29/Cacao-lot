import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PredictionController } from './prediction.controller';
import { PredictionRepository } from './prediction.repository';
import { PredictionService } from './prediction.service';
import { OfflineExportService } from './offline-export.service';
import { ExperimentalForecastRepository } from './experimental-forecast.repository';
import { ExperimentalForecastService } from './experimental-forecast.service';
import { RegressionForecastService } from './regression-forecast.service';

@Module({
  imports: [DatabaseModule, IntegrationsModule],
  controllers: [PredictionController],
  providers: [
    PredictionRepository,
    PredictionService,
    OfflineExportService,
    ExperimentalForecastRepository,
    ExperimentalForecastService,
    RegressionForecastService,
  ],
})
export class PredictionModule {}
