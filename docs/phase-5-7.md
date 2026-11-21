# Fase 5.7 — Alertas independientes de baja humedad A/B/C

## Reglas aprobadas

- Activación: tres lecturas nuevas, recientes y consecutivas estrictamente bajo el mínimo.
- Recuperación: tres consecutivas ≥ mínimo + margen positivo en puntos porcentuales.
- Cada lectura que no cumple reinicia el conteo correspondiente. Datos ausentes, inválidos o antiguos rompen confirmaciones sin resolver el episodio.
- Duplicados y fechas iguales/fuera de orden se ignoran. Una fecha futura no contamina el marcador cronológico.
- Antigüedad y separación máxima: dos intervalos configurados de envío, coherente con el estado desactualizado de telemetría. El límite exacto se admite; no es un parámetro agronómico.
- DEMO permite calidad `valid` o `uncalibrated`, siempre identificado. Real solo permite `valid`. La ingesta directa actual sigue marcando reales sin calibrar: no se cambia calidad ni inventa evidencia de calibración.
- Rango y margen deben configurarse explícitamente: margen > 0, mínimo + margen ≤ máximo. Sin ellos no hay episodios. Si cambia el rango y el margen deja de caber, la política queda inhabilitada.
- Una sola alerta activa por sonda, garantizada con índice único parcial. Reconocimiento idempotente independiente del cierre.
- Cambiar rango o margen cierra como `CONFIGURATION_CHANGED`, nunca recuperación; reinicia cursor/conteos atómicamente. Solo lecturas posteriores a la configuración pueden confirmar de nuevo. No-op no crea auditorías ni versiones.
- Deshabilitar monitoreo cierra como `MONITORING_STOPPED` en la siguiente evaluación. Silencio/desconexión no recupera humedad ni modifica alertas de conectividad.

Ninguna regla envía órdenes de riego, configura firmware o agrega porcentajes de las tres sondas.

## Persistencia y API

Migración aditiva `20261121200000_moisture_alerts`: política, auditoría, estado durable/cursor y episodios con evidencia de rango/margen; índice dispositivo/orden de ingesta. Sin borrar o transformar datos anteriores.

Detector al arrancar/cada 5 s, independiente del navegador e ingesta. Procesa hasta 100 lecturas por sonda/pasada, pagina candidatos y guarda cursor/transiciones en una transacción. Retrasos no producen alertas retrospectivas con datos ya antiguos. Bloquea dispositivo → parcela/usuario → sensor; un fallo conserva estado para reintentar sin detener otras sondas. Guardar rangos cierra/reinicia humedad en la misma transacción, sin cambiar su auditoría histórica.

| Método | Ruta relativa a `/api/v1`                                         | Acceso                                 |
| ------ | ----------------------------------------------------------------- | -------------------------------------- |
| GET    | `/sensors/:sensorId/moisture-alert-policy`                        | Propietario; política, rango y estado  |
| PUT    | `/sensors/:sensorId/moisture-alert-policy`                        | ADMIN propietario                      |
| GET    | `/plots/:plotId/moisture-alerts?deviceId=&source=&offset=&limit=` | ADMIN/FARMER propietario               |
| POST   | `/plots/:plotId/moisture-alerts/:alertId/acknowledge`             | ADMIN/FARMER propietario, cuerpo vacío |

PUT solo acepta `recoveryMarginPct`, `expectedVersion` (0 al crear) y `expectedThresholdVersion`. Conflicto 409 exige consultar/revisar. UUID, propiedad, actividad, rol y `SourcePolicy` revalidados; sin acceso global ADMIN.

## Angular

«Baja humedad por sonda» debajo de desconexión, listado paginado con fechas, origen y reconocimiento independientes. «Configuración de alertas A/B/C» ofrece margen a ADMIN; FARMER solo consulta.

Cliente verifica identidad/origen, versiones, porcentajes y coherencia temporal. Alertas: consulta cada 15 s y manual. Política: al seleccionar y mediante «Consultar política»; no se sobrescribe un borrador por polling. Tras editar rango, consultar política; guardar versiones antiguas devuelve 409.

Errores no bloquean telemetría/histórico/Socket.IO/desconexión. Escrituras sin reintentos automáticos; resultado incierto exige consulta. Cambio de selección/salida cancela solicitudes y limpia evidencia. Formulario conectado con `FormGroup`; pruebas de submit DOM y Edge cubren el fallo detectado donde un botón aparentaba guardar sin enviar.

## Verificación

- `npm run test`: 178 backend y 295 Angular correctas.
- `npm run test:integration`: 124 PostgreSQL/Socket.IO correctas, incluidas 17 nuevas de humedad. Migraciones solo en bases desechables eliminadas por el runner.
- `npm run test:browser` con Edge: 20 correctas. Configuración desde formulario real → tres ingestas autenticadas → episodio → panel → reconocimiento sin cierre. Regresiones previas conservadas.
- Captura móvil de 390 px revisada con configuración/episodio visibles; sin desbordamiento.
- Tipos, lint, build, validación Prisma y formato de archivos afectados correctos. `npm run test:simulator`: 10 correctas. Total: 627 pruebas correctas; sin reiniciar el proceso continuo del simulador.
- Advertencia existente `pg`: consultas concurrentes sobre un cliente se desaconsejarán en pg 9. Sin cambiar dependencias ni seguridad para silenciarla.

## Activación local verificada

El usuario autorizó aplicar la migración local y verificar el botón. `npm run db:migrate` aplicó únicamente `20261121200000_moisture_alerts` a la principal local. Se preservaron los conteos de las nueve tablas de negocio previas. Las cuatro tablas nuevas quedaron vacías: no se configuraron márgenes ni fabricaron lecturas/alertas.

`npm run smoke`: liveness/readiness 200 y OpenAPI disponible; se comprobaron además las tres rutas de humedad. Angular responde 200 en `http://localhost:4200` (escucha en IPv6 `::1`, no en `127.0.0.1`). Se repitió `npm run test:browser` con Edge: 20 correctas, incluido el botón real de guardar margen, persistencia y reconocimiento sin cierre, en base temporal aislada. El arreglo FormGroup ya estaba incorporado: no fue necesario otro cambio al botón.

Para usar alertas de humedad, ADMIN debe elegir explícitamente el margen de cada sonda en Alertas → Configuración de alertas A/B/C. Sin margen seguirán inhabilitadas. No se cambiaron roles ni reinició el simulador.

Archivos: `backend/src/alerts/moisture/`, `backend/src/sensor-thresholds/threshold.repository.ts`, schema/migración Prisma, `backend/src/app.module.ts`, contratos, `frontend/src/app/core/alerts/moisture*`, componentes `moisture*` e integración dashboard; pruebas unitarias, PostgreSQL y navegador.

Sin firmware, hardware real, despliegue, push o commits nuevos. No avanzar a eventos de riego/reportes/IA/clima sin otra instrucción.
