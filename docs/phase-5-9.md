# Fase 5.9 — Exportación CSV

Implementa RF-12: reportes de telemetría y cambios de riego observado, autorizados por parcela/dispositivo/origen. Sin nuevas tablas, migraciones, dependencias ni variables de entorno. No modifica datos, alertas, umbrales, firmware o simulador.

## API

Con JWT de ADMIN o FARMER propietario:

- `GET /api/v1/plots/:id/reports/readings.csv`
- `GET /api/v1/plots/:id/reports/irrigation-events.csv`

Query: `from` y `to` obligatorios en ISO 8601 con zona horaria, ambos inclusivos; `source=real|demo` (real por defecto) y `deviceId` opcional si existe un único equipo del origen elegido. No admite `ownerId`, paginación ni selección de columnas desde cliente. Comparte selección y permisos de telemetría; varios dispositivos requieren selección explícita. Equipo deshabilitado conserva exportación del historial; parcela archivada/ajena y usuario inactivo no permiten acceso. DEMO exige habilitación backend, sin fallback desde real.

Límites: máximo 31 días y 10000 registros por archivo. Se consulta como máximo un registro adicional para detectar exceso y responder **413**, sin archivo truncado; reducir periodo. Fechas inválidas/campos extra responden 400, sin sesión 401, canal DEMO bloqueado 403, parcela/dispositivo no accesible 404 y selección ambigua 409. Mantiene el rate limit global existente. Es exportación síncrona acotada, no procesamiento masivo/batch.

Respuesta `text/csv; charset=utf-8`, `Content-Disposition: attachment` y `Cache-Control: no-store`. CSV con separador coma, CRLF, BOM UTF-8, todas las celdas entre comillas y comillas internas duplicadas. Valores numéricos conservan unidades; `null` se escribe literalmente, distinto de cero y false. Textos que podrían ejecutarse como fórmulas en una hoja de cálculo reciben prefijo apóstrofo: no basta con entrecomillarlos. Esa protección puede hacer que el identificador textual se vea con apóstrofo al importar como texto; el dato persistido no cambia. No se exportan hashes, credenciales, nombres/correos de usuarios ni payload crudo.

Orden descendente determinista por tiempo efectivo, recepción y orden de ingesta. Un periodo sin registros entrega solamente encabezados; no acredita ausencia de riego. Fechas del CSV en UTC. El selector Angular recibe hora local del navegador y la convierte explícitamente a UTC.

### Lecturas

Incluye parcela/dispositivo/origen, evento, fecha efectiva, fecha de dispositivo (nullable), recepción, origen temporal, tres humedades (%), temperatura (°C), humedad ambiental (%), lluvia binaria, orden del relé, feedback y calidad por campo. No exporta clasificación agronómica reinterpretada con el rango actual. `uncalibrated` sigue sin ser calibración válida.

### Riego observado

Incluye evidencia y comparación de [5.8](phase-5-8.md): primera observación/cambio, estado actual/anterior de relé y feedback y existencia de predecesor. Compara antes de limitar el resultado e incluye el predecesor anterior al periodo. Los mensajes tardíos pueden cambiar comparaciones derivadas. No genera sesiones físicas, causas, duraciones ni litros.

## Prueba manual

1. Abrir una parcela propia → panel de monitoreo.
2. Elegir dispositivo y origen; para los datos locales simulados elegir **Datos simulados · DEMO**.
3. Menú **Reportes**. Usar 24 h/7 días/30 días o establecer **Desde/Hasta (hora local)**.
4. Pulsar **Descargar lecturas CSV** o **Descargar riego observado CSV** y revisar descargas del navegador. El nombre contiene el origen real/demo.
5. Comprobar columnas de origen, fechas UTC, calidad y datos null. En Excel/LibreOffice, importar como CSV UTF-8 delimitado por coma si no se separan automáticamente las columnas.
6. Un periodo vacío produce solo encabezados. Ante 413 reducir las fechas; ante fallo de sesión/conexión revisar y reintentar explícitamente, sin descargas automáticas.

El cambio de parcela/dispositivo/origen y la destrucción del panel cancelan la solicitud pendiente y limpian estado; no descarga una respuesta anterior. Los enlaces Reportes conservan sesión y selección. No requiere mantener el simulador activo para descargar lecturas persistidas.

Las fechas personalizadas de este panel **solo filtran la exportación**; no cambian el periodo mostrado por el gráfico de humedad ni el historial observado. La opción de fechas personalizadas de esos otros paneles sigue pendiente en esta entrega 5.9; el gráfico y su tabla incorporan después un selector independiente en [5.12](phase-5-12.md). Riego observado conserva los presets.

## Archivos y pruebas

- `backend/src/reports/`: módulo, controlador, query DTO, servicio y serialización CSV segura.
- `backend/src/telemetry/telemetry.service.ts`: exportación sobre consultas autorizadas existentes y límite antes de crear archivo.
- `frontend/src/app/core/reports/`: HTTP autenticado Blob con timeout/validación de MIME y descarga mediante URL temporal revocada después de iniciar descarga.
- `frontend/src/app/features/dashboard/reports-panel.component*`: UI/filtros, cancelación y pruebas; dashboard incorpora panel y navegación.
- Pruebas unitarias CSV: comillas/saltos/fórmulas, null/false/cero/negativos, periodo vacío y exceso de registros; Angular valida filtros, doble clic, cambio de selección y respuestas/fallos.
- Integración PostgreSQL/HTTP: contenido y cabeceras, permisos, origen, periodo, campos extra y datos DEMO.
- Navegador Edge: FARMER descarga ambos CSV reales desde el entorno sintético, verifica contenido de archivos, periodo vacío, error/reintento, sesión y móvil sin desbordamiento.

Resultados finales en [HANDOFF](HANDOFF.md). Las primeras comprobaciones detectaron selectores de pruebas antiguos que contaban todos los inputs del dashboard (ahora hay campos de fechas), normalización de segundos cero al rellenar datetime-local en Playwright y un fixture histórico que cambiaba el predecesor de otra prueba. Se acotaron selectores, se usó formato de fecha aceptado por el navegador y se aisló el fixture; no se deshabilitaron permisos ni aserciones de negocio.
