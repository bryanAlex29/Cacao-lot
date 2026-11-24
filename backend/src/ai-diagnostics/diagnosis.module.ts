import { Module } from '@nestjs/common';
import { PlotsModule } from '../plots/plots.module';
import { DatabaseModule } from '../database/database.module';
import { DiagnosisController } from './diagnosis.controller';
import { DiagnosisService } from './diagnosis.service';
import { DiagnosisRepository } from './diagnosis.repository';
import { PrivateImageStore } from './private-image.store';
import { MockVisionAnalysisProvider, VisionAnalysisProvider } from './vision-analysis.provider';

@Module({
  imports: [DatabaseModule, PlotsModule],
  controllers: [DiagnosisController],
  providers: [
    DiagnosisService,
    DiagnosisRepository,
    PrivateImageStore,
    { provide: VisionAnalysisProvider, useClass: MockVisionAnalysisProvider },
  ],
})
export class DiagnosisModule {}
