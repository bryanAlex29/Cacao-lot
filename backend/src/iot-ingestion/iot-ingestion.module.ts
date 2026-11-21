import { Module } from '@nestjs/common';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { IotIngestionController } from './iot-ingestion.controller';

@Module({ imports: [TelemetryModule], controllers: [IotIngestionController] })
export class IotIngestionModule {}
