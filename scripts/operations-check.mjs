import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  inspectOperationConfig,
  operationOptions,
  readOperationEnvironment,
} from './operations-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const options = operationOptions(process.argv.slice(2));
  const input = await readOperationEnvironment(root, options.file);
  const require = createRequire(import.meta.url);
  require('ts-node').register({ project: join(root, 'backend/tsconfig.json') });
  const { validateEnvironment } = require('../backend/src/config/environment.ts');
  const result = inspectOperationConfig(input, { ...options, root, validate: validateEnvironment });
  console.log(JSON.stringify(result, null, 2));
  if (!result.configurationPassed) process.exitCode = 1;
} catch {
  console.error(
    'No se pudo revisar la configuración. Usa [--env .env|.local/ARCHIVO] [--production]. No se muestran valores privados.',
  );
  process.exitCode = 1;
}
