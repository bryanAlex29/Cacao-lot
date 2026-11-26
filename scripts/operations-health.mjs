import { healthBase, probeOperationHealth } from './operations-core.mjs';

try {
  const result = await probeOperationHealth(healthBase(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  if (!result.healthy) process.exitCode = 1;
} catch {
  console.error(
    'Comprobación de salud rechazada. Usa --base-url ORIGEN, HTTPS remoto o HTTP loopback, sin credenciales, ruta ni parámetros.',
  );
  process.exitCode = 1;
}
