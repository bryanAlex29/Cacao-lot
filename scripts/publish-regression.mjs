import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { neonSource } from './neon-postgres.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let db;
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--run' || args[2] !== '--owner' || !args[1] || !args[3])
    throw new Error(
      'Uso: prediction:publish -- --run .local/prediction-regression-runs/run-... --owner UUID',
    );
  loadEnvFile(join(root, '.env'));
  if (!['development', 'test'].includes(process.env.NODE_ENV))
    throw new Error('Registro experimental solo en desarrollo/pruebas');
  let source = new URL(process.env.DATABASE_URL);
  if (source.hostname.endsWith('.neon.tech')) source = neonSource(process.env);
  else if (
    !['postgres:', 'postgresql:'].includes(source.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(source.hostname) ||
    [...source.searchParams.keys()].some((key) => !['schema', 'connect_timeout'].includes(key))
  )
    throw new Error('Destino local o Neon explícito requerido');
  const base = await realpath(join(root, '.local/prediction-regression-runs'));
  const directory = await realpath(resolve(root, args[1]));
  const child = relative(base, directory);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child))
    throw new Error('Solo experimentos privados de regresión');
  const files = {};
  for (const name of ['input.json', 'dataset.json', 'report.json', 'complete.json']) {
    const requested = join(directory, name);
    const actual = await realpath(requested);
    const info = await lstat(requested);
    if (
      actual !== requested ||
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > 16 * 1024 * 1024 ||
      spawnSync('git', ['check-ignore', '--quiet', actual], { cwd: root }).status !== 0
    )
      throw new Error('Archivo de experimento no privado o no regular');
    files[name] = await readFile(actual);
  }
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const complete = JSON.parse(files['complete.json']);
  if (
    complete.fieldValidated !== false ||
    complete.modelVersion !== 'linear-two-lag-1.0.0' ||
    complete.reportHash !== digest(files['report.json']) ||
    complete.datasetHash !== digest(files['dataset.json'])
  )
    throw new Error('Experimento incompleto o integridad incorrecta');
  const require = createRequire(import.meta.url);
  require('ts-node').register({ project: join(root, 'backend/tsconfig.json') });
  const { publicationsFromRun } = require('../backend/src/prediction/regression-artifact.ts');
  const {
    registerRegressionPublication,
  } = require('../backend/src/prediction/regression-registration.ts');
  const input = JSON.parse(files['input.json']);
  if (input.source === 'demo' && process.env.TELEMETRY_MODE !== 'demo')
    throw new Error('Canal DEMO no habilitado');
  const publication = publicationsFromRun(input, JSON.parse(files['report.json']), new Date());
  if (
    publication.datasetHash !== complete.datasetHash ||
    publication.inputHash !== complete.inputHash
  )
    throw new Error('La entrada no reproduce el dataset completo');
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: source.href }), log: [] });
  const ids = await registerRegressionPublication(db, args[3], publication, complete.reportHash);
  console.log(
    `Registro experimental completado: ${ids.length} versiones de sonda. Sin entrenamiento, cambio de lecturas ni validación de campo.`,
  );
} catch (error) {
  console.error(
    error instanceof Error &&
      !('code' in error) &&
      !error.name.startsWith('Prisma') &&
      !(error instanceof SyntaxError)
      ? error.message
      : 'No se registró el experimento; detalles privados omitidos',
  );
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect();
}
