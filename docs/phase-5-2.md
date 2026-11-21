# Fase 5.2 — Consulta de rangos en el dashboard

Este documento conserva el alcance de la entrega 5.2. La edición visual ADMIN se añadió después en [fase 5.3](phase-5-3.md), sin cambiar los permisos de FARMER ni añadir clasificación o líneas de umbral.

## Resultado y uso

Desde **Mis parcelas → Panel de monitoreo**, seleccionar dispositivo y origen. Las tarjetas de las tres sondas, temperatura y humedad ambiental consultan los rangos de la API de fase 5.1, por UUID de sensor del inventario autorizado del dispositivo.

Cada tarjeta muestra mínimo/máximo con unidad, vigencia, versión y hora de consulta local cuando existe configuración. Se conservan los colores verdes y las tarjetas existentes. La lluvia booleana no muestra ni consulta rangos numéricos.

Los estados son explícitos:

- Sin selección: «Selecciona un dispositivo para consultar rangos».
- Carga: «Consultando rango…».
- GET correcto con `threshold: null`: «Sin rango configurado».
- Configuración existente: «Rango configurado · solo monitoreo» y sus valores reales de configuración.
- Sensor/dispositivo deshabilitado en el inventario: rango no disponible, sin GET innecesario.
- Error HTTP, inventario ausente/ambiguo/incompatible o respuesta de otra identidad: «No se pudo consultar el rango»; nunca se interpreta como ausencia de configuración.

**No se crean valores de ejemplo ni rangos por defecto.** Si la base local no tiene rangos, se mostrará su ausencia después de una consulta correcta. Los valores de las pruebas de navegador son exclusivamente fixtures en una base temporal, no recomendaciones agronómicas ni datos introducidos en la base principal.

## Separación de responsabilidades y seguridad

- `SensorThresholdsApi` solo hace GET; reutiliza el interceptor JWT existente y la autorización del backend. ADMIN y FARMER propietarios ven la misma información de solo lectura, sin ampliar permisos.
- Verifica que sensor, dispositivo, parcela, origen, variable y unidad de la respuesta correspondan a la selección. Rechaza rangos malformados, sin inventar sustitutos ni cambiar a DEMO.
- `SensorThresholdsFacade` tiene ámbito por dashboard y un ciclo independiente de `TelemetryFacade`. Un fallo al consultar configuración no cancela snapshot, histórico o Socket.IO ni oculta las mediciones.
- Cada consulta de sensor tiene timeout de 8 segundos y manejo de error propio; los demás resultados se conservan dentro del mismo lote de cinco consultas.
- Cambiar parcela, dispositivo u origen cancela las consultas anteriores y limpia la configuración; las respuestas tardías no contaminan otra selección. Logout, caducidad de sesión y destrucción de la pantalla liberan suscripciones y timers.
- DEMO continúa sujeto a los permisos y `SourcePolicy` del backend y al banner explícito del dashboard. No se consulta un inventario paralelo ni se convierten datos reales ausentes en simulados.

## Actualización y recuperación

Los rangos se consultan al seleccionar equipo, al conectar/reconectar el canal, mediante **Actualizar**, con **Reintentar rangos** si hay errores y cada **60 segundos**. Se agrupan disparadores próximos en 100 ms y se cancelan lotes anteriores al iniciar una nueva consulta.

No se vuelven a consultar cinco rangos en cada `telemetry.updated`: con un simulador cada 5 s eso añadiría 60 solicitudes/minuto solo de configuración, además de las lecturas. La configuración se mantiene separada del refresco de telemetría, sin introducir un nuevo evento WebSocket ni reutilizar el evento canónico con otro payload.

Una consulta nueva muestra carga; si falla, se oculta el rango anterior y se informa del error, en lugar de presentarlo como configuración vigente recién confirmada. **Reintentar rangos** solo reconsulta configuración, sin recargar telemetría ni la página.

## Límites de este incremento

