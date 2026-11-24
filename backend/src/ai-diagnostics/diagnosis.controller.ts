import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateDiagnosisDto, DiagnosisPageDto } from './diagnosis.dto';
import { DiagnosisService } from './diagnosis.service';

@ApiTags('ai-diagnostics')
@ApiBearerAuth()
@Controller('ai-diagnostics')
export class DiagnosisController {
  constructor(private readonly diagnoses: DiagnosisService) {}
  @Get('config')
  @ApiOperation({ summary: 'Límites y consentimiento del proveedor simulado, sin secretos' })
  options() {
    return this.diagnoses.options();
  }
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Procesa una fotografía privada con proveedor DEMO; requiere consentimiento demo-v1 y requestId idempotente',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image', 'plotId', 'requestId', 'consentVersion', 'retentionDays'],
      properties: {
        image: { type: 'string', format: 'binary' },
        plotId: { type: 'string', format: 'uuid' },
        requestId: { type: 'string', format: 'uuid' },
        consentVersion: { type: 'string', enum: ['demo-v1'] },
        retentionDays: { type: 'integer', minimum: 1, maximum: 30 },
        notes: { type: 'string', maxLength: 1000 },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5, fieldSize: 4096, parts: 6 },
    }),
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateDiagnosisDto,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    return this.diagnoses.create(user.id, input, file);
  }
  @Get()
  @ApiOperation({
    summary:
      'Historial privado por parcela, estado y fecha de creación (from/to inclusivos con zona, máximo 31 días); excluye borrados y vencidos',
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query() page: DiagnosisPageDto) {
    return this.diagnoses.list(user.id, page);
  }
  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.diagnoses.get(id, user.id);
  }
  @Get(':id/image')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'JPEG sin metadatos, únicamente con JWT y propiedad; nunca URL pública',
  })
  async image(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return new StreamableFile(await this.diagnoses.image(id, user.id), {
      type: 'image/jpeg',
      disposition: 'inline; filename="cacao.jpg"',
    });
  }
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Elimina acceso al resultado/foto y purga archivo; conserva clave idempotente hasta retención para cuota',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.diagnoses.remove(id, user.id);
  }
}
