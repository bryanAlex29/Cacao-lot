import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';
import type { PutMoisturePolicyInput } from '@cacaosmart/contracts';
import { OfflineAlertQueryDto } from '../offline-alert.dto';

export class PutMoisturePolicyDto implements PutMoisturePolicyInput {
  @ApiProperty({ description: 'Margen positivo en puntos porcentuales; mínimo + margen ≤ máximo.' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(Number.MIN_VALUE)
  @Max(100)
  recoveryMarginPct!: number;
  @ApiProperty({ minimum: 0, description: '0 para crear; versión consultada para actualizar.' })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number;
  @ApiProperty({
    minimum: 1,
    description: 'Versión del rango consultado; evita guardar sobre otro rango.',
  })
  @IsInt()
  @Min(1)
  @Max(2147483646)
  expectedThresholdVersion!: number;
}
export class MoistureAlertQueryDto extends OfflineAlertQueryDto {}
