import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, Matches } from 'class-validator';

export class OfflineExportQueryDto {
  @ApiProperty({ enum: ['real', 'demo'], description: 'Obligatorio; nunca mezcla orígenes' })
  @IsIn(['real', 'demo'])
  source!: 'real' | 'demo';

  @ApiProperty({ format: 'uuid', description: 'Un único dispositivo propio' })
  @IsUUID('4')
  deviceId!: string;

  @ApiProperty({ example: '2026-10-01', description: 'Primer día objetivo UTC, inclusivo' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @ApiProperty({ example: '2026-10-31', description: 'Fin UTC exclusivo; solo días completos' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  toExclusive!: string;

  @ApiProperty({ example: '2026-10-16', description: 'Fin de entrenamiento UTC exclusivo' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  trainUntil!: string;

  @ApiProperty({ example: '2026-10-23', description: 'Fin de validación UTC exclusivo' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validationUntil!: string;
}
