import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PageDto } from '../common/page.dto';
import { PlotsService } from './plots.service';
import { CreatePlotDto, PlotPageDto, PlotResponseDto, UpdatePlotDto } from './plot.dto';

@ApiTags('plots')
@ApiBearerAuth()
@Controller('plots')
export class PlotsController {
  constructor(private readonly plots: PlotsService) {}

  @Get()
  @ApiOkResponse({ type: PlotPageDto })
  list(@CurrentUser() user: AuthenticatedUser, @Query() page: PageDto) {
    return this.plots.list(user.id, page);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiCreatedResponse({ type: PlotResponseDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreatePlotDto) {
    return this.plots.create(user.id, input);
  }

  @Get(':id')
  @ApiOkResponse({ type: PlotResponseDto })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.plots.requireOwned(id, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: PlotResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdatePlotDto,
  ) {
    return this.plots.update(id, user.id, input);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Archiva sin borrar datos ni dispositivos' })
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.plots.archive(id, user.id);
  }
}
