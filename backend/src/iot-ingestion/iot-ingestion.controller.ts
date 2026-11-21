import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags, ApiCreatedResponse } from '@nestjs/swagger';
import { IngestResultDto } from '../telemetry/telemetry-response.dto';
import { CurrentDevice, DeviceEndpoint } from '../auth/auth.decorators';
import type { AuthenticatedDevice } from '../devices/device-auth.service';
import { IngestTelemetryDto } from '../telemetry/telemetry.dto';
import { TelemetryService } from '../telemetry/telemetry.service';

@ApiTags('IoT')
@Controller('iot')
export class IotIngestionController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Post('telemetry')
  @HttpCode(201)
  @ApiCreatedResponse({
    type: IngestResultDto,
    description: 'Persistido o reintento idéntico (duplicate=true).',
  })
  @Header('Cache-Control', 'no-store')
  @DeviceEndpoint()
  @ApiHeader({
    name: 'X-Device-Id',
    required: true,
    description: 'UUID persistente del dispositivo',
  })
  @ApiHeader({
    name: 'X-Device-Key',
    required: true,
    description: 'Credencial privada; no usar JWT de usuario',
  })
  @ApiOperation({
    summary:
      'Persistir evento v1.2; reintento idéntico devuelve duplicate=true, conflicto devuelve 409',
  })
  ingest(@CurrentDevice() device: AuthenticatedDevice, @Body() input: IngestTelemetryDto) {
    return this.telemetry.ingest(device, input);
  }
}
