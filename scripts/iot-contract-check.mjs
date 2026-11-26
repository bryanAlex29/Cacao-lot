import { inspectTelemetryPayload, readTelemetryInput } from './iot-contract-core.mjs';

try {
  const result = await inspectTelemetryPayload(await readTelemetryInput(process.argv.slice(2)));
  if (result.ok) {
    console.log('JSON conforme al contrato de ingreso v1.2 y a su regla temporal.');
    console.log(JSON.stringify(result));
    console.log(
      'Comprobación offline: no se enviaron datos ni se validaron credenciales, calibración, red o hardware.',
    );
  } else {
    console.error('JSON no compatible: ' + result.reason + '. Campos: ' + result.fields.join(', '));
    process.exitCode = 1;
  }
} catch {
  console.error(
    'No se pudo comprobar el JSON. Usa --demo o --input .local/ARCHIVO.json (máximo 64 KiB). No se muestran valores privados.',
  );
  process.exitCode = 1;
}
