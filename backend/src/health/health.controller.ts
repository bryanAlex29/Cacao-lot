import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/auth.decorators';
import { LiveHealthDto, ReadyHealthDto, UnavailableHealthDto } from './health.dto';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOkResponse({ type: LiveHealthDto, description: 'El proceso está activo' })
  live(): LiveHealthDto {
    return this.health.live();
  }

  @Get('ready')
  @ApiOkResponse({ type: ReadyHealthDto, description: 'PostgreSQL responde a SELECT 1' })
  @ApiServiceUnavailableResponse({ type: UnavailableHealthDto })
  ready(): Promise<ReadyHealthDto> {
    return this.health.ready();
  }
}
