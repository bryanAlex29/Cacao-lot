import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { HistoryQueryDto } from '../telemetry/telemetry.dto';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ObservedIrrigationPageDto } from './irrigation.dto';

@ApiTags('Riego observado')
@ApiBearerAuth()
@Controller('plots/:id/irrigation-events')
export class IrrigationController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get()
  @ApiOkResponse({ type: ObservedIrrigationPageDto })
  @ApiOperation({
    summary: 'Cambios entre observaciones persistidas; no acredita sesiones, duración ni caudal',
    description:
      'Incluye primera observación y cambios de valores, también hacia/desde null. Orden temporal descendente, máximo 31 días. Los mensajes tardíos pueden modificar las comparaciones históricas. Mismos permisos y selección de origen/dispositivo que telemetría.',
  })
  list(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: HistoryQueryDto,
  ) {
    return this.telemetry.irrigationHistory(id, user.id, query);
  }
}
