import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNumber, Max, Min } from 'class-validator';

export class WeatherProfileDto {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber({ maxDecimalPlaces: 5 }) @Min(-90) @Max(90)
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber({ maxDecimalPlaces: 5 }) @Min(-180) @Max(180)
  longitude!: number;

  @ApiProperty({ enum: ['America/Guayaquil', 'Pacific/Galapagos'] })
  @IsIn(['America/Guayaquil', 'Pacific/Galapagos'])
  timezone!: string;

  @ApiProperty({ description: 'Autoriza enviar coordenadas a Open-Meteo para consultas y sincronización periódica. false revoca futuras consultas.' })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ minimum: 0, description: 'Versión leída; cero para crear, evita sobrescribir cambios concurrentes.' })
  @IsInt() @Min(0) @Max(2147483646)
  expectedVersion!: number;
}

export class WeatherSnapshotDto {
  @ApiProperty({ enum: ['disabled', 'open-meteo'] }) provider!: string;
  @ApiPropertyOptional({ nullable: true, type: Object }) profile!: object | null;
  @ApiProperty({ type: [Object], description: 'Hasta 28 agregados diarios modelados: 7 días, cuatro variables. null indica día incompleto.' })
  items!: object[];
  @ApiPropertyOptional({ nullable: true, type: Object }) provenance!: object | null;
}
