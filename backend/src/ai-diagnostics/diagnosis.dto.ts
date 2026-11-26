import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PageDto } from '../common/page.dto';

export class CreateDiagnosisDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  plotId!: string;

  @ApiProperty({ format: 'uuid', description: 'Clave idempotente de esta solicitud' })
  @IsUUID('4')
  requestId!: string;

  @ApiProperty({
    enum: ['demo-v1', 'openai-v1'],
    description:
      'Consentimiento explícito al proveedor configurado y retención indicada; openai-v1 autoriza enviar foto y notas a OpenAI',
  })
  @IsIn(['demo-v1', 'openai-v1'])
  consentVersion!: string;

  @ApiProperty({
    minimum: 1,
    maximum: 30,
    description: 'Retención máxima aceptada explícitamente por el usuario, en días',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  retentionDays!: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class DiagnosisPageDto extends PageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  plotId!: string;

  @ApiPropertyOptional({ enum: ['pending', 'completed', 'failed'] })
  @IsOptional()
  @IsIn(['pending', 'completed', 'failed'])
  status?: 'pending' | 'completed' | 'failed';

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Creado desde, incluido; ISO con zona. Enviar junto con to, máximo 31 días.',
  })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Creado hasta, incluido; ISO con zona. Enviar junto con from.',
  })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  to?: string;
}
