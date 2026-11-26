import { Injectable } from '@nestjs/common';
import type { TelemetryReading } from '@cacaosmart/contracts';
import { TelemetryService } from '../telemetry/telemetry.service';
import { csvDocument } from './csv';
import { ReportQueryDto } from './reports.dto';

const qualityKeys = [
  'soil_1',
  'soil_2',
  'soil_3',
  'temperatureC',
  'airHumidityPct',
  'rainDetected',
  'relayCommandedOpen',
  'feedbackOpen',
] as const;

@Injectable()
export class ReportsService {
  constructor(private readonly telemetry: TelemetryService) {}

  async readings(plotId: string, ownerId: string, query: ReportQueryDto) {
    const items = await this.telemetry.exportReadings(plotId, ownerId, query);
    return csvDocument(
      [
        'plot_id',
        'device_id',
        'source',
        'event_id',
        'effective_at_utc',
        'recorded_at_utc',
        'received_at_utc',
        'timestamp_origin',
        'soil_1_pct',
        'soil_2_pct',
        'soil_3_pct',
        'temperature_c',
        'air_humidity_pct',
        'rain_detected',
        'relay_commanded_open',
        'feedback_open',
        ...qualityKeys.map((key) => `quality_${key}`),
      ],
      items.map((item: TelemetryReading) => [
        plotId,
        item.deviceId,
        item.source,
        item.eventId,
        item.providerObservedAt ?? item.recordedAt ?? item.receivedAt,
        item.recordedAt,
        item.receivedAt,
        item.timestampOrigin,
        item.soilMoisture.soil_1,
        item.soilMoisture.soil_2,
        item.soilMoisture.soil_3,
        item.temperatureC,
        item.airHumidityPct,
        item.rainDetected,
        item.valve.relayCommandedOpen,
        item.valve.feedbackOpen,
        ...qualityKeys.map((key) => item.quality[key]),
      ]),
    );
  }

  async irrigation(plotId: string, ownerId: string, query: ReportQueryDto) {
    const items = await this.telemetry.exportIrrigation(plotId, ownerId, query);
    return csvDocument(
      [
        'plot_id',
        'device_id',
        'source',
        'reading_id',
        'event_id',
        'observed_at_utc',
        'received_at_utc',
        'timestamp_origin',
        'observation_kind',
        'relay_commanded_open',
        'feedback_open',
        'previous_observation_available',
        'previous_relay_commanded_open',
        'previous_feedback_open',
      ],
      items.map((item) => [
        plotId,
        item.deviceId,
        item.source,
        item.id,
        item.eventId,
        item.observedAt,
        item.receivedAt,
        item.timestampOrigin,
        item.kind,
        item.valve.relayCommandedOpen,
        item.valve.feedbackOpen,
        item.previousValve !== null,
        item.previousValve?.relayCommandedOpen ?? null,
        item.previousValve?.feedbackOpen ?? null,
      ]),
    );
  }
}
