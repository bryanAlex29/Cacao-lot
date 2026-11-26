import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment';
import { OpenAiVisionAnalysisProvider } from './openai-vision.provider';
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
    {
      provide: VisionAnalysisProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) =>
        config.get('AI_PROVIDER', { infer: true }) === 'openai'
          ? new OpenAiVisionAnalysisProvider(config)
          : new MockVisionAnalysisProvider(),
    },
  ],
})
export class DiagnosisModule {}
