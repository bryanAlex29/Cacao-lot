import { simulationScenarios } from './simulation-scenarios.mjs';

// Offline only. This command never reads credentials, sends requests or writes files.
if (process.argv.length !== 2 || process.env.NODE_ENV === 'production') {
  console.error('Vista previa sintética rechazada; sin argumentos y fuera de producción.');
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      simulationScenarios('00000000-0000-4000-8000-000000000001', '2026-11-25T12:00:00.000Z'),
      null,
      2,
    ),
  );
}
