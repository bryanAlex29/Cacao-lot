import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { access, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { predictionPython, predictionPythonEnvironment } from './prediction-python-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (process.env.NODE_ENV === 'production')
  throw new Error('Regresión experimental solo fuera de producción');
if (
  !(args.length === 1 && args[0] === '--demo') &&
  !(args.length === 2 && args[0] === '--input' && args[1])
)
  throw new Error(
    'Uso: npm run prediction:regression:demo o npm run prediction:regression -- --input .local/ENTRADA.json',
  );
const python = predictionPython(root);
try {
  await access(python);
} catch {
  throw new Error(
    'Falta el entorno Python privado. Consulta docs/prediction-offline-regression.md; no se instalaron paquetes automáticamente.',
  );
}
const require = createRequire(import.meta.url);
require('ts-node').register({ project: join(root, 'backend/tsconfig.json') });
const {
  buildRegressionDataset,
} = require('../backend/src/prediction/offline/regression-dataset.ts');
const {
  syntheticPersistenceInput,
} = require('../backend/src/prediction/offline/persistence-demo.ts');
function child(base, path) {
  const name = relative(base, path);
  if (!name || name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name))
    throw new Error('El experimento debe permanecer en .local');
}
function ignored(path) {
  if (spawnSync('git', ['check-ignore', '--quiet', path], { cwd: root }).status !== 0)
    throw new Error('Los datos del experimento deben estar excluidos de Git');
}
await mkdir(join(root, '.local'), { recursive: true, mode: 0o700 });
const local = await realpath(join(root, '.local'));
child(await realpath(root), local);
let input;
if (args[0] === '--demo') input = syntheticPersistenceInput();
else {
  const path = await realpath(resolve(root, args[1]));
  child(local, path);
  ignored(path);
  const info = await stat(path);
  if (!info.isFile() || info.size > 16 * 1024 * 1024)
    throw new Error('Entrada JSON privada inválida o mayor de 16 MB');
  input = JSON.parse(await readFile(path, 'utf8'));
}
const result = buildRegressionDataset(input);
await mkdir(join(local, 'prediction-regression-runs'), { recursive: true, mode: 0o700 });
const base = await realpath(join(local, 'prediction-regression-runs'));
child(local, base);
const directory = join(
  base,
  `run-${new Date().toISOString().replaceAll(':', '-')}-${randomBytes(8).toString('hex')}`,
);
ignored(directory);
await mkdir(directory, { mode: 0o700 });
const save = (name, value) =>
  writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
await save('input.json', result.input);
// Compact bytes exactly match the TypeScript SHA-256; Python hashes the same bytes.
await writeFile(join(directory, 'dataset.json'), JSON.stringify(result.dataset), {
  flag: 'wx',
  mode: 0o600,
});
const execution = spawnSync(
  python,
  [
    join(root, 'analytics/prediction/train_regression.py'),
    '--dataset',
    join(directory, 'dataset.json'),
    '--report',
    join(directory, 'report.json'),
  ],
  {
    cwd: root,
    timeout: 120000,
    encoding: 'utf8',
    env: predictionPythonEnvironment(),
    maxBuffer: 1024 * 1024,
  },
);
if (execution.error || execution.status !== 0)
  throw new Error(
    'Falló la evaluación Python. No hay marcador de finalización; revisa contrato y entorno privado.',
  );
const bytes = await readFile(join(directory, 'report.json'));
const report = JSON.parse(bytes.toString('utf8'));
if (
  report.schemaVersion !== 'linear-comparison-v1' ||
  report.datasetHash !== result.datasetHash ||
  report.inputHash !== result.dataset.inputHash ||
  report.fieldValidated !== false ||
  report.status !== 'experimental' ||
  JSON.stringify(report.identity) !== JSON.stringify(result.dataset.identity) ||
  !Array.isArray(report.zones) ||
  report.zones.length !== 3
)
  throw new Error('Informe Python incompatible; no se marcó la ejecución como completa');
await save('complete.json', {
  datasetHash: result.datasetHash,
  inputHash: result.dataset.inputHash,
  reportHash: createHash('sha256').update(bytes).digest('hex'),
  modelVersion: report.model.version,
  fieldValidated: false,
});
console.log(
  `Regresión múltiple experimental · ${result.input.source === 'demo' ? 'DEMO · Datos de demostración' : 'REAL · Calibración y fiabilidad no verificadas'}.`,
);
console.log(`Artefactos privados: ${relative(root, directory)}`);
console.log(
  'Comparación con persistencia sobre las mismas fechas, sin selección automática de modelo, pronóstico web ni órdenes de válvula.',
);
