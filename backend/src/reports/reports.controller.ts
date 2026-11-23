import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './reports.dto';

@ApiTags('Reportes CSV')
@ApiBearerAuth()
@ApiProduces('text/csv')
@ApiResponse({
  status: 413,
  description: 'Más de 10000 registros; reducir periodo, nunca se trunca',
})
@ApiResponse({ status: 400, description: 'Fechas con zona horaria requeridas, máximo 31 días' })
@ApiResponse({ status: 401, description: 'Sesión inválida o inactiva' })
@ApiResponse({ status: 403, description: 'Canal DEMO no habilitado' })
@ApiResponse({
  status: 404,
  description: 'Parcela/dispositivo no disponible para este propietario y origen',
})
@Controller('plots/:id/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('readings.csv')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'CSV de telemetría autorizada, UTC, calidad y null explícitos' })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async readings(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportQueryDto,
  ) {
    return this.file(
      await this.reports.readings(id, user.id, query),
      `readings-${query.source}-${id}.csv`,
    );
  }

  @Get('irrigation-events.csv')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'CSV de cambios observados, no sesiones físicas ni duración/caudal' })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async irrigation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportQueryDto,
  ) {
    return this.file(
      await this.reports.irrigation(id, user.id, query),
      `irrigation-${query.source}-${id}.csv`,
    );
  }

  private file(content: string, filename: string) {
    return new StreamableFile(Buffer.from(content, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
