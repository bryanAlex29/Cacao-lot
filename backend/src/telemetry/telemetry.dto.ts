import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsISO8601,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageDto } from '../common/page.dto';

export class SoilMoistureDto {
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 100 })
  @ValidateIf((_o, value: unknown) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  soil_1!: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 100 })
  @ValidateIf((_o, value: unknown) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  soil_2!: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 100 })
  @ValidateIf((_o, value: unknown) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  soil_3!: number | null;
}
export class ValveDto {
  @ApiProperty({ type: Boolean, nullable: true })
  @ValidateIf((_o, value: unknown) => value !== null)
  @IsBoolean()
  relayCommandedOpen!: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true })
  @ValidateIf((_o, value: unknown) => value !== null)
  @IsBoolean()
  feedbackOpen!: boolean | null;
}
export class IngestTelemetryDto {
  @ApiProperty({ enum: ['1.2'] })
  @Equals('1.2')
  schemaVersion!: '1.2';
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @Length(1, 120)
  eventId!: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  deviceId!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  @ValidateIf((_o, value: unknown) => value !== null)
  @IsISO8601({ strict: true, strictSeparator: true })
  recordedAt!: string | null;
  @ApiProperty({ type: SoilMoistureDto })
  @IsObject()
  @ValidateNested()
  @Type(() => SoilMoistureDto)
  soilMoisture!: SoilMoistureDto;
  @ApiProperty({ type: Number, nullable: true, minimum: -50, maximum: 100 })
  @ValidateIf((_o, value: unknown) => value !== null)
  @IsNumber()
  @Min(-50)
  @Max(100)
  temperatureC!: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 100 })
  @ValidateIf((_o, value: unknown) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  airHumidityPct!: number | null;
  @ApiProperty({ type: Boolean, nullable: true })
  @ValidateIf((_o, value: unknown) => value !== null)
  @IsBoolean()
  rainDetected!: boolean | null;
  @ApiProperty({ type: ValveDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ValveDto)
  valve!: ValveDto;
  @ApiPropertyOptional({
    enum: ['real', 'demo'],
    description: 'Informativo; no modifica el canal autenticado.',
  })
  @IsOptional()
  @IsIn(['real', 'demo'])
  source?: 'real' | 'demo';
}
export class SnapshotQueryDto {
  @ApiPropertyOptional({ enum: ['real', 'demo'], default: 'real' })
  @IsIn(['real', 'demo'])
  source: 'real' | 'demo' = 'real';
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  deviceId?: string;
}
export class HistoryQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: ['real', 'demo'], default: 'real' })
  @IsIn(['real', 'demo'])
  source: 'real' | 'demo' = 'real';
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  deviceId?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;
}
