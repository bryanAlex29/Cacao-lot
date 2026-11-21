import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, Max, Min } from 'class-validator';
import type {
  PutSensorThresholdInput,
  SensorThresholdRange,
  SensorThresholdResponse,
  ThresholdUnit,
  ThresholdVariable,
} from '@cacaosmart/contracts';

export class PutSensorThresholdDto implements PutSensorThresholdInput {
  @ApiProperty({ enum: ['SOIL_MOISTURE', 'TEMPERATURE', 'AIR_HUMIDITY'] })
  @IsIn(['SOIL_MOISTURE', 'TEMPERATURE', 'AIR_HUMIDITY'])
  variable!: ThresholdVariable;

  @ApiProperty({ enum: ['PERCENT', 'CELSIUS'] })
  @IsIn(['PERCENT', 'CELSIUS'])
  unit!: ThresholdUnit;

  @ApiProperty({ description: 'Mínimo agronómico; debe ser menor que maxValue.' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  minValue!: number;

  @ApiProperty({ description: 'Máximo agronómico; límites técnicos según variable.' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  maxValue!: number;

  @ApiProperty({
    minimum: 0,
    maximum: 2147483646,
    description: '0 para crear; versión actual para actualizar.',
  })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number;
}

export class SensorThresholdRangeDto implements SensorThresholdRange {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  minValue!: number;
  @ApiProperty()
  maxValue!: number;
  @ApiProperty({ enum: [0], description: 'Reservado; no hay motor de histéresis en esta fase.' })
  hysteresis!: number;
  @ApiProperty({ format: 'date-time' })
  effectiveAt!: string;
  @ApiProperty({ format: 'uuid' })
  updatedBy!: string;
  @ApiProperty({ minimum: 1 })
  version!: number;
}

export class SensorThresholdResponseDto implements SensorThresholdResponse {
  @ApiProperty({ format: 'uuid' })
  sensorId!: string;
  @ApiProperty({ format: 'uuid' })
  deviceId!: string;
  @ApiProperty({ format: 'uuid' })
  plotId!: string;
  @ApiProperty({ enum: ['real', 'demo'] })
  source!: 'real' | 'demo';
  @ApiProperty({ enum: ['SOIL_MOISTURE', 'TEMPERATURE', 'AIR_HUMIDITY'] })
  variable!: ThresholdVariable;
  @ApiProperty({ enum: ['PERCENT', 'CELSIUS'] })
  unit!: ThresholdUnit;
  @ApiProperty({ type: SensorThresholdRangeDto, nullable: true })
  threshold!: SensorThresholdRangeDto | null;
}
