import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { TelemetryRepository } from './telemetry.repository';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { IrrigationController } from '../irrigation/irrigation.controller';

/** Persistencia y consulta canónicas; publicación Socket.IO se incorpora en la fase siguiente. */
@Module({
  imports: [DatabaseModule, IntegrationsModule, RealtimeModule],
  providers: [TelemetryRepository, TelemetryService],
  controllers: [TelemetryController, IrrigationController],
  exports: [TelemetryService],
})
export class TelemetryModule {}
