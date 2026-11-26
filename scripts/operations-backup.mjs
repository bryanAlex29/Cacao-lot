import { fileURLToPath } from 'node:url';
import { inspectOperationBackup } from './operations-core.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--directory' || !args[1])
    throw new Error('Argumentos inválidos');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = await inspectOperationBackup(root, args[1]);
  console.log(JSON.stringify(result, null, 2));
  if (!result.integrityPassed || !result.restorationEvidenceFound || !result.coversCurrentSchema)
    process.exitCode = 1;
} catch {
  console.error(
    'No se pudo inspeccionar el respaldo. Usa --directory .local/backups/bundle-...; no se muestran contenidos privados ni se restaura la base.',
  );
  process.exitCode = 1;
}
