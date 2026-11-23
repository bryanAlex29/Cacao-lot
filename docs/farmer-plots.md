# Creación de parcelas por agricultores — 2026-11-22

## Decisión y alcance

El usuario eligió explícitamente que cada agricultor cree sus propias parcelas. Esta actualización de RF-02 sustituye la restricción anterior de alta exclusiva ADMIN, no amplía otros permisos.

- `POST /api/v1/plots` permite ADMIN y FARMER autenticados activos.
- `ownerId` proviene exclusivamente de la sesión. `ownerId`, `role` y campos adicionales del cliente se rechazan; nadie obtiene acceso a parcelas ajenas.
- Nombre y ubicación obligatorios, recortados, máximo 100/200 caracteres; superficie opcional y positiva en m². Sin superficie se guarda null.
- FARMER conserva restricciones para editar/archivar parcelas, provisionar dispositivos, altas de usuarios y configurar rangos. No se promueve ninguna cuenta a ADMIN.
- La nueva parcela no contiene dispositivos, sensores, lecturas ni umbrales predeterminados. Registrar una cuenta tampoco crea parcelas automáticamente.
- Sin migración, nuevas dependencias, cambios de firmware, simulador o datos de la base principal.

## Prueba manual

1. Ir a **Mis parcelas** con la cuenta agricultor. Recargar recupera la sesión válida mediante [cookie HttpOnly](session-renewal.md); si se había iniciado sesión antes de esta corrección, autenticarse una vez para activarla.
2. Completar **Registrar una parcela propia**: nombre, ubicación y superficie opcional en m².
3. Pulsar **Crear parcela**. Se muestra confirmación, se limpia el formulario y se actualiza la lista propia.
4. Abrir su panel: si no se han provisionado equipos, indica que no hay dispositivos. Esto es correcto; crear una parcela no conecta hardware ni crea datos DEMO.

## Archivos y comprobaciones

- `backend/src/plots/plots.controller.ts`: permiso POST y descripción OpenAPI; PATCH/DELETE siguen solo ADMIN.
- `frontend/src/app/features/plots/plots.component.ts/html`: formulario para ambos roles, validación, confirmación y listado actualizado; bloqueo de doble envío mientras guarda.
- `frontend/src/app/features/plots/plots.component.spec.ts`: FARMER/ADMIN, DTO sin propietario, submit real, validación y fallo sin reintento automático.
- `backend/test/security.integration.ts`: persistencia del dueño FARMER, aislamiento incluso frente a ADMIN, rechazo de propietario/rol inyectados, límites de otras escrituras y usuario inactivo. La revalidación de rol con JWT anterior ahora se prueba sobre PATCH reservado a ADMIN.
- `backend/test/dashboard.integration.ts`: alta FARMER desde móvil 390 px, confirmación, fila propia, persistencia de área y panel vacío sin datos inventados, en base temporal.

Resultados de ejecución en [HANDOFF](HANDOFF.md). No se crean parcelas de prueba en la base principal; el usuario realizará su propio registro desde el formulario.
