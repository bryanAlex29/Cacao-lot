import { Type } from 'class-transformer';
import { Equals } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PredictionAvailability, PredictionZoneCoverage } from '@cacaosmart/contracts';
import { SnapshotQueryDto } from '../telemetry/telemetry.dto';

export class PredictionQueryDto extends SnapshotQueryDto {
  @ApiPropertyOptional({
    enum: [1],
    default: 1,
    description: 'Objetivo previsto, no un pronóstico disponible',
  })
  @Type(() => Number)
  @Equals(1)
  horizonDays = 1 as const;
}

export class PredictionAvailabilityDto implements PredictionAvailability {
  @ApiProperty({ enum: ['1.0'] }) schemaVersion!: '1.0';
  @ApiProperty({ format: 'uuid' }) plotId!: string;
  @ApiProperty({ enum: ['real', 'demo'] }) source!: 'real' | 'demo';
  @ApiProperty({ format: 'date-time' }) evaluatedAt!: string;
  @ApiProperty({
    type: 'object',
    properties: {
      from: { type: 'string', format: 'date-time' },
      toExclusive: { type: 'string', format: 'date-time' },
      timezone: { type: 'string', enum: ['UTC'] },
      completeDays: { type: 'integer', enum: [30] },
    },
  })
  window!: PredictionAvailability['window'];
  @ApiProperty({
    type: 'object',
    properties: {
      variable: { type: 'string', enum: ['soil_moisture'] },
      unit: { type: 'string', enum: ['%'] },
      horizonDays: { type: 'integer', enum: [1] },
    },
  })
  target!: PredictionAvailability['target'];
  @ApiProperty({ enum: ['unavailable'] }) status!: 'unavailable';
  @ApiProperty({ enum: ['model_not_implemented'] }) reason!: 'model_not_implemented';
  @ApiProperty({
    type: 'object',
    nullable: true,
    description: 'Siempre null: no hay modelo implementado ni evaluado',
    properties: {},
  })
  model!: null;
  @ApiProperty({ type: 'array', items: { type: 'object' }, maxItems: 0 }) predictions!: [];
  @ApiProperty({
    type: 'object',
    nullable: true,
    description: 'Siempre null: no se calcula déficit, litros o fecha de riego',
    properties: {},
  })
  waterDemand!: null;
  @ApiProperty({
    type: 'object',
    nullable: true,
    properties: {
      id: { type: 'string', format: 'uuid' },
      serial: { type: 'string' },
      isActive: { type: 'boolean' },
    },
  })
  device!: PredictionAvailability['device'];
  @ApiProperty({
    type: 'array',
    minItems: 3,
    maxItems: 3,
    items: {
      type: 'object',
      properties: {
        code: { type: 'string', enum: ['soil_1', 'soil_2', 'soil_3'] },
        sensorId: { type: 'string', nullable: true },
        enabled: { type: 'boolean' },
        samples: { type: 'integer', minimum: 0 },
        validSamples: { type: 'integer', minimum: 0 },
        validDaysUtc: { type: 'integer', minimum: 0, maximum: 30 },
        firstValidAt: { type: 'string', format: 'date-time', nullable: true },
        lastValidAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  zones!: PredictionZoneCoverage[];
}
