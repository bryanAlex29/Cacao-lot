import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WeatherProfileDto, WeatherSnapshotDto } from './weather.dto';
import { WeatherService } from './weather.service';

@ApiTags('weather')
@ApiBearerAuth()
@Controller('plots/:id/weather')
export class WeatherController {
  constructor(private readonly service: WeatherService) {}
  @Get()
  @ApiOperation({ summary: 'Última semana histórica almacenada; solo lectura, no llama a Open-Meteo' })
  @ApiOkResponse({ type: WeatherSnapshotDto })
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.get(id, user.id);
  }
  @Put('profile')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ubicación WGS84 y autorización explícita; versionada y auditada, sin llamada externa' })
  @ApiOkResponse({ type: WeatherSnapshotDto })
  save(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() user: AuthenticatedUser,
    @Body() input: WeatherProfileDto) { return this.service.save(id, user.id, input); }
  @Post('sync')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sincroniza 7 días ERA5 con margen de disponibilidad; requiere proveedor habilitado y consentimiento. Cooldown persistente 15 min.' })
  @ApiOkResponse({ type: WeatherSnapshotDto })
  sync(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.sync(id, user.id);
  }
}
