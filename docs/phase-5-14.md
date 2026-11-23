# Fase 5.14 — Inventario visual de dispositivos y sensores

## Alcance

Desde **Mis parcelas → Ver dispositivos y sensores**, ADMIN y FARMER propietarios pueden consultar el inventario ya existente. Es un paso acotado de la gestión visual, no provisión ni reasignación de equipos.

- Un panel abierto por vez, dentro de la tarjeta de la parcela, sin navegar ni perder sesión.
- Consulta manual al abrir, paginación de diez dispositivos y actualización de la página seleccionada. Sin cargar todos los equipos de la cuenta ni consultar parcelas cerradas.
- Serie, origen **REAL/DEMO**, habilitación, conexión al consultar, último contacto e intervalo esperado. La fecha se presenta en hora local del navegador.
- Desplegable de sensores con identidad, código, zona registrada, unidad y habilitación. Suelo A/B/C, temperatura, humedad ambiental y lluvia se distinguen; lluvia booleana no se convierte en milímetros.
- Carga, inventario vacío, error y reintento explícitos, sin fallback DEMO. No se completan sensores faltantes ni se inventan lecturas.
- Cerrar el panel, abrir otro o actualizar la lista de parcelas destruye el panel anterior y cancela su consulta. Cambiar el `plotId` del componente también cancela y reinicia su paginación.

**Habilitado no significa conectado.** Es un inventario REST con estado **al consultar**, no una vista Socket.IO ni una confirmación de instalación física, calibración, calidad de lecturas o flujo de agua. Pulsar Actualizar para renovar la información.

## Seguridad y límites

Reutiliza `GET /api/v1/plots/:plotId/devices?limit=10&offset=...`, que ya valida JWT, actividad y propiedad incluso para ADMIN. La interfaz no introduce roles ni acceso global.

El cliente valida pertenencia a parcela, metadatos de página, códigos/variables/unidades, fechas y duplicados. Conserva solo los campos públicos necesarios y descarta metadatos adicionales, incluidas posibles claves ajenas al contrato de lectura. El backend existente no devuelve claves ni hashes en este endpoint.

**Sin POST/PATCH/DELETE desde el inventario.** No se crean dispositivos/sensores ni se cambian habilitaciones, intervalos, claves, roles, propietarios, rangos o firmware. La API de provisión/habilitación ADMIN propietario permanece como estaba; la asignación de equipos a agricultores ajenos al administrador sigue pendiente de un flujo y permisos explícitos. Una parcela FARMER nueva sin dispositivos seguirá vacía.

No hay migración, cambios de contratos HTTP, dependencias, variables de entorno ni datos nuevos en la base principal. No se inició el simulador principal ni se publicó código.

## Archivos

- `frontend/src/app/core/devices/devices-api.service.ts`: modelo público tipado, consulta acotada con timeout y validación/proyección de respuesta.
- `frontend/src/app/features/plots/device-inventory.component.ts`: panel de solo lectura, estados, sensores, paginación y cancelación.
- `frontend/src/app/features/plots/device-inventory.component.spec.ts`: 27 pruebas de datos, validación, separación, cancelación, paginación y reintentos.
- `frontend/src/app/features/plots/plots.component.ts`, `.html`, `.css`, `.spec.ts`: acceso y cierre por parcela; tres pruebas de integración de componente para ADMIN/FARMER y actualización de parcelas.
- `backend/test/dashboard.integration.ts`: dos pruebas Edge, una por rol, con API/PostgreSQL temporales, seis sensores, lectura sin secretos/escrituras, error/reintento y móvil.
- `docs/phase-5-14.md`, `docs/HANDOFF.md`, `docs/CONTINUAR.md`, `docs/requirements-status.md`: estado y traspaso.

## Validación de este incremento

**453 pruebas correctas ejecutadas: 420 Angular + 33 navegador Edge.** Tipos, lint, build, formato/diff y smoke correctos. La validación anterior 5.13 de backend (209), integración (151) y simulador (10) no se volvió a ejecutar en este incremento frontend; no se suman como ejecuciones nuevas. La suite de navegador conserva las regresiones de sesión, fechas, dashboard, alertas, CSV, creación de parcelas y sidebar.

```powershell
npm run test --workspace=@cacaosmart/frontend -- --runner-config=C:/Users/Bryan/AppData/Local/Temp/opencode/cacaosmart-vitest-serial.mjs
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
npm run typecheck
npm run lint
npm run build
npm run smoke
npm run format:check
git -c core.autocrlf=false diff --check
```

Las rutas serial/Edge son locales y deben adaptarse a cada equipo. Se revisó una captura sintética móvil (390 px) y el test verifica ausencia de desbordamiento. Las bases temporales del navegador se eliminaron; la principal no recibió fixtures. Los servicios locales continúan disponibles.

Correcciones de pruebas durante el desarrollo: `NodeList` no era iterable con las librerías TypeScript de tests, se utilizó `Array.from` sin modificar tsconfig. El primer navegador terminó 31/33 porque el test comprobaba `count()` inmediatamente después del clic de cierre, antes del render Angular; ahora espera el desmontaje real (`detached`), sin ampliar timeouts ni cambiar el comportamiento de producción. Repetición completa **33/33**. Persiste el aviso previo de consultas concurrentes de `pg`.

## Prueba manual

1. Abrir http://localhost:4200 e iniciar sesión; ir a **Mis parcelas**.
2. En una parcela, pulsar **Ver dispositivos y sensores**. Debe consultar solo su inventario o indicar que está vacío.
3. Revisar origen y último contacto; abrir **Sensores registrados**. Comprobar códigos, zonas y habilitación, no porcentajes de humedad ni controles de válvula.
4. Pulsar **Actualizar dispositivos**. Si hay más de diez equipos, usar la paginación.
5. Ocultar el panel o abrir otra parcela: no deben quedar datos de la anterior. La sesión y el enlace al monitoreo se conservan.

Esperar revisión del usuario antes de otro incremento. Próximos pasos posibles: edición/archivo de parcelas propias para ADMIN o provisión visual de dispositivos con manejo seguro de clave de un solo uso. No habilitar creación FARMER ni acceso ADMIN global por inferencia.
