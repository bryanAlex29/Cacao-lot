import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  validateSimulatorConfig,
  simulatorPayload,
  sendUntilAvailable,
} from './simulator-core.mjs';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
try {
  if (process.env.NODE_ENV === 'production') throw new Error('Simulador prohibido en producción');
  const args = process.argv.slice(2);
  const count =
    args.length === 0
      ? Infinity
      : args.length === 2 && args[0] === '--count'
        ? Number(args[1])
        : NaN;
  if (count !== Infinity && (!Number.isInteger(count) || count < 1 || count > 10000))
    throw new Error('Uso: npm run simulator -- [--count 1..10000]');
  const config = validateSimulatorConfig(
    JSON.parse(await readFile(new URL('../.local/simulator.json', import.meta.url), 'utf8')),
  );
  const runId = randomUUID();
  console.log('DEMO · Datos simulados; Ctrl+C para detener. No controla hardware.');
  for (let sequence = 0; sequence < count; sequence++) {
    controller.signal.throwIfAborted();
    const result = await sendUntilAvailable(
      config,
      simulatorPayload(config.deviceId, runId, sequence, new Date().toISOString()),
      {
        signal: controller.signal,
        persistent: count === Infinity,
        onWaiting: (ms) =>
          console.log(
            `DEMO · API temporalmente no disponible. Nuevo intento en ${ms / 1000} s con el mismo evento; Ctrl+C para detener.`,
          ),
      },
    );
    console.log(`DEMO · Evento ${sequence + 1} ${result.duplicate ? 'ya recibido' : 'persistido'}`);
    if (sequence + 1 < count) await delay(5000, undefined, { signal: controller.signal });
  }
} catch (error) {
  if (controller.signal.aborted) console.log('Simulación detenida.');
  else {
    // Nunca mostrar contenido de configuración, cuerpo HTTP o errores de red con secretos.
    console.error(
      error instanceof SyntaxError
        ? 'Configuración DEMO inválida.'
        : 'No se pudo ejecutar el simulador. Revisar configuración DEMO privada y API local.',
    );
    process.exitCode = 1;
  }
}
