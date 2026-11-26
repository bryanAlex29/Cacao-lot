import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { IntegrationsModule } from './integrations.module';
import { ThingSpeakImportService } from './thingspeak-import.service';

@Module({
  imports: [DatabaseModule, TelemetryModule, IntegrationsModule],
  providers: [ThingSpeakImportService],
  exports: [ThingSpeakImportService],
})
export class ThingSpeakImportModule {}
