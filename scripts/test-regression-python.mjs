import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { predictionPython, predictionPythonEnvironment } from './prediction-python-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = predictionPython(root);
try {
  await access(python);
} catch {
  throw new Error('Falta Python privado; consulta docs/prediction-offline-regression.md');
}
const result = spawnSync(
  python,
  ['-m', 'unittest', 'discover', '-s', 'analytics/prediction', '-p', 'test_regression.py', '-v'],
  {
    cwd: root,
    timeout: 120000,
    stdio: 'inherit',
    env: predictionPythonEnvironment(),
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
