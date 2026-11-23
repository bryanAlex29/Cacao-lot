# Fase 5.8 — Historial de riego observado

Avanza RF-07 sin controlar hardware ni afirmar sesiones físicas. Reutiliza `readings`, que conserva estados normalizados, origen, tiempos y unicidad dispositivo/evento. **Sin migración, tablas nuevas, backfill, cambios de configuración ni dependencias.**

## API

`GET /api/v1/plots/:id/irrigation-events` exige JWT del propietario ADMIN/FARMER. Query: `deviceId`, `source=real|demo` (real por defecto), `from`, `to`, `limit` (1–100, defecto 20), `offset`. Máximo 31 días; defecto últimas 24 h; fechas con zona horaria. Varios equipos del mismo origen exigen selección. DEMO respeta `SourcePolicy`. Equipo deshabilitado conserva historial; parcela archivada/ajena o usuario inactivo bloquean acceso.

`Page<ObservedIrrigationEvent>` devuelve UUID de lectura, `eventId`, parcela/dispositivo/origen, `observedAt`, `receivedAt`, `timestampOrigin`, `kind=initial|change`, `valve` y `previousValve`. OpenAPI documenta el contrato. No expone secretos/secuencias internas.

## Semántica y límites

- `initial`: primera observación disponible, incluso con ambos estados desconocidos; no significa inicio del riego.
- `change`: diferencia respecto al registro inmediatamente anterior, incluyendo transiciones desde/hacia null. False no equivale a null. Relé y feedback se comparan por separado.
- Orden de apertura no acredita válvula abierta ni caudal; feedback solo refleja lo informado por el dispositivo.
- Tiempo efectivo = `recordedAt` si existe; en otro caso recepción. Orden de comparación ascendente; consulta descendente, desempate por recepción y secuencia interna.
- SQL parametrizado con `lag`/`IS DISTINCT FROM`, predecesor anterior al filtro y paginación posterior a comparación. Una sentencia/snapshot para conteo y página, sin descargar todo el histórico en Angular.
- Reintento idéntico no duplica lecturas ni eventos derivados. Rechazo no genera observación.
- Mensajes tardíos pueden cambiar la comparación derivada, no la evidencia. Offset no congela el histórico entre peticiones; actualizar vuelve a primera página.
- Sin cambios no demuestra ausencia de riego: pueden faltar muestras/maniobras intermedias. No se infieren causa, continuidad, duración o volumen entre fechas.
- `irrigation.updated` separado queda pendiente; estado actual sigue por el canal existente y nuevo historial se consulta manualmente. `sensor.status` separado también pendiente.

## Prueba manual

1. Abrir <http://localhost:4200/>, iniciar sesión y entrar al panel de una parcela propia.
2. Elegir dispositivo/origen. **Riego** desplaza al historial conservando sesión/selección, sin recargar el documento.
3. Pulsar **Consultar / actualizar historial** o elegir 24 h/7/30 días. Tabla con hora local, origen temporal, estados anterior/actual, feedback y recepción; páginas de 10 registros.
4. Comprobar «Sin confirmación» con feedback null y DEMO si corresponde. No existen botones de abrir/cerrar válvula.
5. Cambiar dispositivo/origen limpia tabla y cancela solicitudes anteriores; fallo ofrece reintento sin ejemplos ficticios.
6. En móvil, tabla con desplazamiento interno sin ampliar el documento.

Si faltan datos locales, no se inventan. Provisión/envío DEMO requiere confirmación del usuario; comandos existentes en [README](../README.md#telemetría-y-simulación-local). No requiere simulador continuo.

## Archivos y validación

- `backend/src/irrigation/`: controlador/DTO OpenAPI; registro en `TelemetryModule`, selección/permisos/fechas de `TelemetryService`, SQL en `TelemetryRepository`.
- `packages/contracts/src/index.d.ts`: tipo compartido.
- `frontend/src/app/core/irrigation/`: HTTP, validación de respuesta/origen/identidad y timeout.
- `frontend/src/app/features/dashboard/irrigation-history.component*`: tabla, filtros, cancelación, carga/error/reintento y pruebas; integración en dashboard.
- `backend/test/telemetry.integration.ts`: vacío, permisos, duplicados, null, feedback, filtros/predecesor, paginación, desorden/desempate, DEMO, FARMER, actividad y OpenAPI con PostgreSQL temporal.
- `backend/test/dashboard.integration.ts`: navegación, DEMO, tabla, fallo/reintento y móvil en Edge aislado.

Resultados finales en [HANDOFF](HANDOFF.md). Primer intento: expectativa del nuevo test corregida de 100 a 20 (defecto real de `PageDto`), sin cambiar contrato. Primera ejecución de navegador detectó selector global ambiguo «7 días»: se acotó el test previo al grupo de filtros de humedad; la nueva pantalla pasó en ese intento.