- Solo consulta y presentación: **sin formulario, PUT desde Angular, clasificación bajo/en rango/alto, alertas ni líneas de umbral en el gráfico**.
- Configurar un rango no prueba calibración ni validación agronómica. Se conservan «Sin calibrar», «Sin datos», antigüedad y estados de conexión de las lecturas. El gráfico aclara que los rangos se consultan en tarjetas y todavía no se trazan allí.
- No se reclasifica el histórico ni se mezclan rangos actuales con lecturas históricas como si hubieran estado vigentes entonces.
- No se modificaron schema, migraciones, API de rangos, firmware, calibración, ingesta, `telemetry.updated`, reglas de riego o credenciales.
- No hay notificación instantánea de cambios de configuración: cambios hechos por API se recuperan en la próxima consulta manual, reconexión o ciclo de 60 s. Una futura edición visual podrá refrescar después de guardar.
- El inventario usado es el de los dispositivos cargados. Una modificación posterior de habilitación se refleja como error de acceso en el siguiente GET; volver a cargar el listado permite conocer el inventario actualizado.

## Archivos afectados

- `frontend/src/app/core/sensor-thresholds/`: tipos de presentación, cliente GET, fachada y pruebas.
- `frontend/src/app/features/dashboard/sensor-range.component.ts`: bloque reutilizable de rango/estado.
- `frontend/src/app/features/dashboard/soil-sensor-card.component.ts`: rango independiente de cada sonda.
- `frontend/src/app/features/dashboard/dashboard.component.ts`, `.html`, `.spec.ts`: selección, sensores ambientales, actualización, limpieza y pruebas.
- `frontend/src/app/features/dashboard/soil-history-chart.component.ts`: aclaración de texto; no añade líneas.
- `backend/test/dashboard.integration.ts`: fixtures autorizados en base temporal y dos comprobaciones nuevas de navegador. El propietario configura las fixtures como ADMIN y pasa a FARMER antes del login de prueba.
- `README.md`, `docs/HANDOFF.md`, este documento y enlace desde `docs/phase-5.md`.

No se sobrescribieron los cambios previos de fase 5.1 ni del botón «Volver a mis parcelas». No se agregaron dependencias.

## Verificación

Comandos ejecutados:

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

Las pruebas unitarias se ejecutaron mediante los scripts de test de cada workspace. **260 pruebas correctas: 97 backend, 78 Angular, 73 integración PostgreSQL/Socket.IO, 7 navegador Edge Chromium y 5 simulador.** Se agregaron 33 pruebas Angular y 2 de navegador respecto a fase 5.1.

Cobertura nueva: cinco identidades cuantitativas, exclusión de lluvia, unidades, cero, ausencia explícita, errores parciales, timeout, respuesta de otro origen/dispositivo/parcela, cancelación al cambiar selección, polling, reintentos, reconexión, limpieza al destruir/logout y presentación sin formularios ni calibración ficticia. El navegador comprueba login FARMER, rangos DEMO, fallo de un rango sin perder lecturas, recuperación y continuidad del recorrido simulador → API → PostgreSQL → Socket.IO → Angular.

Lint, tipos, compilación y smoke de salud correctos. Prettier se aplica y verifica en archivos del incremento; persiste la advertencia global de finales CRLF en archivos anteriores, sin reformatear todo el repositorio. Las capturas sintéticas de escritorio 1440 px y móvil 390 px se revisaron; móvil sin desbordamiento. Son comprobaciones puntuales, no una auditoría completa de accesibilidad.

Las suites de integración/navegador usaron sus bases temporales y las eliminaron al terminar; no se crearon cuentas, dispositivos, rangos ni lecturas de prueba en la base principal, ni se modificó `.env`.

## Siguiente paso

Esperar instrucción. Un próximo incremento posible es el **formulario de edición ADMIN**, reutilizando `expectedVersion`, permisos y auditoría de fase 5.1. Acordar por separado clasificación y líneas de umbral; no implementar todo junto con alertas, riego o reportes.
