import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { RealtimeModule } from './realtime/realtime.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './auth/auth.guards';
import { PlotsModule } from './plots/plots.module';
import { DeviceAuthModule } from './devices/device-auth.module';
import { IotIngestionModule } from './iot-ingestion/iot-ingestion.module';
import { ThresholdModule } from './sensor-thresholds/threshold.module';
import { OfflineAlertModule } from './alerts/offline-alert.module';
import { MoistureModule } from './alerts/moisture/moisture.module';
import { ReportsModule } from './reports/reports.module';
import { DiagnosisModule } from './ai-diagnostics/diagnosis.module';
import { WeatherModule } from './weather/weather.module';
import { PredictionModule } from './prediction/prediction.module';
import { ThingSpeakImportModule } from './integrations/thingspeak-import.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, '../../.env'),
      validate: validateEnvironment,
    }),
    HealthModule,
    TelemetryModule,
    RealtimeModule,
    IntegrationsModule,
    AuthModule,
    PlotsModule,
    DeviceAuthModule,
    IotIngestionModule,
    ThresholdModule,
    OfflineAlertModule,
    MoistureModule,
    ReportsModule,
    DiagnosisModule,
    WeatherModule,
    PredictionModule,
    ThingSpeakImportModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 60 }]),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
