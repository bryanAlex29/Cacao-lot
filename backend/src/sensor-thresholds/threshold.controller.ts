import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PutSensorThresholdDto, SensorThresholdResponseDto } from './threshold.dto';
import { ThresholdService } from './threshold.service';
import { ThresholdHistoryQueryDto, ThresholdHistoryResponseDto } from './threshold-history.dto';

@ApiTags('sensor-thresholds')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sesión requerida, inválida o caducada.' })
@ApiForbiddenResponse({ description: 'Rol insuficiente o canal DEMO no habilitado.' })
@ApiNotFoundResponse({ description: 'Sensor no encontrado o no accesible al propietario.' })
@ApiBadRequestResponse({
  description: 'UUID, variable, unidad o rango inválido; no se admite lluvia booleana.',
})
@Controller('sensors/:sensorId/thresholds')
export class ThresholdController {
  constructor(private readonly thresholds: ThresholdService) {}

  @Get('history')
  @ApiOkResponse({
    type: ThresholdHistoryResponseDto,
    description:
      'Rangos por vigencia; no reclasifica lecturas ni aplica el rango actual al pasado.',
  })
  @ApiConflictResponse({
    description:
      'Auditoría incompleta/inconsistente o más de 1000 cambios; no se dibujan límites parciales.',
  })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sensorId', new ParseUUIDPipe({ version: '4' })) sensorId: string,
    @Query() query: ThresholdHistoryQueryDto,
  ) {
    return this.thresholds.history(sensorId, user.id, query);
  }

  @Get()
  @ApiOkResponse({
    type: SensorThresholdResponseDto,
    description: 'threshold=null si no hay rango configurado.',
  })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sensorId', new ParseUUIDPipe({ version: '4' })) sensorId: string,
  ) {
    return this.thresholds.get(sensorId, user.id);
  }

  @Put()
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: SensorThresholdResponseDto })
  @ApiConflictResponse({ description: 'Versión desactualizada; volver a consultar el rango.' })
  put(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sensorId', new ParseUUIDPipe({ version: '4' })) sensorId: string,
    @Body() input: PutSensorThresholdDto,
  ) {
    return this.thresholds.put(sensorId, user.id, input);
  }
}
