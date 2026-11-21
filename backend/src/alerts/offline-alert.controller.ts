import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OfflineAlertService } from './offline-alert.service';
import { OfflineAlertDto, OfflineAlertPageDto, OfflineAlertQueryDto } from './offline-alert.dto';

@ApiTags('alerts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Sesión requerida, inválida o caducada.' })
@ApiForbiddenResponse({ description: 'Canal DEMO no habilitado.' })
@ApiNotFoundResponse({ description: 'Parcela, dispositivo o alerta no accesibles al propietario.' })
@ApiBadRequestResponse({ description: 'UUID, paginación, origen o cuerpo inválidos.' })
@Controller('plots/:plotId/alerts')
export class OfflineAlertController {
  constructor(private readonly alerts: OfflineAlertService) {}

  @Get()
  @ApiOkResponse({ type: OfflineAlertPageDto })
  @ApiOperation({
    summary: 'Alertas persistidas de desconexión del dispositivo seleccionado; solo propietario.',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('plotId', new ParseUUIDPipe({ version: '4' })) plotId: string,
    @Query() query: OfflineAlertQueryDto,
  ) {
    return this.alerts.list(plotId, user.id, query);
  }

  @Post(':alertId/acknowledge')
  @HttpCode(200)
  @ApiOkResponse({ type: OfflineAlertDto })
  @ApiOperation({
    summary: 'Reconocimiento idempotente por ADMIN o FARMER propietario. No cierra la condición.',
  })
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('plotId', new ParseUUIDPipe({ version: '4' })) plotId: string,
    @Param('alertId', new ParseUUIDPipe({ version: '4' })) alertId: string,
    @Body() body: unknown,
  ) {
    if (
      body !== undefined &&
      (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
    )
      throw new BadRequestException(
        'El reconocimiento no admite campos; actor y fecha se asignan en servidor',
      );
    return this.alerts.acknowledge(plotId, alertId, user.id);
  }
}
