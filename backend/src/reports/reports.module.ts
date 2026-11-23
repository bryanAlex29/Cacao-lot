import { Module } from '@nestjs/common';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TelemetryModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
