# Fase 5.13 — fechas personalizadas del riego observado

## Alcance

En **Riego → Historial del riego observado** se añaden Desde/Hasta en hora local del navegador y **Aplicar fechas al riego**. Reutiliza `historyPeriodFromLocal`: conversión a UTC canónico, fechas válidas y ordenadas, límites inclusivos y máximo 31 días. Se permiten extremos iguales, como en el endpoint existente.

- La primera consulta sigue siendo manual. Aplicar fechas o elegir 24 h/7/30 días consulta expresamente.
- Un periodo personalizado permanece fijo al paginar, actualizar, reintentar, recibir `irrigation.updated` o reconectar (mediante `refreshRevision`). Eventos/reconexión actualizan la primera página por REST.
- Los presets vuelven a ventana móvil; actualizar recalcula sus límites. Paginar conserva la ventana de la consulta previa.
- Cambiar parcela, dispositivo u origen cancela la petición, limpia evidencia/formulario y vuelve a 24 h sin consulta automática. No persiste filtros tras recargar el documento.
- Un borrador inválido muestra error sin sustituir el filtro aplicado ni borrar sus resultados. Un fallo HTTP sí limpia la evidencia anterior y permite reintentar el mismo periodo fijo.
- Los filtros de gráfico/tabla de humedad y CSV permanecen independientes. La sesión renovable y los permisos se conservan.

No se modifican API, contratos, esquema, firmware, roles, rangos, claves ni configuración agrícola. Sin migración ni dependencias. No se inició el simulador contra la base principal; las pruebas de navegador e integración usan sus propias bases temporales, eliminadas al terminar. Los cambios del relé siguen siendo observaciones: no prueban flujo, duración física ni consumo.

## Archivos

- `frontend/src/app/features/dashboard/irrigation-history.component.ts`: formulario reactivo, validación compartida, mensajes de zona horaria y estado fijo/móvil, reset/cancelación.
- `frontend/src/app/features/dashboard/irrigation-history.component.spec.ts`: 11 regresiones adicionales sobre UTC, límites, validación, paginación, refresco, selección y reintento.
- `backend/test/dashboard.integration.ts`: nueva prueba Edge de fechas, paginación real, independencia del gráfico, fallo/reintento y móvil; espera del handshake de renovación antes de avanzar el reloj del test existente.
- `docs/phase-5-13.md`, `docs/HANDOFF.md`, `docs/CONTINUAR.md`: entrega y prueba manual.

## Verificación realizada

**791 pruebas correctas:** 390 Angular, 209 backend, 151 integración PostgreSQL/Socket.IO, 31 navegador Edge y 10 del simulador. Comandos:

```powershell
npm run test --workspace=@cacaosmart/frontend -- --runner-config=C:/Users/Bryan/AppData/Local/Temp/opencode/cacaosmart-vitest-serial.mjs
npm run test --workspace=@cacaosmart/backend
npm run test:integration
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
npm run test:simulator
npm run typecheck
npm run lint
npm run build
npm run smoke
```

La configuración serial y la ruta Edge son locales, no requisitos portables; adaptar al equipo. Docker Desktop se inició y recuperó el PostgreSQL existente sano. API y Angular se reiniciaron para prueba manual: live/ready 200 y frontend 200. Node 22.18.0 compatible; npm global 10.9.3 inferior al recomendado, sin instalaciones ni cambio de lockfile en este incremento.

Intentos iniciales de navegador: faltaban suficientes cambios de relé para paginar (muchas lecturas iguales no equivalen a muchos cambios); se agregaron 12 estados alternos únicamente en la base desechable. También se normalizó el valor de prueba `datetime-local` con segundos `:00` redundantes siguiendo el patrón existente. La prueba previa de renovación esperaba transporte WebSocket, no handshake completo, antes de avanzar el reloj: ahora espera «Conectado», sin aumentar timeouts. Repetición final completa **31/31**. Persiste el aviso previo de consultas concurrentes de `pg`; no se actualizó Prisma ni dependencias.

## Prueba manual y siguiente paso

1. Abrir http://localhost:4200 e iniciar sesión si hace falta.
2. Seleccionar la parcela/dispositivo y origen deseados. Para las lecturas DEMO existentes, seleccionar DEMO y un periodo que incluya su fecha; no hace falta iniciar simulador.
3. Abrir **Riego**, introducir Desde/Hasta separados por no más de 31 días y pulsar **Aplicar fechas al riego**. Debe indicar «Periodo fijo» y mostrar evidencia o «Sin cambios observados».
4. Actualizar y, si hay más de diez cambios, paginar: el periodo fijo no cambia. Probar fechas invertidas o superiores a 31 días: se rechazan sin reemplazar el filtro anterior.
5. Elegir **24 h** para volver al periodo móvil. Cambiar de selección limpia el historial y espera otra consulta manual.

Parar para revisión del usuario. No se hizo commit/push ni se inicia otro módulo. Pendientes posteriores continúan en `docs/CONTINUAR.md`.

## Key Learnings:

1. Para paginar riego observado se necesitan cambios de estado, no solo muchas lecturas.
2. Los filtros fijos no deben recalcularse al recuperar eventos perdidos.
