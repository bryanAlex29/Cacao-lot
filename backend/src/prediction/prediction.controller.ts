import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PredictionAvailabilityDto, PredictionQueryDto } from './prediction.dto';
import { PredictionService } from './prediction.service';

@ApiTags('Predicción hídrica')
@ApiBearerAuth()
@Controller('plots/:id/predictions')
export class PredictionController {
  constructor(private readonly service: PredictionService) {}
  @Get()
  @ApiOperation({
    summary:
      'Disponibilidad y cobertura de 30 días UTC completos; no genera pronósticos ni consulta proveedores externos',
  })
  @ApiOkResponse({ type: PredictionAvailabilityDto })
  get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PredictionQueryDto,
  ) {
    return this.service.get(id, user.id, query);
  }
}
