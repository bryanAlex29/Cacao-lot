# Fase 5.5 — Límites históricos por vigencia

## Alcance autorizado

Añadir la consulta de rangos históricos y los segmentos de mínimo/máximo de las tres sondas A/B/C al gráfico existente. Conservar las tarjetas y su clasificación actual, el histórico paginado, permisos, calidad y separación real/DEMO. No se añaden alertas, clasificación de lecturas históricas, control de riego, cambios de firmware, valores predeterminados ni rangos ambientales al gráfico de suelo.

**Criterio central: cambiar hoy un rango no cambia los límites mostrados para ayer.** La configuración tiene fecha de vigencia inmediata asignada por el servidor; no hay edición retroactiva ni programación de vigencias futuras desde la web.

## Consulta de solo lectura

```text
GET /api/v1/sensors/:sensorId/thresholds/history?from=<ISO con zona>&to=<ISO con zona>
```

- JWT de ADMIN o FARMER propietario; mismo control de sensor habilitado, dispositivo activo, parcela no archivada y usuario activo que la consulta actual. ADMIN no puede consultar recursos ajenos.
- El origen procede del dispositivo, no del cliente. DEMO conserva las restricciones de `SourcePolicy`; lluvia booleana se rechaza.
- Inicio incluido, fin excluido: **[from, to)**. Inicio anterior al fin, máximo 31 días; no admite fechas sin zona, campos extra ni `source` del cliente.
- Respuesta: identidad de sensor/dispositivo/parcela, origen, variable, unidad, periodo normalizado UTC e `intervals` con cobertura completa. Cada intervalo tiene `from`, `to` y `threshold` con mínimo, máximo, versión y fecha original de vigencia, o `null` antes de la primera configuración.
- No expone snapshots crudos, usuarios editores ni sus IDs. No modifica rangos, auditoría, lecturas ni fechas.
- Máximo **1000 cambios dentro del periodo**, más el rango de anclaje. Un exceso devuelve 409 con indicación de consultar un periodo menor; nunca se entrega una lista truncada como si fuese completa.
- Una auditoría incompatible, incompleta en la cadena relevante o discrepante con el estado actual produce 409, no «Sin rango configurado» ni el uso de los límites actuales para cubrir huecos.
- OpenAPI documenta fechas, respuesta, ausencia y conflicto. No se alteran las rutas GET/PUT actuales ni los contratos de telemetría/eventos.

## Reconstrucción

Se reutiliza la auditoría transaccional de 5.1, sin migración ni nuevas tablas. En una transacción de lectura `RepeatableRead`, se obtiene la identidad autorizada/configuración actual, el último cambio en o antes de `from`, los cambios internos acotados y el primero en o después de `to`. Este último permite comprobar el límite posterior sin cargar todo el historial del sensor.

La función pura `thresholdIntervals` valida identidad, origen, unidad, números finitos, orden de versiones, encadenamiento anterior/nuevo y coincidencia entre fecha auditada y vigencia. La instantánea de anclaje permite mostrar un rango cuya creación fue anterior al periodo solicitado. Sin cambios posteriores, el extremo final debe coincidir con el rango persistido actual.

Los extremos no se interpolan: al cambiar de versión, termina un intervalo y comienza otro. Si varias ediciones comparten milisegundo, gana la versión mayor para ese instante; las versiones intermedias de duración cero no generan segmentos. No se reescribe la lógica de guardado anterior.

Estas comprobaciones no convierten la auditoría en un registro a prueba de manipulación por administradores de PostgreSQL ni sustituyen respaldos. Si se detectan anomalías temporales o de integridad en la cadena consultada, se falla de forma explícita.

## Angular y gráfico

- `ThresholdHistoryFacade` tiene estados y errores independientes de las tarjetas y la telemetría. Solo consulta las tres sondas del inventario autorizado. Cada respuesta se valida por identidad/origen/unidad y cobertura temporal completa antes de dibujar.
- El periodo coincide con el dominio temporal de las lecturas de la **página actual**, no con todo el historial descargado. Se usa `recordedAt` o, si falta, `receivedAt`, como antes. La consulta incluye un milisegundo tras la última lectura para cubrir ese punto con fin excluido; el dibujo se recorta al dominio del gráfico. Una lectura única mantiene el dominio mínimo de un milisegundo que ya utilizaba el gráfico.
- El cambio de página, dispositivo, parcela, origen o sesión cancela inmediatamente la consulta pendiente y limpia sus líneas. Hay agrupación de 100 ms antes de iniciar las peticiones, cancelable también durante esa espera.
- Nuevas lecturas o recuperación REST actualizan el dominio y sus límites. Guardar un rango vuelve a consultar el historial, cancelando GET anteriores al guardado. Si el nuevo rango empieza después de la última lectura, no se pinta sobre esa lectura; aparecerá al mostrarse un periodo que incluya su vigencia.
- Se conservan las tres series, puntos, calidad, huecos, tabla de mediciones, filtros 24 h/7 días/30 días y paginación existentes. Los rangos pueden continuar sobre huecos de medición porque representan configuración, no mediciones interpoladas.
- Mínimos con trazos largos y máximos con puntos, color por zona, títulos SVG y tabla desplegable con fechas locales a milisegundos, límites y versión. No se unen versiones con diagonales ni se agregan sondas.
- Un periodo anterior a configurar muestra «Sin rango configurado en este periodo». Error/carga/deshabilitado son estados diferentes. Un fallo de una sonda no oculta las mediciones ni las otras sondas; hay botón «Reintentar rangos históricos».
- DEMO tiene etiqueta explícita. Los límites se describen como referencias de monitoreo, no prueba de calibración, diagnóstico o política de apertura del ESP32. Las reglas de clasificación de tarjetas de 5.4 permanecen intactas.

