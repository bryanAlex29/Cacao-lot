# Revisión de preparación IoT — 25 de noviembre de 2026

## Alcance

Revalidación del software existente antes de recibir el circuito físico.
Conservar los cambios previos del usuario; no cambiar firmware, válvula,
credenciales, configuración de red ni desplegar.

## Resultados confirmados

| Comprobación                  | Resultado                                 |
| ----------------------------- | ----------------------------------------- |
| ESLint                        | Correcto                                  |
| Tipos de los tres workspaces  | Correctos                                 |
| Compilación NestJS y Angular  | Correcta                                  |
| Backend Jest                  | 384 pruebas, 23 suites correctas          |
| Frontend                      | 614 pruebas, 40 archivos correctos        |
| Integración HTTP/DB/Socket.IO | 226 pruebas, 13 suites correctas          |
| Navegador Edge                | 46 recorridos correctos                   |
| Scripts auxiliares            | 75 pruebas correctas                      |
| Regresión Python              | 12 pruebas correctas                      |
| Contrato IoT DEMO             | Conforme, tres valores de suelo presentes |
| Prisma validate               | Esquema válido                            |
| Salud de la API existente     | live/ready 200; rutas OpenAPI presentes   |
| git diff --check              | Sin errores; advertencias LF/CRLF         |

Los 75 tests auxiliares abarcan simulador, comprobador IoT, regresión específica
de seguridad de dependencias, CLI de persistencia/regresión y utilidades de
respaldo. No equivalen a auditoría completa ni restauración integral.

## Entorno y aislamiento

- Node.js 22.23.5 y Git 2.54.0.windows.1 disponibles.
- Usar `npm.cmd`: PowerShell bloquea el lanzador `npm.ps1`.
- npm global 10.9.9 es inferior al requisito de instalación del proyecto
  (11.6.2). No se instalaron dependencias ni se cambió npm.
- Docker no está disponible en esta sesión. La base configurada es remota;
  no ejecutar el runner Neon ni modificar esa base para esta revisión.
- PostgreSQL 18 tiene binarios instalados. La integración se ejecuta en un
  clúster nuevo bajo el directorio temporal aprobado de OpenCode, con puerto
  dinámico, escucha exclusiva en 127.0.0.1 y contraseña aleatoria SCRAM.
  La conexión se pasa por entorno únicamente a los procesos de prueba,
  sin editar `.env`.

## Resultado final de integración

La segunda ejecución terminó correctamente: 226 pruebas en las 13 suites de
integración y 46 recorridos en Edge. Se corrigieron tanto la exportación temporal
como los tres recorridos del historial de riego que fallaron inicialmente.

Se comprobó simulador → HTTP → PostgreSQL → Socket.IO → Angular, tres sondas
independientes, lecturas parciales, duplicados, mensajes atrasados,
desconexión/reconexión con recuperación REST, permisos, separación DEMO/REAL,
historial de riego, fechas/paginación y vista móvil.

Las bases temporales se eliminaron y los clústeres de prueba se detuvieron.
Capturas sintéticas finales en
`C:\Users\Hp\AppData\Local\Temp\opencode\cacaosmart-browser-Ebbstt`.

## Error reproducido y corrección

La primera ejecución aislada utilizó un PostgreSQL con zona de servidor
`America/Bogota`, no UTC:

- La exportación de una lectura sin reloj devolvió `05:00Z` en lugar de `00:00Z`.
- Integración se detuvo en `prediction.integration.ts`: 25 pruebas correctas y
  una fallida en esa suite; las suites posteriores no llegaron a ejecutarse.
- Navegador completó 43 recorridos y falló tres de historial de riego.

El adaptador instalado `@prisma/adapter-pg` serializa parámetros DateTime como
hora UTC sin sufijo de zona y normaliza el offset de timestamptz como UTC sin
convertir la hora. Una sesión PostgreSQL no UTC introduce discrepancias entre
las fechas ORM y las consultas SQL que formatean explícitamente UTC.

Corrección en `backend/src/database/prisma.service.ts`: cada conexión del pool
solicita `options: '-c timezone=UTC'`, sin cambiar la zona global del servidor,
la configuración privada ni datos históricos. No se actualizó la dependencia.

Se añadió `backend/test/database-timezone.integration.ts`: verifica cinco
consultas concurrentes, zona de sesión UTC y conservación exacta del instante,
incluidos milisegundos, tanto como Date como texto SQL UTC. La prueba fija
`America/Bogota` únicamente como valor predeterminado de su base temporal y
reabre el pool; así detecta la regresión aunque el servidor use UTC.
La segunda ejecución integral mantiene además `America/Bogota` en el servidor.
La prueba específica también pasó sobre otro clúster temporal con servidor UTC.

Después del cambio volvieron a pasar lint, tipos, compilación y las 384 pruebas
backend y 614 frontend. El chequeo de formato de los archivos afectados se
realiza separadamente del pendiente global.

## Comandos y archivos afectados

- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd test`.
- `npm.cmd run test:regression-python`, `npm.cmd run iot:check -- --demo`,
  `npm.cmd run db:validate`, `npm.cmd run smoke`, `git diff --check`.
- `node --test` sobre `simulator.test.mjs`, `iot-contract.test.mjs`,
  `dependency-security.test.mjs`, `prediction-baseline.test.mjs`,
  `prediction-regression.test.mjs`, `backup-restore.test.mjs`,
  `neon-postgres.test.mjs`, `periodic-backup.test.mjs` y `backup-copy.test.mjs`,
  todos bajo `scripts/`.
- `node scripts/integration-test.mjs` y su variante `--browser` con conexión
  local temporal por entorno y Edge instalado. No usar la conexión remota de
  `.env` para este runner: su guarda la rechaza.
- Prueba específica con Jest, desde `backend`: `--config jest.integration.cjs`
  y `--runInBand --runTestsByPath test/database-timezone.integration.ts`,
  únicamente con base temporal generada, migrada y eliminada por el ejecutor.
- Prettier `--check` sobre los tres archivos afectados.

Cambios propios: `backend/src/database/prisma.service.ts`,
`backend/test/database-timezone.integration.ts` y este informe. No se modificaron
los cambios previos del usuario ni se aplicaron migraciones a la base principal.

## Estilo y límites

El diagnóstico de Prettier con `--end-of-line auto` señala 11 archivos:
`frontend/angular.json`, el spec de `water-forecast`, el spec de entorno,
seis archivos de `backend/src/weather` y dos fixtures/tests de clima.
Son diferencias de formato preexistentes; no se reformateó masivamente trabajo
ajeno ni se relajó el chequeo. No son fallos funcionales reproducidos.

Persiste la advertencia de consultas concurrentes del adaptador `pg`,
sin fallos de prueba. No se ocultó ni se actualizaron dependencias para evitarla.
El formato de los tres archivos afectados sí pasó Prettier.

Sin ESP32 no se verifican conectividad física, calibración, alimentación,
seguridad eléctrica, control local ni riego. Una prueba DEMO no valida la
predicción en campo. La recepción REAL requiere revisar el contrato auténtico,
red y provisión autorizada según `ESP32_PREPARACION.md`.
