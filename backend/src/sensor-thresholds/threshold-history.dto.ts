import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, Matches } from 'class-validator';
import type {
  SensorThresholdHistoryResponse,
  SensorThresholdInterval,
} from '@cacaosmart/contracts';

export class ThresholdHistoryQueryDto {
  @ApiProperty({ format: 'date-time', description: 'Inicio incluido, ISO 8601 con zona horaria.' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  from!: string;

  @ApiProperty({ format: 'date-time', description: 'Fin excluido. Periodo máximo: 31 días.' })
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  to!: string;
}

class HistoricalThresholdDto {
  @ApiProperty() minValue!: number;
  @ApiProperty() maxValue!: number;
  @ApiProperty({ format: 'date-time' }) effectiveAt!: string;
  @ApiProperty({ minimum: 1 }) version!: number;
}

class ThresholdIntervalDto implements SensorThresholdInterval {
  @ApiProperty({ format: 'date-time' }) from!: string;
  @ApiProperty({ format: 'date-time' }) to!: string;
  @ApiProperty({ type: HistoricalThresholdDto, nullable: true })
  threshold!: HistoricalThresholdDto | null;
}

export class ThresholdHistoryResponseDto implements SensorThresholdHistoryResponse {
  @ApiProperty({ format: 'uuid' }) sensorId!: string;
  @ApiProperty({ format: 'uuid' }) deviceId!: string;
  @ApiProperty({ format: 'uuid' }) plotId!: string;
  @ApiProperty({ enum: ['real', 'demo'] }) source!: 'real' | 'demo';
  @ApiProperty({ enum: ['SOIL_MOISTURE', 'TEMPERATURE', 'AIR_HUMIDITY'] })
  variable!: SensorThresholdHistoryResponse['variable'];
  @ApiProperty({ enum: ['PERCENT', 'CELSIUS'] }) unit!: SensorThresholdHistoryResponse['unit'];
  @ApiProperty({ format: 'date-time' }) from!: string;
  @ApiProperty({ format: 'date-time' }) to!: string;
  @ApiProperty({
    type: [ThresholdIntervalDto],
    description:
      'Cobertura [from,to), null antes de configurar. Máximo 1000 cambios; nunca se trunca silenciosamente.',
  })
  intervals!: ThresholdIntervalDto[];
}