## Archivos del incremento

- `backend/src/sensor-thresholds/threshold-history.ts`, `.dto.ts`, `.spec.ts`: reconstrucción, filtro y contrato.
- `backend/src/sensor-thresholds/threshold.repository.ts`, `.service.ts`, `.controller.ts`: consultas de solo lectura y nueva ruta.
- `packages/contracts/src/index.d.ts`: tipos adicionales de historial, sin cambiar los contratos previos.
- `frontend/src/app/core/sensor-thresholds/threshold-history-api.service.ts`, `threshold-history.facade.ts`, `threshold-history.spec.ts`: cliente validado, ciclo de vida y pruebas.
- `frontend/src/app/features/dashboard/soil-history-chart.component.ts`, `.spec.ts`: segmentos, leyenda, estados, tabla y pruebas.
- `frontend/src/app/features/dashboard/dashboard.component.ts`, `.html`, `.spec.ts`: conexión aditiva del historial y limpieza/refresco.
- `backend/test/sensor-thresholds.integration.ts`, `backend/test/dashboard.integration.ts`: permisos/fechas/vigencia y recorrido de navegador.
- `README.md`, `docs/HANDOFF.md`, este documento: estado, uso y limitaciones.

## Verificación

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:simulator
npm run build
npm run smoke
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

Resultado final: **445 pruebas correctas — 128 backend, 206 Angular, 86 integración PostgreSQL/Socket.IO, 15 navegador Edge Chromium y 10 simulador**. Se añadieron 31 unitarias backend, 38 Angular, 13 de integración y 3 de navegador. Lint, tipos, build, smoke, formato de los archivos del incremento y `git diff --check` correctos.

Se revisaron capturas sintéticas de escritorio (1440 px) y móvil (390 px), con límites de dos vigencias y tabla abierta, sin desbordamiento de la página. La tabla conserva desplazamiento horizontal propio en pantallas pequeñas. Esto no equivale a una auditoría completa de accesibilidad ni validación en campo.

Las pruebas de navegador comprueban conservación del máximo anterior tras guardar otro, aparición de la nueva vigencia tras otra lectura, filtros, fallo/reintento del historial sin perder mediciones y paginación real de 103 lecturas. La página antigua no conserva límites recientes si aún no existían. Para preparar esa última fixture se insertan 101 lecturas históricas directamente en la base temporal, evitando una ráfaga artificial de ingesta/eventos; el recorrido HTTP/Socket.IO se verifica en las pruebas anteriores.

Durante el ajuste de pruebas, las primeras ejecuciones de navegador detectaron esperas inadecuadas de visibilidad sobre líneas SVG horizontales y una ráfaga artificial de 101 eventos (429/timeout). Se corrigieron únicamente los selectores/esperas y la preparación de fixtures. No se elevaron ni desactivaron límites de seguridad de la aplicación para conseguir el resultado final.

No se instalaron dependencias ni se cambió el lockfile. Entorno de esta verificación: Node.js 22.23.5, npm disponible 10.9.9, Git 2.54.0.windows.1, Docker CLI 29.9.3. npm 10 se usó únicamente para ejecutar scripts sobre dependencias ya instaladas; para instalar sigue siendo obligatorio npm 11.6.2 según README/package.json. No se actualizó npm global.

Las suites crean bases, cuentas, rangos y lecturas temporales; eliminan únicamente las bases generadas por el runner. No se insertaron fixtures ni se ejecutaron migraciones nuevas en la base principal. Los archivos del incremento se comprueban con Prettier sin reformatear archivos ajenos por avisos CRLF anteriores.

## Pendientes fuera de este incremento

Alertas/histéresis, eventos de riego, reportes, filtrado por fechas personalizadas en UI, IA y clima/predicción siguen pendientes. Este incremento no habilita todas las capacidades de DERCAS ni acredita integración con ESP32 real. Cualquier continuación necesita autorización específica.
