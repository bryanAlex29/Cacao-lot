# Fase 6.2 — Filtros del historial de diagnósticos

## Alcance autorizado

El usuario pidió dejar la conexión con OpenAI para otro momento y autorizó los filtros de historial. **OpenAI queda explícitamente a la espera:** no se configura clave, proveedor externo ni facturación. El análisis continúa con mock, siempre simulado y no concluyente.

En **Mis parcelas → Diagnóstico IA · DEMO → Historial privado**:

- Desde/Hasta en hora local del navegador, convertidos a UTC al aplicar.
- Ambos extremos son inclusivos y filtran `createdAt`, no fecha de finalización/vencimiento.
- Fechas opcionales: ambas vacías consultan todos los registros conservados; si se indica una, son necesarias las dos. Periodo válido/ordenado, máximo técnico de 31 días, consistente con filtros históricos existentes. Se permiten extremos iguales.
- Estado: Todos / Pendiente / Completado / Fallido. Todos omite el parámetro, no se envía `status=all`.
- **Aplicar filtros de diagnósticos** vuelve a la primera página. Editar el borrador no modifica la consulta aplicada.
- **Actualizar diagnósticos**, paginación, alta, consulta de estado y eliminación conservan los filtros aplicados. El periodo es fijo, nunca se recalcula respecto al reloj.
- **Limpiar filtros de diagnósticos** vacía fechas/estado y vuelve a la primera página, sin cambiar parcela, foto sin enviar o análisis abierto.
- Borrador inválido muestra error sin sustituir filtro/resultados. HTTP fallido limpia el listado anterior, conserva filtro/página y permite actualizar sin reenviar fotos.
- Cambiar parcela/salir cancela solicitudes y limpia filtros; no se persisten tras recargar el documento.
- Solo filtra el listado: no altera el formulario de subida ni el resultado abierto. Aplicar/limpiar cierra una confirmación de eliminación aún no ejecutada; no cambia filtros durante una eliminación en curso.

## API y permisos

`GET /api/v1/ai-diagnostics?plotId=<UUID>&limit=10&offset=0&status=completed&from=<ISO-con-zona>&to=<ISO-con-zona>`

`status`, `from` y `to` son opcionales; fechas en pareja. DTO estricto rechaza estados desconocidos, fechas imposibles/sin zona, arrays y campos de suplantación. Servicio comprueba pareja/orden/31 días. La consulta sigue autorizando parcela y cuenta, incluso ADMIN.

El repositorio combina propietario, parcela activa, fechas inclusivas, estado y exclusión de eliminados/vencidos **antes de paginar**. `items` y `total` usan el mismo filtro y una transacción `RepeatableRead`; orden estable por `createdAt DESC, id DESC`. Cada consulta es una instantánea coherente, no una promesa de que los registros no cambien entre páginas por nuevas altas/retención/estado.

Filtros exclusivamente GET: no consumen cuota de análisis, no suben fotos, no llaman al proveedor y no recuperan datos eliminados/vencidos.

## Archivos

- `backend/src/ai-diagnostics/diagnosis.dto.ts`, `.service.ts`, `.repository.ts`, `.controller.ts` y `diagnosis-query.spec.ts`.
- `frontend/src/app/core/ai-diagnosis/ai-diagnosis-api.service.ts`: parámetros tipados y validación de pertenencia de resultados al filtro.
- `frontend/src/app/features/ai-diagnosis/ai-diagnosis.component.{ts,html,css,spec.ts}`: borrador/aplicado separados, cancelación, controles responsive y mensajes.
- `backend/test/ai-diagnosis.integration.ts`, `backend/test/dashboard.integration.ts`.
- README, CONTINUAR, HANDOFF y matriz de requisitos.

Sin migraciones, cambios de esquema, nuevas dependencias o variables de entorno. Se conservan los cambios previos de gestión/IA en `feature/agricultural-management`, sin commit/push. No se modifica `.env`, roles, firmware ni datos de la principal para probar.

## Verificación

**935 pruebas correctas:** 468 Angular, 250 backend, 171 integración PostgreSQL/Socket.IO, 36 navegador Edge y 10 simulador. Build/tipos/lint/smoke correctos. Angular ejecutado en serie con configuración externa temporal, sin ampliar timeouts.

Pruebas nuevas: combinación SQL de fechas/estado, extremos iguales/inclusivos, zona UTC-05:00, paginación real con total filtrado, aislamiento de propietario, expirados/eliminados, validación estricta, borrador inválido, cancelación de consulta anterior, conservación tras refrescar/alta/eliminación y reset por parcela. Edge móvil 390 px verifica el flujo y ausencia de escrituras/subidas. Captura sintética revisada, sin desbordamiento.

Dos intentos iniciales de navegador detectaron problemas de preparación de pruebas, no se ocultaron: copiar cookies de renovación entre contextos dejaba la copia de la página original obsoleta; el contexto implícito de `browser.newPage()` no admite nuevas pestañas. Se usa un contexto explícito y pestañas que comparten la cookie viva, cerrando solo cada pestaña. Seguridad productiva y límites sin cambios. Repetición completa 36/36 correcta. Las bases temporales fueron eliminadas por el runner.

Persisten avisos previos de `pg`, dependencias y finales CRLF documentados en 6.1; no se aplican correcciones forzadas ni formato masivo ajeno.

## Revisión manual

1. Abrir http://localhost:4200/parcelas → **Diagnóstico IA · DEMO** de una parcela propia; actualizar la página si estaba abierta.
2. En el historial, elegir **Completado** y pulsar **Aplicar filtros de diagnósticos**. Revisar resumen «Filtro aplicado».
3. Indicar Desde/Hasta que incluyan la fecha de creación de un diagnóstico existente y aplicar.
4. Actualizar y, si hay más de diez resultados, paginar: fechas/estado aplicados permanecen.
5. Invertir fechas y aplicar: aparece error sin sustituir los resultados del filtro anterior.
6. Pulsar **Limpiar filtros de diagnósticos**: vuelve a primera página, todos los estados/fechas conservadas.
7. Pendiente/Fallido pueden estar vacíos: el mock suele terminar inmediatamente. No se crean fallos o registros artificiales en tu cuenta para llenar esos estados.

Parar para revisión del usuario. Comparación de dos fotografías queda como siguiente incremento posible; OpenAI real continúa en espera hasta autorización explícita de configuración, consentimiento externo y presupuesto.
