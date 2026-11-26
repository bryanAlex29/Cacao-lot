import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const instant: SchemaObject = { type: 'string', format: 'date-time' };
const percentage: SchemaObject = { type: 'number', nullable: true, minimum: 0, maximum: 100 };
const score: SchemaObject = {
  type: 'object',
  required: ['samples', 'maePp', 'rmsePp', 'biasPp', 'outOfRangePredictions'],
  properties: {
    samples: { type: 'integer', minimum: 1, maximum: 366 },
    maePp: { type: 'number', minimum: 0 },
    rmsePp: { type: 'number', minimum: 0 },
    biasPp: { type: 'number' },
    outOfRangePredictions: { type: 'integer', minimum: 0 },
  },
};
const comparison: SchemaObject = {
  type: 'object',
  required: ['regression', 'persistence'],
  properties: { regression: score, persistence: score },
};
export const regressionForecastSchema: SchemaObject = {
  type: 'object',
  required: [
    'schemaVersion',
    'plotId',
    'deviceId',
    'source',
    'generatedAt',
    'informationCutoff',
    'target',
    'status',
    'fieldValidated',
    'uncertainty',
    'waterDemand',
    'zones',
  ],
  properties: {
    schemaVersion: { type: 'string', enum: ['regression-forecast-v1'] },
    plotId: { type: 'string', format: 'uuid' },
    deviceId: { type: 'string', format: 'uuid' },
    source: { type: 'string', enum: ['real', 'demo'] },
    generatedAt: instant,
    informationCutoff: instant,
    target: {
      type: 'object',
      required: ['from', 'toExclusive', 'timezone', 'variable', 'unit', 'horizonDays'],
      properties: {
        from: instant,
        toExclusive: instant,
        timezone: { type: 'string', enum: ['UTC'] },
        variable: { type: 'string', enum: ['soil_moisture'] },
        unit: { type: 'string', enum: ['%'] },
        horizonDays: { type: 'integer', enum: [1] },
      },
    },
    status: { type: 'string', enum: ['experimental', 'unavailable'] },
    fieldValidated: { type: 'boolean', enum: [false] },
    uncertainty: { type: 'string', enum: ['not_calibrated'] },
    waterDemand: { type: 'object', nullable: true, enum: [null] },
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
          'persistencePct',
          'features',
          'model',
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
              'model_not_registered',
              'model_not_available_at_cutoff',
              'model_incompatible',
              'missing_features',
              'unusable_features',
              'output_out_of_range',
            ],
          },
          predictedPct: percentage,
          persistencePct: percentage,
          features: {
            type: 'array',
            nullable: true,
            minItems: 2,
            maxItems: 2,
            items: {
              type: 'object',
              required: ['lag', 'moisturePct', 'observedAt', 'receivedAt'],
              properties: {
                lag: { type: 'integer', enum: [1, 2] },
                moisturePct: { type: 'number', minimum: 0, maximum: 100 },
                observedAt: instant,
                receivedAt: instant,
              },
            },
          },
          model: {
            type: 'object',
            nullable: true,
            required: [
              'id',
              'version',
              'registeredAt',
              'trainedUntilExclusive',
              'evaluatedThrough',
              'trainSamples',
              'evaluation',
            ],
            properties: {
              id: { type: 'string', format: 'uuid' },
              version: { type: 'string', enum: ['linear-two-lag-1.0.0'] },
              registeredAt: instant,
              trainedUntilExclusive: { type: 'string', format: 'date' },
              evaluatedThrough: instant,
              trainSamples: { type: 'integer', minimum: 4, maximum: 366 },
              evaluation: {
                type: 'object',
                required: ['validation', 'test'],
                properties: { validation: comparison, test: comparison },
              },
            },
          },
        },
      },
    },
  },
};
