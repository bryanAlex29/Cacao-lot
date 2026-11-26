import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ExperimentalForecastQueryDto,
  PredictionAvailabilityDto,
  PredictionQueryDto,
} from './prediction.dto';
import { PredictionService } from './prediction.service';
import { OfflineExportService } from './offline-export.service';
import { OfflineExportQueryDto } from './offline-export.dto';
import { ExperimentalForecastService } from './experimental-forecast.service';
import { RegressionForecastService } from './regression-forecast.service';
import { regressionForecastSchema } from './regression-forecast.openapi';

@ApiTags('Predicción hídrica')
@ApiBearerAuth()
@Controller('plots/:id/predictions')
export class PredictionController {
  constructor(
    private readonly service: PredictionService,
    private readonly offline: OfflineExportService,
    private readonly experimental: ExperimentalForecastService,
    private readonly regression: RegressionForecastService,
  ) {}
  @Get('regression')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Inferencia experimental de regresión registrada y comparación con persistencia',
    description:
      'Solo lectura por propietario. Dos retardos diarios conocidos al corte UTC; última versión habilitada registrada para la sonda/origen. Sin entrenamiento HTTP, selección automática del ganador, recorte de salidas, litros ni válvulas. Requiere experimento offline evaluado previamente.',
  })
  @ApiOkResponse({
    description:
      'RegressionForecast v1: tres zonas, motivo de ausencia o valor experimental, persistencia sobre las mismas features, versión/fechas y MAE/RMSE/sesgo de validación/prueba. Sin coeficientes ni hashes públicos.',
    schema: regressionForecastSchema,
  })
  @ApiResponse({
    status: 400,
    description: 'Equipo UUID y horizonte 1 obligatorios; consulta estricta',
  })
  @ApiResponse({ status: 401, description: 'Sesión necesaria' })
  @ApiResponse({ status: 403, description: 'Origen no habilitado' })
  @ApiResponse({
    status: 404,
    description: 'Parcela o equipo ajenos, archivados o propietario inactivo',
  })
  regressionForecast(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExperimentalForecastQueryDto,
  ) {
    return this.regression.get(id, user.id, query.deviceId, query.source);
  }
  @Get('experimental')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Referencia experimental de persistencia por sonda para el cierre del día UTC en curso',
    description:
      'Solo lectura, sin entrenamiento ni proveedores externos. Corte a medianoche UTC; último dato del día previo recibido antes del corte. Calidad distinta de valid no se usa. Evaluación retrospectiva de 30 días, no validación de campo. Sin litros ni control de válvula.',
  })
  @ApiOkResponse({
    description:
      'ExperimentalMoistureForecast: tres zonas, valores o motivo de ausencia, evidencia, historia, MAE/RMSE/sesgo en puntos porcentuales; fieldValidated=false',
    schema: {
      type: 'object',
      required: [
        'schemaVersion',
        'plotId',
        'deviceId',
        'source',
        'generatedAt',
        'informationCutoff',
        'target',
        'model',
        'status',
        'uncertainty',
        'waterDemand',
        'zones',
      ],
      properties: {
        schemaVersion: { type: 'string', enum: ['persistence-forecast-v1'] },
        plotId: { type: 'string', format: 'uuid' },
        deviceId: { type: 'string', format: 'uuid' },
        source: { type: 'string', enum: ['real', 'demo'] },
        generatedAt: { type: 'string', format: 'date-time' },
        informationCutoff: {
          type: 'string',
          format: 'date-time',
          description: 'Medianoche UTC del día objetivo, no hora real de generación',
        },
        target: {
          type: 'object',
          required: ['from', 'toExclusive', 'timezone', 'variable', 'unit', 'horizonDays'],
          properties: {
            from: { type: 'string', format: 'date-time' },
            toExclusive: { type: 'string', format: 'date-time' },
            timezone: { type: 'string', enum: ['UTC'] },
            variable: { type: 'string', enum: ['soil_moisture'] },
            unit: { type: 'string', enum: ['%'] },
            horizonDays: { type: 'integer', enum: [1] },
          },
        },
        model: {
          type: 'object',
          required: ['name', 'version', 'fitted', 'fieldValidated'],
          properties: {
            name: { type: 'string', enum: ['persistence'] },
            version: { type: 'string', enum: ['1.0.0'] },
            fitted: { type: 'boolean', enum: [false] },
            fieldValidated: { type: 'boolean', enum: [false] },
          },
        },
        status: { type: 'string', enum: ['experimental', 'unavailable'] },
        uncertainty: { type: 'string', enum: ['not_calibrated'] },
        waterDemand: {
          type: 'object',
          nullable: true,
          enum: [null],
          description: 'Siempre null; sin litros, déficit ni fecha de riego',
        },
        zones: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            required: [
              'code',
              'sensorId',
              'reason',
              'predictedPct',
              'evidence',
              'evaluation',
              'history',
            ],
            properties: {
              code: { type: 'string', enum: ['soil_1', 'soil_2', 'soil_3'] },
              sensorId: { type: 'string', format: 'uuid', nullable: true },
              reason: {
                type: 'string',
                enum: [
                  'available',
                  'sensor_missing',
                  'sensor_disabled',
                  'device_disabled',
                  'missing_previous_day',
                  'unusable_previous_day',
                ],
              },
              predictedPct: { type: 'number', minimum: 0, maximum: 100, nullable: true },
              evidence: {
                type: 'object',
                nullable: true,
                required: ['observedAt', 'receivedAt'],
                properties: {
                  observedAt: { type: 'string', format: 'date-time' },
                  receivedAt: { type: 'string', format: 'date-time' },
                },
              },
              evaluation: {
                type: 'object',
                required: ['from', 'toExclusive', 'samples', 'maePp', 'rmsePp', 'biasPp'],
                properties: {
                  from: { type: 'string', format: 'date-time' },
                  toExclusive: { type: 'string', format: 'date-time' },
                  samples: { type: 'integer', minimum: 0, maximum: 30 },
                  maePp: { type: 'number', minimum: 0, maximum: 100, nullable: true },
                  rmsePp: { type: 'number', minimum: 0, maximum: 100, nullable: true },
                  biasPp: { type: 'number', minimum: -100, maximum: 100, nullable: true },
                },
              },
              history: {
                type: 'array',
                minItems: 30,
                maxItems: 30,
                items: {
                  type: 'object',
                  required: ['day', 'observedPct', 'predictedPct'],
                  properties: {
                    day: { type: 'string', format: 'date-time' },
                    observedPct: { type: 'number', minimum: 0, maximum: 100, nullable: true },
                    predictedPct: { type: 'number', minimum: 0, maximum: 100, nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Se requiere deviceId UUID y horizonte 1; consulta estricta',
  })
  @ApiResponse({ status: 401, description: 'Sesión necesaria' })
  @ApiResponse({ status: 403, description: 'Origen no habilitado' })
  @ApiResponse({ status: 404, description: 'Equipo/parcela ajenos o parcela archivada' })
  forecast(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExperimentalForecastQueryDto,
  ) {
    return this.experimental.get(id, user.id, query.deviceId, query.source);
  }
  @Get('offline-input.json')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Descarga privada PersistenceInput v1.0 para evaluación offline; no entrena ni pronostica',
    description:
      'Días objetivo UTC completos, máximo 366 días; incluye hasta dos días anteriores para retardos. Conserva calidad y fechas; valores invalid se exportan null. No devuelve secretos. source y deviceId obligatorios.',
  })
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiResponse({ status: 400, description: 'Fechas, cortes o selección inválidos' })
  @ApiResponse({ status: 401, description: 'Requiere sesión de usuario activa' })
  @ApiResponse({ status: 403, description: 'Canal DEMO no habilitado' })
  @ApiResponse({ status: 404, description: 'Parcela/dispositivo ajeno o parcela archivada' })
  @ApiResponse({ status: 413, description: 'Más de 100000 observaciones o 16 MB; nunca trunca' })
  async export(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OfflineExportQueryDto,
  ) {
    return new StreamableFile(await this.offline.export(id, user.id, query), {
      type: 'application/json; charset=utf-8',
      disposition: `attachment; filename="offline-${query.source}-${id}.json"`,
    });
  }
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
