import { createRequire } from 'node:module';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
require('reflect-metadata');
require('ts-node').register({ project: join(root, 'backend/tsconfig.json') });
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { IngestTelemetryDto } = require('../backend/src/telemetry/telemetry.dto.ts');
const { requireTelemetryTimestamp } = require('../backend/src/telemetry/ingestion-timestamp.ts');
const allowed = new Set([
  'schemaVersion',
  'eventId',
  'deviceId',
  'recordedAt',
  'soilMoisture',
  'soilMoisture.soil_1',
  'soilMoisture.soil_2',
  'soilMoisture.soil_3',
  'temperatureC',
  'airHumidityPct',
  'rainDetected',
  'valve',
  'valve.relayCommandedOpen',
  'valve.feedbackOpen',
  'source',
]);

function fields(errors, prefix = '') {
  return errors.flatMap((error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    return [
      ...(error.constraints ? [allowed.has(path) ? path : 'campo_no_admitido'] : []),
      ...fields(error.children ?? [], path),
    ];
  });
}

/** No env, credentials, network, database or firmware are used by this check. */
export async function inspectTelemetryPayload(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { ok: false, reason: 'structure', fields: [] };
  let dto;
  try {
    dto = plainToInstance(IngestTelemetryDto, value);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: false,
      validationError: { target: false, value: false },
    });
    if (errors.length)
      return {
        ok: false,
        reason: 'structure',
        fields: [...new Set(fields(errors))].sort().slice(0, 32),
      };
  } catch {
    return { ok: false, reason: 'structure', fields: [] };
  }
  try {
    requireTelemetryTimestamp(dto.recordedAt, now);
  } catch {
    return { ok: false, reason: 'timestamp', fields: ['recordedAt'] };
  }
  return {
    ok: true,
    schemaVersion: '1.2',
    declaredSource: dto.source ?? null,
    soilValuesPresent: Object.values(dto.soilMoisture).filter((value) => value !== null).length,
    timestampOrigin: dto.recordedAt === null ? 'server' : 'device',
    credentialsVerified: false,
    hardwareVerified: false,
    calibrationVerified: false,
  };
}

export async function readTelemetryInput(args, project = root) {
  let path;
  if (args.length === 1 && args[0] === '--demo') {
    path = join(project, 'docs/examples/iot-telemetry.demo.json');
  } else if (args.length === 2 && args[0] === '--input') {
    const base = await realpath(join(project, '.local'));
    const requested = resolve(project, args[1]);
    path = await realpath(requested);
    const part = relative(base, path);
    const info = await lstat(requested);
    if (
      !part ||
      isAbsolute(part) ||
      part === '..' ||
      part.startsWith(`..${sep}`) ||
      info.isSymbolicLink() ||
      !info.isFile() ||
      extname(path).toLowerCase() !== '.json'
    )
      throw new Error('Usa un archivo JSON privado dentro de .local');
  } else throw new Error('Uso: npm run iot:check -- --demo o --input .local/ARCHIVO.json');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 65536)
    throw new Error('Archivo JSON inválido o mayor de 64 KiB');
  const bytes = await readFile(path);
  if (bytes.length > 65536) throw new Error('Archivo mayor de 64 KiB');
  return JSON.parse(bytes.toString('utf8'));
}
