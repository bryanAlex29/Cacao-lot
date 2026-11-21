import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { ReadingPageDto, TelemetrySnapshotDto } from './telemetry-response.dto';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { HistoryQueryDto, SnapshotQueryDto } from './telemetry.dto';
import { TelemetryService } from './telemetry.service';

@ApiTags('Telemetría')
@ApiBearerAuth()
@Controller('plots/:id')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get('dashboard')
  @ApiOkResponse({ type: TelemetrySnapshotDto })
  @ApiOperation({
    summary: 'Snapshot de telemetría; source=real por defecto, deviceId obligatorio si hay varios',
  })
  snapshot(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SnapshotQueryDto,
  ) {
    return this.telemetry.snapshot(id, user.id, query);
  }
  @Get('readings')
  @ApiOkResponse({ type: ReadingPageDto })
  @ApiOperation({
    summary:
      'Histórico descendente por tiempo efectivo; máximo 31 días, últimas 24 horas por defecto',
  })
  history(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: HistoryQueryDto,
  ) {
    return this.telemetry.history(id, user.id, query);
  }
}
