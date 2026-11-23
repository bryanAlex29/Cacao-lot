# Fase 5.12 — Fechas personalizadas del histórico de humedad

Completa el selector de fechas de RF-06/RF-IA-05 para el gráfico A/B/C y su tabla de lecturas. Reutiliza REST y permisos existentes; sin cambios de API, contratos IoT, esquema, migraciones, dependencias o entorno. Riego observado y reportes mantienen filtros independientes.

## Uso manual

1. Abrir una parcela propia → Panel de monitoreo. Para los datos locales de demostración, seleccionar **Datos simulados · DEMO** y el dispositivo existente.
2. Menú **Historial**. El enlace conserva sesión, parcela, dispositivo y origen; desplaza y enfoca la sección incluso al repetir clic.
3. En **Desde del historial (hora local)** y **Hasta del historial (hora local)**, elegir un periodo con lecturas existentes. Para revisar el lote local ya guardado, incluir el día en que se envió; no hace falta iniciar el simulador.
4. Pulsar **Aplicar fechas al historial**. Se muestra «Periodo fijo», fechas aplicadas y zona horaria del navegador. El gráfico y la tabla consultan ese intervalo; las tarjetas superiores siguen mostrando la última medición.
5. **Más antiguas / Más recientes** pagina de 100 en 100 sin mover los límites del periodo fijo. Actualizar, reconectar o recibir nuevos eventos tampoco mueve esas fechas; una lectura nueva solo entra si su fecha efectiva pertenece al intervalo.
6. Un periodo vacío muestra «Sin lecturas en este intervalo». Un fallo muestra indisponibilidad, no ausencia de registros; revisar sesión/conexión y pulsar **Actualizar** para reintentar.
7. **24 h / 7 días / 30 días** vuelve a una ventana móvil. Cambiar parcela, dispositivo u origen limpia el periodo personalizado y vuelve a 24 h; no conserva filas ni borradores de otra selección.

## Validación y semántica

- Desde/Hasta se interpretan en la zona local del navegador y se convierten a UTC ISO canónico antes de consultar. No se asume Ecuador ni se modifica la zona del sistema.
- Admite segundos y un instante único (`from=to`), como REST. Ambos extremos son inclusivos. Máximo **31 × 24 horas**, no 31 días de calendario si hay cambios de horario estacional.
- Valida campos vacíos, formato, calendario imposible, horas locales inexistentes, orden y duración. Hace round-trip de la fecha local para no normalizar silenciosamente un 30 de febrero o un salto de horario. Las horas ambiguas durante un cambio estacional usan la interpretación nativa del navegador; el intervalo UTC elegido queda fijo.
- Editar campos no dispara solicitudes ni cambia el periodo aplicado. Un intento inválido conserva el filtro vigente y muestra error. Volver a un preset limpia borrador/error aunque ya estuviera activo.
- Al aplicar o paginar se cancela inmediatamente la petición anterior y se vacían las filas, antes del debounce de refresco. No aparece una respuesta tardía bajo fechas nuevas. Se distinguen consulta pendiente, error y resultado vacío.
- Reconectar mantiene periodo fijo y vuelve a la primera página; los presets se recalculan como ventanas móviles. Cambiar de selección o cerrar sesión limpia el periodo. No se introduce persistencia en localStorage ni cambios a la sesión.
- Mantiene el historial de rangos **por vigencia**, tres series, discontinuidades, calidad y origen. No aplica el rango actual al pasado ni agrega consumos, duración o predicciones.

## Archivos

- `frontend/src/app/core/telemetry/history-period.ts` y `.spec.ts`: conversión local/UTC y validación.
- `frontend/src/app/core/telemetry/telemetry.facade.ts` y `.spec.ts`: periodo fijo/móvil, cancelación y paginación.
- `frontend/src/app/features/dashboard/history-period.component.ts` y `.spec.ts`: formulario accesible, presets y estado aplicado.
- `dashboard.component.html`, `.ts` y `.spec.ts`: integración y enlace Historial con RouterLink, preservación de query y foco.
- `soil-history-chart.component.ts` y `.spec.ts`: distinción entre carga, fallo y periodo vacío.
- `backend/test/dashboard.integration.ts`: regresiones de navegación y fechas reales en navegador, sin cambiar código backend de producción.

## Verificación

Confirmadas **764 pruebas correctas: 207 backend, 373 Angular, 145 integración PostgreSQL/Socket.IO, 29 navegador Edge y 10 simulador**. Tipos, lint y build correctos. Angular ejecutado en serie con configuración temporal externa, sin cambiar timeouts/configuración del proyecto. El comando conjunto de tests/build agotó su tiempo después de aprobar las pruebas; `npm run build` se repitió por separado y finalizó correctamente. Integración completa repetida; todas sus bases temporales fueron eliminadas. Permanece el aviso previo de consultas concurrentes de `pg`, sin cambiar dependencias para ocultarlo.

Navegador confirma fechas UTC exactas con dispositivo/origen, más de 100 registros y paginación sin mover límites, actualización fija, validación de exceso, periodo vacío, fallo 503 y reintento, última medición visible, navegación sin recarga y móvil 390 px sin desbordamiento. Captura sintética `history-period-mobile.png` revisada; base temporal eliminada sin tocar la principal. Ver resultados finales en [HANDOFF](HANDOFF.md).

No se han enviado nuevas lecturas a la parcela del usuario ni iniciado el simulador. Sin cambios de roles, rangos, márgenes, firmware o publicación Git. Esperar revisión manual antes de otro incremento; las fechas personalizadas del historial de riego observado siguen pendientes.

Comprobación final: lint, formato global y `git diff --check` correctos; smoke liveness/readiness 200 y OpenAPI de salud presente; Angular localhost:4200 responde 200. Ejecutados tests backend, Angular, integración completa, navegador y simulador, tipos y build. No quedan pruebas en segundo plano pendientes para esta entrega.
