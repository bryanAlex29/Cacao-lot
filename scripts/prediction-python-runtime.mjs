import { join } from 'node:path';

export function predictionPython(root) {
  return join(
    root,
    '.local/prediction-python',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
}
export function predictionPythonEnvironment() {
  return {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
    OMP_NUM_THREADS: '1',
    OPENBLAS_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
  };
}
