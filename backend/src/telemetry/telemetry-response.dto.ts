import { ApiProperty, OmitType } from '@nestjs/swagger';
import type { TelemetryReading, ConnectionStatus } from '@cacaosmart/contracts';
import { IngestTelemetryDto } from './telemetry.dto';

export class TelemetryReadingDto extends OmitType(IngestTelemetryDto, [
  'schemaVersion',
  'source',
] as const) {
  @ApiProperty({ enum: ['real', 'demo'] })
  source!: 'real' | 'demo';
  @ApiProperty({ format: 'date-time' })
  receivedAt!: string;
  @ApiProperty({ enum: ['device', 'server'] })
  timestampOrigin!: 'device' | 'server';
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['valid', 'missing', 'invalid', 'uncalibrated'] },
    description: 'Una clave por sensor y estado de válvula; calidad, no clasificación agronómica.',
  })
  quality!: TelemetryReading['quality'];
}
export class IngestResultDto {
  @ApiProperty()
  duplicate!: boolean;
  @ApiProperty({ type: TelemetryReadingDto })
  reading!: TelemetryReadingDto;
}
export class TelemetryDeviceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ['online', 'stale', 'offline', 'unknown'] })
  status!: ConnectionStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSeenAt!: string | null;
  @ApiProperty()
  expectedIntervalSeconds!: number;
}
export class TelemetrySnapshotDto {
  @ApiProperty({ format: 'uuid' })
  plotId!: string;
  @ApiProperty({ enum: ['real', 'demo'] })
  source!: 'real' | 'demo';
  @ApiProperty({ type: TelemetryDeviceDto, nullable: true })
  device!: TelemetryDeviceDto | null;
  @ApiProperty({ type: TelemetryReadingDto, nullable: true })
  reading!: TelemetryReadingDto | null;
}
export class ReadingPageDto {
  @ApiProperty({ type: [TelemetryReadingDto] })
  items!: TelemetryReadingDto[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  limit!: number;
  @ApiProperty()
  offset!: number;
}
