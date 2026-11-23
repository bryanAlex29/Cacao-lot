# Fase 5.10 — Riego observado en tiempo real

Implementa `irrigation.updated` separado de `telemetry.updated` (DERCAS §§17.3, 17.8 y 18.5) y refresco REST del historial ya consultado. No añade tablas, migraciones, dependencias ni variables de entorno. No cambia firmware, control físico, roles, alertas o simulador.

## Contrato y publicación

`IrrigationUpdatedEvent` en `packages/contracts/src/index.d.ts`:

```typescript
interface IrrigationUpdatedEvent {
  schemaVersion: '1.0';
  plotId: string;
  observation: ObservedIrrigationEvent;
}
```

La observación conserva el contrato REST de 5.8: ID de lectura persistida, `eventId`, parcela/dispositivo/origen, `observedAt`, `receivedAt`, origen temporal, `kind: initial|change`, `valve` y `previousValve`. Ambos estados separan `relayCommandedOpen` y `feedbackOpen`, booleanos o null. La primera observación tiene `previousValve=null`, incluso si sus valores actuales son desconocidos. Null no significa cierre.

La ingesta consulta el último registro dentro de la transacción y bajo el bloqueo del dispositivo. Compara tiempo efectivo, recepción y orden de ingesta, igual que REST. Solo una nueva observación que queda como última y es inicial o cambia relé/feedback genera evento; se publica después del commit. Duplicados, estados iguales, lecturas anteriores, rechazos y rollback no generan este evento. La respuesta HTTP continúa siendo `{ duplicate, reading }`; la proyección interna no se expone.

Socket.IO mantiene JWT, política DEMO y reautorización por propietario/parcela/dispositivo/origen antes de enviar. ADMIN no adquiere acceso ajeno. `telemetry.updated` conserva su contrato agregado y comportamiento. `sensor.status` sigue pendiente.

## Angular y recuperación

- Valida versión, identidad, origen, fechas y estados nullable del evento antes de aceptarlo.
- Usa el evento como invalidación, no aplica directamente su estado al dashboard: REST sigue siendo la autoridad frente a mensajes desordenados.
- La primera consulta del historial continúa siendo manual. Después de activarlo, recibir un evento válido o reconectar vuelve a consultar la primera página del rango móvil seleccionado (24 h/7/30 días).
- Las consultas pendientes se cancelan al refrescar, cambiar selección o destruir el panel. Cambiar parcela/dispositivo/origen limpia el historial y requiere consultarlo nuevamente.
- Conserva errores y reintento, sesión y etiqueta DEMO; no inventa datos si falla REST.

Socket.IO sigue siendo best-effort, sin outbox durable. No se garantiza entrega u orden de publicación. Una lectura antigua aceptada puede cambiar comparaciones históricas derivadas, pero no emite un nuevo evento de estado actual; se puede actualizar manualmente el historial. La reconexión recupera por REST, no reproduce cada mensaje perdido. No se acreditan sesiones físicas, causas, flujo, duración, litros ni ahorro.

## Prueba manual

1. Abrir una parcela propia → Panel de monitoreo → elegir dispositivo y origen. Para la parcela local de prueba, seleccionar **Datos simulados · DEMO**.
2. Menú **Riego → Consultar / actualizar historial**. Comprobar fechas, estado anterior/actual y «Sin confirmación» cuando el feedback es null.
3. Con nuevas observaciones autorizadas de apertura/cierre, comprobar que la tabla se actualiza sin pulsar Actualizar. Un simulador detenido no genera cambios: solicitar autorización antes de enviar otro lote DEMO finito; este incremento no lo inicia automáticamente.
4. Con un emisor autorizado activo, cortar la conexión del navegador, recibir nuevas observaciones y reconectar. El historial consultado recupera la información persistida por REST.
5. Cambiar origen/dispositivo: no deben permanecer filas de la selección anterior. Consultar de nuevo explícitamente.

## Archivos y validación

- `backend/src/irrigation/irrigation-observation*`: proyección pura y pruebas de estados/ordenación.
- `backend/src/telemetry/telemetry.repository.ts`, `telemetry.service.ts`: comparación serializada y publicación postcommit.
- `backend/src/realtime/realtime.service.ts`, `packages/contracts/src/index.d.ts`: evento independiente autorizado y contrato.
- `frontend/src/app/core/irrigation/irrigation-event*`, `core/telemetry/`: validación, listener e invalidación.
- `frontend/src/app/features/dashboard/irrigation-history.component*`, dashboard: refresco REST y cancelación.
- `backend/test/realtime.integration.ts`, `dashboard.integration.ts`: persistencia, aislamiento, rollback, concurrencia, actualización visible y reconexión.

**697 pruebas correctas:** 197 backend, 324 Angular, 141 integración PostgreSQL/Socket.IO, 25 navegador Edge y 10 simulador. Ejecutados `npm test`, `npm run test:integration`, `npm run test:browser` (Edge mediante `BROWSER_EXECUTABLE_PATH`) y `npm run test:simulator`. Lint, typecheck, build, formato y diff correctos. Smoke local: liveness/readiness 200, OpenAPI de salud presente y Angular 200 en localhost:4200. Captura sintética `irrigation-realtime.png` revisada.

Las suites usan bases temporales eliminadas por el runner; no se añadieron fixtures a la principal, no se cambió `.env` ni se reinició el simulador local. Persiste el aviso previo de consultas concurrentes de `pg`, sin modificar dependencias para ocultarlo. Cambios locales sin commit/push; esperar prueba del usuario antes del siguiente incremento.
