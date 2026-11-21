import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PageDto } from '../common/page.dto';
import {
  CreateDeviceDto,
  DeviceCreatedDto,
  DevicePageDto,
  DeviceResponseDto,
  UpdateDeviceDto,
} from './device.dto';
import { DevicesService } from './devices.service';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('plots/:plotId/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @ApiOkResponse({ type: DevicePageDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('plotId', new ParseUUIDPipe({ version: '4' })) plotId: string,
    @Query() page: PageDto,
  ) {
    return this.devices.list(plotId, user.id, page);
  }

  @Get(':deviceId')
  @ApiOkResponse({ type: DeviceResponseDto })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('plotId', new ParseUUIDPipe({ version: '4' })) plotId: string,
    @Param('deviceId', new ParseUUIDPipe({ version: '4' })) deviceId: string,
  ) {
    return this.devices.requireOwned(deviceId, plotId, user.id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiCreatedResponse({ type: DeviceCreatedDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('plotId', new ParseUUIDPipe({ version: '4' })) plotId: string,
    @Body() input: CreateDeviceDto,
  ) {
    return this.devices.create(plotId, user.id, input);
  }

  @Patch(':deviceId')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: DeviceResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('plotId', new ParseUUIDPipe({ version: '4' })) plotId: string,
    @Param('deviceId', new ParseUUIDPipe({ version: '4' })) deviceId: string,
    @Body() input: UpdateDeviceDto,
  ) {
    return this.devices.update(deviceId, plotId, user.id, input.isActive);
  }
}
