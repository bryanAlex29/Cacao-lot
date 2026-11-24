import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
if (process.env.NODE_ENV === 'production')
  throw new Error('La evaluación experimental solo se permite fuera de producción');
if (
  !(args.length === 1 && args[0] === '--demo') &&
  !(args.length === 2 && args[0] === '--input' && args[1])
)
  throw new Error(
    'Uso: npm run prediction:demo o npm run prediction:baseline -- --input .local/ENTRADA.json',
  );
require('ts-node').register({ project: join(root, 'backend/tsconfig.json') });
const {
  evaluatePersistence,
} = require('../backend/src/prediction/offline/persistence-baseline.ts');
const {
  syntheticPersistenceInput,
} = require('../backend/src/prediction/offline/persistence-demo.ts');

function requireChild(base, path) {
  const child = relative(base, path);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child))
    throw new Error('La entrada/salida debe permanecer en el directorio privado .local');
}
function requireIgnored(path) {
  const result = spawnSync('git', ['check-ignore', '--quiet', path], { cwd: root });
  if (result.status !== 0)
    throw new Error('Los archivos del experimento deben estar excluidos de Git');
}
await mkdir(join(root, '.local'), { recursive: true, mode: 0o700 });
const local = await realpath(join(root, '.local'));
requireChild(await realpath(root), local);
let input;
if (args[0] === '--demo') input = syntheticPersistenceInput();
else {
  const path = await realpath(resolve(root, args[1]));
  requireChild(local, path);
  requireIgnored(path);
  const info = await stat(path);
  if (!info.isFile() || info.size > 16 * 1024 * 1024)
    throw new Error('Entrada JSON privada inválida o mayor de 16 MB');
  input = JSON.parse(await readFile(path, 'utf8'));
}
const result = evaluatePersistence(input);
const base = join(local, 'prediction-runs');
await mkdir(base, { recursive: true, mode: 0o700 });
const actualBase = await realpath(base);
requireChild(local, actualBase);
const directory = join(
  actualBase,
  `run-${new Date().toISOString().replaceAll(':', '-')}-${randomBytes(8).toString('hex')}`,
);
requireIgnored(directory);
await mkdir(directory, { mode: 0o700 });
const save = (name, data) =>
  writeFile(join(directory, name), JSON.stringify(data, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
await save('input.json', result.input);
await save('dataset.json', result.dataset);
await save('report.json', result.report);
// Only this final marker certifies all artifacts were written. No auto-deletion of failed runs.
await save('complete.json', {
  inputHash: result.dataset.inputHash,
  datasetHash: result.report.datasetHash,
  modelVersion: result.report.model.version,
  fieldValidated: false,
});
console.log(
  `Evaluación experimental ${result.input.source === 'demo' ? 'DEMO · datos sintéticos/declarados de demostración' : 'REAL · calibración y fiabilidad de campo no verificadas'}.`,
);
console.log(`Artefactos privados: ${relative(root, directory)}`);
console.log(
  'Persistencia evaluada por zona; métricas en puntos porcentuales, no porcentaje de precisión. Sin pronóstico web, litros ni órdenes de válvula.',
);
