import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { WeatherProfileDto, WeatherSnapshotDto } from './weather.dto';
import { WeatherService } from './weather.service';
import { CurrentWeatherService } from './current-weather.service';
import { CurrentWeatherDto } from './current-weather.dto';
import {
  CurrentWeatherQuery,
  WeatherCitySearchDto,
  WeatherCitySearchQuery,
} from './weather-cities.dto';
import { WeatherCitiesService } from './weather-cities.service';

@ApiTags('weather')
@ApiBearerAuth()
@Controller('plots/:id/weather')
export class WeatherController {
  constructor(
    private readonly service: WeatherService,
    private readonly current: CurrentWeatherService,
    private readonly cities: WeatherCitiesService,
  ) {}
  @Get('current')
  @ApiOkResponse({ type: CurrentWeatherDto })
  @ApiOperation({
    summary:
      'Condiciones actuales modeladas Open-Meteo; ubicación autorizada, caché 15 min. No son mediciones ESP32.',
  })
  currentWeather(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CurrentWeatherQuery,
  ) {
    return query.cityId === undefined
      ? this.current.get(id, user.id)
      : this.cities.get(id, user.id, query.cityId);
  }
  @Get('cities')
  @ApiOkResponse({ type: WeatherCitySearchDto })
  @ApiOperation({
    summary:
      'Buscar ciudades públicas por nombre, sin guardar coordenadas ni modificar la parcela.',
  })
  searchCities(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WeatherCitySearchQuery,
  ) {
    return this.cities.search(id, user.id, query.name);
  }
  @Get()
  @ApiOperation({
    summary: 'Última semana histórica almacenada; solo lectura, no llama a Open-Meteo',
  })
  @ApiOkResponse({ type: WeatherSnapshotDto })
  get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.get(id, user.id);
  }
  @Put('profile')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Ubicación WGS84 y autorización explícita; versionada y auditada, sin llamada externa',
  })
  @ApiOkResponse({ type: WeatherSnapshotDto })
  save(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: WeatherProfileDto,
  ) {
    return this.service.save(id, user.id, input);
  }
  @Post('sync')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Sincroniza 7 días ERA5 con margen de disponibilidad; requiere proveedor habilitado y consentimiento. Cooldown persistente 15 min.',
  })
  @ApiOkResponse({ type: WeatherSnapshotDto })
  sync(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.sync(id, user.id);
  }
}
