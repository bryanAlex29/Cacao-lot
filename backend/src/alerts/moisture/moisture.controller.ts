import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../auth/auth.decorators';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { SourcePolicy } from '../../integrations/source-policy.service';
import { MoistureRepository } from './moisture.repository';
import { MoistureAlertQueryDto, PutMoisturePolicyDto } from './moisture.dto';

@Injectable()
export class MoistureService {
  constructor(
    private readonly repository: MoistureRepository,
    private readonly sources: SourcePolicy,
  ) {}
  get(id: string, owner: string) {
    return this.repository.get(id, owner, (source) => this.sources.require(source));
  }
  put(id: string, owner: string, input: PutMoisturePolicyDto) {
    return this.repository.put(id, owner, input, (source) => this.sources.require(source));
  }
  list(plot: string, owner: string, query: MoistureAlertQueryDto) {
    return this.repository.list(plot, owner, query, (source) => this.sources.require(source));
  }
  acknowledge(plot: string, id: string, owner: string) {
    return this.repository.acknowledge(plot, id, owner, (source) => this.sources.require(source));
  }
}
@ApiTags('moisture-alerts')
@ApiBearerAuth()
@Controller('sensors/:sensorId/moisture-alert-policy')
export class MoisturePolicyController {
  constructor(private readonly service: MoistureService) {}
  @Get()
  @ApiOperation({
    summary:
      'Política de baja humedad por sonda: ausencia explícita, estado y rango actual; solo propietario.',
  })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sensorId', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.get(id, user.id);
  }
  @Put()
  @Roles('ADMIN')
  @ApiBody({ type: PutMoisturePolicyDto })
  @ApiConflictResponse({
    description:
      'Cambió el rango o la política. Consultar versiones; nunca sobrescribir silenciosamente.',
  })
  @ApiOperation({
    summary:
      'Configurar margen positivo sin defaults; no modifica rangos ni calibración o firmware.',
  })
  put(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sensorId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: PutMoisturePolicyDto,
  ) {
    return this.service.put(id, user.id, input);
  }
}
@ApiTags('moisture-alerts')
@ApiBearerAuth()
@Controller('plots/:plotId/moisture-alerts')
export class MoistureAlertController {
  constructor(private readonly service: MoistureService) {}
  @Get()
  @ApiOkResponse({
    description:
      'Página por dispositivo/origen; solo ADMIN o FARMER propietario. GET no evalúa ni crea alertas.',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('plotId', new ParseUUIDPipe({ version: '4' })) plot: string,
    @Query() query: MoistureAlertQueryDto,
  ) {
    return this.service.list(plot, user.id, query);
  }
  @Post(':alertId/acknowledge')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reconocimiento idempotente; no implica recuperación de humedad.' })
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('plotId', new ParseUUIDPipe({ version: '4' })) plot: string,
    @Param('alertId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    if (
      body !== undefined &&
      (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
    )
      throw new BadRequestException('No se admiten campos de reconocimiento del cliente');
    return this.service.acknowledge(plot, id, user.id);
  }
}
