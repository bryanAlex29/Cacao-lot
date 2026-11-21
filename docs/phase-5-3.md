# Fase 5.3 — Edición visual de rangos para ADMIN propietario

## Alcance autorizado

Únicamente formulario de mínimo/máximo por sensor, validación, guardado con la API/auditoría existente, aviso de conflicto de versión y actualización de las tarjetas. No se añaden clasificación, líneas del gráfico, alertas, cambios de firmware ni nuevos permisos. El usuario exige autorización previa para cualquier cambio adicional.

La cuenta de uso local conserva su rol FARMER; este incremento no la promueve ni crea un administrador en la base principal. La función se verifica con cuentas ADMIN sintéticas en bases temporales.

## Uso y permisos

En el dashboard, **ADMIN propietario** ve «Configurar rango» en las tres sondas, temperatura y humedad ambiental cuando la consulta de configuración finalizó correctamente. No se muestra para lluvia booleana, recursos deshabilitados, errores de consulta o sesión FARMER.

El botón abre un diálogo nativo con nombre del sensor, origen real/DEMO, unidades y los valores actuales. Un rango inexistente abre campos vacíos, sin proponer umbrales agronómicos. La vigencia y calibración no se editan desde el formulario.

- Porcentajes: `0 ≤ mínimo < máximo ≤ 100`.
- Temperatura: `-50 ≤ mínimo < máximo ≤ 100 °C`, conforme a los límites técnicos ya existentes.
- Se rechazan campos vacíos, números no finitos, valores fuera de límite y mínimo igual/mayor al máximo antes del PUT; el backend mantiene su validación y autorización propias.
- El guardado envía exclusivamente variable, unidad, mínimo, máximo y `expectedVersion`. Sensor UUID, parcela/dispositivo/origen se toman de la selección autorizada; el cliente no envía propietario, actor, fecha ni rol.
- El backend conserva la comprobación ADMIN + propiedad, transacción y auditoría de fase 5.1. Un botón oculto no sustituye esa seguridad.

Al guardar se impiden envíos duplicados y se deshabilita Cancelar/Escape mientras llega la respuesta. Un guardado confirmado cierra el diálogo, muestra confirmación y reconsulta solo los rangos, no toda la telemetría. Antes de refrescar se cancelan GET que pudieran haberse iniciado antes del commit, para que no repinten una versión anterior.

## Concurrencia y errores

El formulario conserva la versión que tenía al abrirse: el polling del dashboard no reemplaza lo que el usuario está editando.

Ante **409**, se conserva el borrador y se bloquea otro guardado. «Consultar rango actual» obtiene los valores y versión del servidor, mostrándolos sin reemplazar el formulario. Solo la acción explícita «Usar rango actual en el formulario» reemplaza los valores y adopta la nueva versión; después se pueden revisar/editar y guardar. No se fuerza ni reintenta una sobrescritura automática.

Un error de red, timeout o respuesta de PUT inconsistente no permite asegurar si el servidor llegó a guardar. Se explica esa incertidumbre, se conserva el borrador y se exige consultar el rango antes de un nuevo intento. No hay reintentos automáticos de escrituras. Si falla también la consulta de recuperación, sigue bloqueado el guardado y se conserva lo escrito.

Errores 401/403/404 informan de sesión/permisos/recurso y no intentan elevar el rol. Cancelar antes de enviar no modifica nada. Cambiar selección, salir o destruir la pantalla cierra el editor y libera suscripciones; abortar una solicitud HTTP no garantiza revertir una operación que el servidor ya hubiera confirmado.

## Archivos afectados

- `frontend/src/app/features/dashboard/sensor-range-editor.component.{ts,html,css,spec.ts}`: diálogo, formulario, validación, guardado, recuperación y pruebas.
- `frontend/src/app/features/dashboard/sensor-range.component.ts`, `soil-sensor-card.component.ts`: botón condicionado a ADMIN y eventos de apertura.
- `frontend/src/app/features/dashboard/dashboard.component.{ts,html,spec.ts}`: selección segura del sensor, cierre/limpieza, confirmación y refresco.
- `frontend/src/app/core/sensor-thresholds/`: cliente PUT reutilizando validación de respuestas GET, tipo de selección para el editor, cancelación de lecturas anteriores al guardado y pruebas.
- `backend/test/dashboard.integration.ts`: comprobaciones de navegador ADMIN y ausencia del botón FARMER en base temporal; **ningún cambio al backend de negocio**.
- `README.md`, `docs/HANDOFF.md`, este documento: estado y uso de la función.

No se modifican esquema/migraciones, contratos públicos de ingesta/eventos, firmware, roles de cuentas locales, `.env` ni datos de negocio principales. No se instalan dependencias ni se publica/despliega.

## Pruebas

```powershell
npm run lint
npm run typecheck
npm run test --workspace=@cacaosmart/frontend
npm run test --workspace=@cacaosmart/backend
npm run test:integration
npm run test:simulator
npm run build
npm run smoke
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

Cobertura nueva: creación con versión 0, edición con versión vigente, validación, cero/temperatura negativa, bloqueo FARMER, doble clic, cancelación, conflicto sin pérdida del borrador, consulta y elección explícita de valores actuales, errores 401/403/404/red, respuestas de PUT inconsistentes y cancelación de GET anteriores al commit. El navegador verifica guardado ADMIN propietario, persistencia y auditoría, conflictos reales de versión, actualización de tarjetas y diálogo móvil.

La matriz de navegador supera 60 solicitudes/IP y desactiva el guard de rate limit **solo en su aplicación de prueba**. JWT, rol, propiedad, validación y auditoría siguen activos. La suite `security.integration.ts` conserva y verifica el rate limit real del producto. Todas las fixtures y sus cambios se limitan a bases temporales generadas por el runner.

Los archivos del incremento se formatean y verifican por separado; no se reformatea el resto del repositorio por los avisos CRLF anteriores.

Resultado: **294 pruebas correctas — 109 Angular, 97 backend, 73 integración PostgreSQL/Socket.IO, 10 navegador Edge Chromium y 5 simulador**. Son 31 pruebas Angular y 3 de navegador nuevas respecto a fase 5.2. Lint, tipos, compilación y smoke de salud correctos. Se revisaron capturas del diálogo a 390 px y del conflicto a 1440 px. La primera ejecución de navegador requirió ajustar la espera del render del diálogo; la repetición completa pasó los diez casos.

## Pendiente

Esperar autorización para cualquier nuevo cambio. Clasificación, líneas del gráfico y alertas no forman parte de esta entrega. El simulador se dejó detenido durante esta entrega; **posteriormente el usuario autorizó su corrección/reinicio y la promoción de su cuenta local a ADMIN**. Se corrigió la recuperación de cortes temporales según [fase 3](phase-3.md#recuperación-de-cortes-temporales-corrección-posterior), sin modificar los permisos por propietario. Renovar la sesión muestra el rol actualizado en Angular; no se cambian contraseñas ni se versionan datos de la cuenta.
