# Traspaso de trabajo — CacaoSmart IoT

**Entrega actual para Bryan (2026-11-24):**
[guía de avance, instalación, pruebas y Git](ENTREGA_BRYAN.md) y
[prompt para auditar antes de desarrollar](PROMPT_BRYAN.md).
Word en raíz: `CacaoSmart_Avance_y_Traspaso_Bryan.docx`.
La renovación visual 1–6 y Clima ya están implementados localmente; consultar
la guía y el inicio de CONTINUAR antes de interpretar pendientes históricos de
este archivo. No recrear IA/clima ni asumir que están publicados en main.

Guía resumida para el siguiente colaborador: [CONTINUAR.md](CONTINUAR.md). Incluye funciones disponibles, pendientes, comandos de actualización y migración, y los datos privados que no se transfieren por GitHub. Los registros históricos de abajo que dicen «local/sin commit» describen su momento de validación; consultar el historial Git para el estado de publicación.

## Punto de partida

**Entrega local 6.3 — comparación de fotos:** usuario autorizó «Haz ese incremento». Selección máxima de dos IDs del historial de una parcela; tarjetas privadas con metadata fresca, JPEG autorizado, fechas, notas y resultados DEMO; intercambio, quitar y limpiar. Conserva selección al filtrar/paginar, limpia por cambio de parcela/salida/eliminación. Expiración automática, cancelación y revocación de URL blob. No identifica plantas ni determina mejoría. Sin endpoints, migración o dependencias; OpenAI pospuesto. **960 pruebas aprobadas: 492 Angular + 250 backend + 171 integración + 37 Edge + 10 simulador**; build/tipos/lint correctos. [Guía, incidencias de pruebas y aceptación manual](phase-6-3.md). Sin commit/push/despliegue.

**Entrega local 6.2 — filtros del historial IA:** usuario pidió dejar OpenAI para otro momento y autorizó filtros por fecha/estado. Desde/Hasta inclusivos por creación, opcionales en pareja, máximo 31 días, hora local→UTC; estado opcional pending/completed/failed, total y filas filtrados antes de paginar con RepeatableRead. Borrador/aplicado separados, filtros conservados tras actualización/paginación/alta/eliminación, limpieza y cancelación por selección/logout. Sin migración/dependencias/cambios privados ni fixtures en principal. **935 pruebas correctas: 468 Angular + 250 backend + 171 integración + 36 Edge + 10 simulador**; build/tipos/lint/smoke correctos. Ver [revisión manual y límites](phase-6-2.md). Mantener OpenAI pendiente, no activar proveedor externo ni gastar tokens. Sin commit/push.

**Entrega local 6.1 — diagnóstico fotográfico simulado:** usuario revisó/aprobó 5.15–5.16 y autorizó comenzar IA. Ruta `/diagnostico-ia` por parcela propia ADMIN/FARMER: captura/subida, vista previa, consentimiento demo-v1 y retención máxima aceptada, sanitización sharp sin EXIF, JPEG privado, resultado mock siempre no concluyente, historial/eliminación, cuota diaria serializada e idempotencia. **Sin OpenAI, costos, diagnóstico real ni controles de válvula.** Ver [alcance y prueba manual](phase-6-1.md). Migración aditiva `20261124010000_ai_diagnoses` aplicada localmente con 14 tablas anteriores y `.env` verificados idénticos; cero fixtures en principal. Conserva cambios de gestión y rama `feature/agricultural-management`, sin commit/push. Pendiente revisión manual 6.1; estados inferiores son históricos.

**Validación de 6.1: 900 pruebas correctas** — 459 Angular, 233 backend, 163 integración PostgreSQL/Socket.IO, 35 Edge y 10 simulador. Build/tipos/lint/Prisma correctos; live/ready y frontend disponibles. Angular con configuración serial temporal externa. Integración completa demoró más de 240 s, terminó en segundo plano correctamente y limpió sus ocho bases. Edge verifica selección sin envío, consentimiento, imagen privada, historial/recarga, pérdida de respuesta con reintento idempotente, cancelación/eliminación y móvil 390 px sin desbordamiento. Se corrigió exportación faltante de PlotsService detectada en el primer intento; también una fixture Blob inválida y la aserción antigua de tarjeta IA pendiente, sin ocultar fallos ni ampliar timeouts.

**Entrega local posterior 5.15–5.16:** usuario aprobó manualmente 5.13/5.14 y autorizó continuar con gestión. ADMIN propietario dispone de alta visual de dispositivos con clave efímera mostrada una vez, habilitación confirmada y edición/archivo lógico de parcelas. No amplía permisos FARMER ni asigna recursos ajenos. Rama `feature/agricultural-management`, sin commit/push. Sin migraciones, dependencias ni fixtures en principal. 446 Angular + 209 backend + 151 integración + 34 Edge + 10 simulador = **850 pruebas**; tipos/lint/build/smoke correctos. Ver [guía y límites](phase-5-15-16.md). Pendiente revisión manual del usuario; los estados anteriores más abajo son históricos.

**Entrega para GitHub autorizada por el usuario tras 5.14:** este código incluye 5.13 (fechas del riego) y 5.14 (inventario visual de equipos/sensores). Guía actualizada en [CONTINUAR.md](CONTINUAR.md), sin nuevas migraciones/dependencias respecto a `3ba7bf4`. Los párrafos «local/sin commit/push» de abajo conservan el registro del momento en que se probaron; consultar Git para el estado de publicación. No confundir autorización para publicar con confirmación de prueba manual ni con autorización para ampliar permisos o comenzar otro módulo.

**Actualización local 5.14:** inventario visual de dispositivos/sensores en **Mis parcelas → Ver dispositivos y sensores**, ADMIN/FARMER propietarios, solo GET, página de diez equipos y etiquetas REAL/DEMO. Estado al consultar (no en vivo), seis tipos de sensores, habilitación/último contacto, carga/vacío/error/reintento y cancelación al cerrar/cambiar. Sin provisión, reasignación, escrituras, migración o claves. **453 pruebas ejecutadas correctas: 420 Angular + 33 Edge**, tipos/lint/build/smoke correctos; suites backend/integración/simulador de 5.13 no se repitieron. Ver [fase 5.14 y prueba manual](phase-5-14.md). Usuario dijo «ok continuemos» tras 5.13; autoriza avanzar, no acredita una prueba manual específica. Cambios 5.13 preservados, ambos incrementos aún sin commit/push; parar para revisión de 5.14.

**Actualización local 5.13:** fechas Desde/Hasta del riego observado, máximo 31 días y UTC canónico; periodo fijo conservado al paginar/actualizar/eventos/reconexión. Presets móviles y cambio de selección vuelve a 24 h con consulta manual. **791 pruebas correctas** (390 Angular, 209 backend, 151 integración, 31 Edge, 10 simulador), tipos/lint/build/smoke aprobados. Docker, PostgreSQL, API y Angular restaurados; sin migración ni fixtures nuevos en la principal. Ver [fase 5.13](phase-5-13.md). Pendiente prueba manual del usuario; sin commit/push de este incremento. Los resultados de 779 pruebas más abajo son históricos de la entrega publicada 3ba7bf4.

**Corrección posterior vigente: sesión renovable.** El usuario confirmó que el panel lo expulsaba después de unos minutos: el JWT de 15 minutos disparaba logout sin renovación. Corregido con cookie HttpOnly/Strict, rotación y hashes en `AuthSession`, máximo absoluto 8 horas, logout revocable y reconexión Socket.IO con JWT nuevo. Migración aditiva `20261123020000_auth_sessions` aplicada localmente después de validar en bases temporales; conteos/huellas de las 13 tablas anteriores y `.env` idénticos antes/después. **El usuario debe iniciar sesión una vez para crear la cookie nueva**. Ver [session-renewal.md](session-renewal.md). No volver a logout fijo a los 900 segundos ni guardar JWT/secretos en localStorage. No se cambiaron roles, parcelas, lecturas, rangos/márgenes ni simulador.

**Actualización vigente: fase 5.12, fechas personalizadas del gráfico/tabla de humedad implementadas y validadas.** Historial → Desde/Hasta → Aplicar fechas al historial, máximo 31 días y conversión local/UTC. Periodo fijo conserva límites al paginar/actualizar/reconectar; presets móviles y cambio de selección vuelve a 24 h. Historial ahora conserva sesión/query y foco con RouterLink. Ver [fase 5.12](phase-5-12.md). Eventos separados 5.10/5.11, CSV, creación propia FARMER, sidebar, Monitoreo y ubicación textual sin mapas se conservan. Sin cambios de API/schema, migraciones, entorno ni fixtures nuevos en la principal.

**Estado: fase 4 conservada; rangos (5.1–5.5), desconexión (5.6), baja humedad por sonda (5.7) e historial de riego observado (5.8) implementados. 5.8 no requiere migración y no acredita sesiones físicas ni consumo.** Monorepositorio Angular + NestJS + PostgreSQL/Prisma. Leer primero [AGENTS.md](../AGENTS.md), sus documentos enlazados y [README](../README.md). DERCAS es la fuente funcional; este archivo resume el estado, no reemplaza requisitos.

## Qué funciona

- Barra lateral verde estable al desplazar en escritorio: `position: sticky`, alto de ventana y scroll interno para pantallas bajas, tanto en Mis parcelas (desde 681 px) como dashboard (desde 901 px). Mantiene la columna del grid sin solapar contenido; navegación compacta móvil conservada. Cambio solo de CSS, sin permisos/datos nuevos.

- **Decisión posterior 2026-11-22:** el usuario eligió que FARMER cree sus propias parcelas. `POST /plots` y formulario Mis parcelas admiten ADMIN/FARMER; propietario desde sesión, sin `ownerId` del cliente. Solo se amplía creación propia, no edición/archivo, dispositivos, usuarios ni umbrales. No cambia el rol de ninguna cuenta. DERCAS/README y documentación de permisos actualizados; ver [creación por agricultores](farmer-plots.md).

- Registro público solo FARMER e inicio de sesión JWT de 15 minutos; contraseñas Argon2id. Nuevas contraseñas: 8–128 caracteres, mayúscula y símbolo, sin requisito adicional de dígitos. Login existente conserva acceso.
- Parcelas, dispositivos y seis identidades de sensor con permisos por propietario. ADMIN no tiene acceso global a parcelas ajenas. No hay asignación automática de parcelas al registrarse.
- Ingesta IoT v1.2 con `X-Device-Id` UUID y `X-Device-Key` independiente del JWT. Credenciales almacenadas como hash, origen real/demo fijado al provisionar.
- Persistencia atómica de evento y tres filas de suelo. Unicidad dispositivo/evento, reintento idéntico sin efectos, conflicto 409 al cambiar datos con el mismo ID. Lecturas parciales mantienen null; las antiguas no desplazan la última.
- Snapshot e histórico REST autorizados, paginación y filtros. Orden determinista por tiempo efectivo, recepción y secuencia interna.
- Socket.IO autenticado y revalidado por parcela/origen/dispositivo. Solo publica tras persistir eventos únicos. Reconexión, recuperación REST y estado de conexión.
- Dashboard en `/parcelas/:id/dashboard`, accesible desde Mis parcelas: tres zonas, ambiente, lluvia, orden del relé, gráfico de tres series y tabla. Datos DEMO explícitos, sin fallback inventado.
- Simulador local determinista, provisión DEMO explícita para un propietario existente. Credenciales privadas en `.local`; nunca se crean automáticamente en una base nueva.
- Corrección posterior a 5.3: modo continuo del simulador sobrevive a cortes de red/reinicios de API mediante `sendUntilAvailable` y espera acotada entre lotes, preservando evento y fecha. Lotes `--count` y rechazos permanentes siguen acotados. Ver [fase 3](phase-3.md#recuperación-de-cortes-temporales-corrección-posterior).
- `GET/PUT /api/v1/sensors/:sensorId/thresholds`: rangos numéricos por UUID/variable, sin defaults agronómicos. Lectura por propietario, escritura solo ADMIN propietario; DEMO sujeto a `SourcePolicy`.
- Auditoría anterior/nuevo y rango en una transacción; versión optimista (`expectedVersion=0` para crear), bloqueo por sensor y revalidación de permisos. Ver [fase 5.1](phase-5.md).
- Dashboard muestra rangos de las tres sondas y sensores ambientales por UUID con cliente GET y fachada propia; no consulta lluvia booleana. Distingue carga, sin configuración y error; un fallo no bloquea telemetría. Recarga manual/reconexión/cada 60 s, limpia al cambiar selección o salir, sin fallback real/DEMO. Ver [fase 5.2](phase-5-2.md).
- «Configurar rango» y diálogo para ADMIN propietario: validación, PUT con versión original, conflicto sin perder borrador y consulta/elección explícita del rango actual. Nunca reintenta automáticamente una escritura incierta. Un éxito refresca tarjetas cancelando GET anteriores al commit; FARMER sigue sin edición. Ver [fase 5.3](phase-5-3.md).
- Opción A (5.4): tarjetas de suelo/ambiente muestran Bajo/En rango/Alto según sus rangos actuales, extremos inclusivos, con calidad y antigüedad separadas. Datos inválidos/ausentes no muestran cifra válida; antiguos no reciben comparación vigente. DEMO explícito; reales sin calibrar conservan advertencia ámbar incluso dentro del rango. Función pura `assessSensor`, sin solicitudes nuevas ni cambios al histórico/alertas/firmware. Ver [fase 5.4](phase-5-4.md).
- Fase 5.5: `GET /sensors/:sensorId/thresholds/history?from=&to=` devuelve intervalos [inicio, fin) con permisos y origen por dispositivo. Reconstruye auditoría en lectura `RepeatableRead`, ancla previa y límite posterior, máximo 31 días/1000 cambios; inconsistencias no se inventan ni truncan. El gráfico A/B/C añade segmentos mín./máx. por vigencia y tabla accesible; cambiar hoy un rango no cambia los límites de ayer. Fachada nueva independiente, cancelación por selección/página/logout y reconsulta tras guardar; clasificación actual, telemetría y firmware conservados. Sin migraciones ni dependencias nuevas. Ver [fase 5.5](phase-5-5.md).
- Fase 5.6: detector backend al arrancar/cada 5 s sin depender de clientes Socket.IO. Abre un episodio tras más de cinco intervalos sin mensajes, nunca sin contacto previo. Persiste evidencia, cierre/motivo y reconocimiento independiente; nuevo mensaje aceptado restablece contacto, duplicado no lo hace. Bloqueos e índice único parcial impiden duplicados. GET `/plots/:plotId/alerts` por dispositivo/origen y POST `.../:alertId/acknowledge` idempotente para ADMIN/FARMER propietario. Panel independiente con paginación, error/reintento y DEMO explícito. Migración aditiva `20261121080000_offline_alerts` aplicada localmente después de pruebas temporales; cuentas/telemetría/rangos preservados. Este detector solo evalúa conectividad; baja humedad se implementó después en 5.7. Ver [fase 5.6](phase-5-6.md).
- Fase 5.7: alertas de baja humedad independientes para A/B/C, política con margen positivo explícito, auditoría, estado durable y reconocimiento. Tres lecturas bajas consecutivas confirman; tres ≥ mínimo + margen recuperan. Reales sin calibrar no cuentan; DEMO admite pruebas identificadas. Cambios de configuración no se etiquetan como recuperación. Ver [fase 5.7](phase-5-7.md).
- Estado del sistema ofrece «Volver a mis parcelas» mediante RouterLink con sesión activa, sin recargar ni perder la sesión; acceso a login para visitantes.
- Fase 5.8: `GET /plots/:id/irrigation-events` con fechas/paginación, propiedad y origen; compara estados persistidos de relé/feedback, incluyendo null y predecesor anterior al filtro. Dashboard añade tabla consultada manualmente, filtros 24 h/7/30 días, error/reintento y enlace Riego que conserva sesión. Sin migración, control remoto, duración o litros. Ver [fase 5.8](phase-5-8.md).
- Fase 5.11: `sensor.status` v1.0 independiente, con identidades persistentes de suelo/ambiente/lluvia, calidad, antigüedad y comparación numérica de rangos actuales. Missing no desconecta el dispositivo ni oculta otras sondas; frescura usa tiempo efectivo, no último contacto. Angular invalida snapshot/histórico y rangos; no aplica estados raw ni crea alertas nuevas. Ver [fase 5.11](phase-5-11.md).
- Fase 5.12: selector Desde/Hasta con validación local/UTC para gráfico A/B/C y tabla, periodo fijo de hasta 31 días, paginación/actualización con límites estables y cancelación inmediata al cambiar filtro. No filtra tarjetas actuales ni los otros paneles. Cambio de selección limpia fechas y filas; Historial usa RouterLink y foco. Ver [fase 5.12](phase-5-12.md).

Detalles de implementación: [fase 2](phase-2.md), [registro](registration.md), [fase 3](phase-3.md) y [fase 4](phase-4.md).

## Verificación funcional

### Corrección de cierre de sesión a los 15 minutos

**779 pruebas correctas: 209 backend, 379 Angular, 151 integración PostgreSQL/Socket.IO, 30 navegador Edge y 10 simulador**. Tipos, lint, Prisma y build correctos. Browser con reloj controlado verifica minuto 14→15, renovación, reconexión del socket, recarga y logout; no se afirma haber esperado ocho horas físicas. Integración comprueba cap absoluto, hash/rotación/gracia de 5 s para concurrencia, origen/header anti-CSRF, cuerpo estricto, cuenta/rol, revocación de JWT vinculados y aislamiento entre sesiones. Bases temporales limpiadas; principal solo recibió la tabla nueva, con 13 tablas anteriores verificadas idénticas.

Archivos principales: backend `auth/browser-session.service*`, `auth.service/controller/module`, `configure-app.ts`, Prisma y migración; frontend `core/auth/*`, `app.config.ts` y fuente Socket.IO. JWT de hasta 15 minutos solo en memoria; cookie opaca HttpOnly/Strict y Secure en producción, ocho horas absolutas no deslizantes. Single-flight de renovación, retry temporal sin enviar JWT vencido, cancelación de renovación al salir/login y protección frente a 401 atrasados. Restauración al arrancar mediante cookie; marca no secreta en sessionStorage solo para evitar restauración en la pestaña tras logout offline. Logout con red revoca familia actual y sus JWT; no otras sesiones. Persisten límites de TLS/despliegue, recuperación, administración de sesiones y retención de filas caducadas. JWT sin sid previos al cambio solo conservan sus 15 minutos originales y no habilitan renovación.

Primer browser 29/30: el test nuevo buscaba nombre exacto del enlace sin su flecha. Selector corregido conforme al patrón existente; repetición completa 30/30 sin aumentar timeouts ni quitar comprobaciones. Tipado estructural de petición/respuesta evita instalar tipos Express adicionales; OpenAPI de cookie ajustado al esquema exigido. No se inició otra funcionalidad ni se publicó código. Próximo paso: iniciar sesión una vez y probar permanencia/Salir; no iniciar simulador ni modificar configuración agrícola.

Formato global, diff y smoke finales correctos. API local live/ready 200, OpenAPI refresh/logout presente, refresh sin cookie rechazado 401 y Angular localhost:4200=200. Migración local aplicada; servicios activos. No quedan pruebas de esta corrección en segundo plano.

### Fase 5.12 — fechas personalizadas del histórico

**764 pruebas correctas: 207 backend, 373 Angular, 145 integración PostgreSQL/Socket.IO, 29 navegador Edge y 10 simulador.** Tipos, lint y build correctos. Angular se ejecutó en serie mediante configuración temporal externa, sin ampliar timeouts del proyecto. El comando conjunto de pruebas/build agotó su límite después de aprobar las suites; `npm run build` se repitió por separado y terminó correctamente. Integración completa repetida con las seis bases temporales eliminadas; base de navegador también limpiada, principal sin fixtures nuevos. Persiste el aviso previo de consultas concurrentes de `pg`.

Navegador verifica Historial sin navegación de documento/cierre de sesión, clic repetido, selección y foco; fechas UTC exactas por dispositivo/origen; más de 100 lecturas y paginación fija; actualización, periodo inválido y vacío; error 503/reintento sin ocultar tarjeta actual; móvil 390 px sin desbordamiento. Captura sintética `history-period-mobile.png` revisada. Unitarias prueban conversión/calendario/31 días, submit DOM, periodo aplicado frente a borrador, cancelación inmediata de GET anterior, polling/reconexión y limpieza por selección.

Archivos: `core/telemetry/history-period*`, `telemetry.facade*`, `features/dashboard/history-period.component*`, dashboard y gráfico de humedad; prueba de navegador en `backend/test/dashboard.integration.ts`. No se cambia backend de producción, contratos, roles, rangos/márgenes, `.env`, hardware ni simulador. Cambios locales sin commit/push. **Próximo paso: prueba manual del usuario en Historial; no necesita datos nuevos para consultar el lote existente.** Fechas personalizadas del historial de riego siguen pendientes.

Comprobación final: lint, formato global, diff y smoke correctos; API liveness/readiness 200, OpenAPI de salud y frontend localhost:4200=200. Sin verificaciones en segundo plano pendientes.

### Fase 5.11 — estado independiente de sensores

Confirmadas **742 pruebas correctas: 207 backend, 353 Angular, 145 integración PostgreSQL/Socket.IO, 27 navegador Edge y 10 simulador**. Lint, tipos, build, formato global, diff y smoke correctos (liveness/readiness 200, OpenAPI de salud presente; frontend localhost:4200 responde 200). Angular corrió en serie con configuración temporal externa, sin cambiar timeouts del proyecto. La primera comprobación de tipos agotó 120 s; repetida con margen suficiente terminó correctamente.

Integración comprueba inventario sin lecturas, parcial con null/cero/false, rango configurado desde otra sesión, calidad sin calibrar, versiones, estados iguales/duplicados/rechazos/lecturas antiguas, envejecimiento sin ingesta y recuperación. Aislamiento real/DEMO/propietario y revalidación de sesión conservados. Las seis bases temporales fueron eliminadas por el runner; la principal no recibió fixtures.

Primer navegador: 26/27 correctas. El test nuevo buscaba texto exacto «Bajo» aunque contiene un icono; se corrigió al selector existente `data-comparison`. La segunda ejecución agotó el tiempo del primer login y fallaron 19/27, muchas en cascada por falta de esa sesión; además, la prueba nueva podía leer el registro de frames antes de recibir el evento. Se ajustó para suscribirse antes del cambio y esperar conjuntamente el frame esperado y REST. **La repetición completa sin otras suites en paralelo pasó las 27 pruebas en unos 152 s**, sin aumentar timeouts ni omitir aserciones. Comprueba versión/rango de `sensor.status` real y refresco en Angular sin otra lectura ni recarga. Captura sintética móvil `sensor-status-mobile.png` revisada: suelo A en rango y sin calibrar, B sin datos, C independiente; sin cifras hídricas inventadas. Base temporal de navegador eliminada; principal intacta. Persiste el aviso previo de consultas concurrentes de `pg`.

Archivos principales: `backend/src/realtime/sensor-status*`, servicio realtime, contratos, validador y stream/facade `core/telemetry/`, dashboard y pruebas realtime/navegador. No añade tablas, dependencias ni endpoints. No cambia roles, márgenes, firmware, configuración privada ni simulador. Barrido solo para suscriptores; no reemplaza alertas durables ni ofrece outbox/clustering. `fresh` con missing significa informe reciente de ausencia, no lectura válida ni conectividad física confirmada. El timestamp corresponde a lectura agregada, no última lectura válida por sonda. Ver límites y prueba manual en [5.11](phase-5-11.md).

### Corrección de Monitoreo — posterior a 5.10

El enlace lateral Monitoreo usaba `href="#readings"`, resuelto contra el base href raíz, en lugar de navegación Angular dentro del dashboard. Se cambió a RouterLink relativo con fragmento y conservación de query, desplazamiento explícito al repetir clic y destino enfocable con `tabindex=-1`. Conserva sesión, parcela, dispositivo y origen. Archivos: `dashboard.component.html`, `.ts`, `.spec.ts` y regresión en `backend/test/dashboard.integration.ts`. No se modificaron datos principales, roles, configuración ni simulador. Historial conserva su enlace nativo; no se amplió este arreglo a otras opciones.

**325 pruebas Angular y 26 de navegador Edge correctas**, incluidos clic repetido, foco, misma ruta/query y ausencia de navegación de documento. Lint, tipos, build, formato global, diff y smoke (liveness/readiness 200 y OpenAPI de salud) correctos. Dos intentos de Angular con paralelismo predeterminado agotaron los 5000 ms del primer test de render; la suite completa pasó en serie con configuración temporal externa (`maxWorkers: 1`, `fileParallelism: false`), sin ampliar timeouts, omitir aserciones ni cambiar configuración del proyecto. Navegador usó y eliminó su base temporal sin tocar la principal.

### Fase 5.10 — riego observado en tiempo real

**697 pruebas correctas: 197 backend, 324 Angular, 141 integración PostgreSQL/Socket.IO, 25 navegador Edge y 10 simulador.** Lint, tipos, build, formato global y diff correctos. Smoke local: liveness/readiness 200, OpenAPI de salud presente y Angular localhost:4200 responde 200. Bases temporales limpiadas; principal sin fixtures nuevos. Persiste el aviso previo de consultas concurrentes de `pg`.

Evento v1.0 separado con primera observación/cambio latest, preservando null y feedback independiente. Comparación en transacción serializada; publicación tras commit sin alterar respuesta HTTP de ingesta. Angular valida el evento y solo invalida REST, no aplica estados recibidos. Historial activado refresca la primera página del rango móvil elegido y cancela peticiones anteriores. Navegador comprobó cierre automático y recuperación de apertura perdida al reconectar; captura sintética `irrigation-realtime.png` revisada. Sin outbox durable: orden/entrega no garantizados; lecturas antiguas pueden modificar comparaciones históricas sin evento actual y permiten reconsulta manual.

Archivos clave: proyección `backend/src/irrigation/irrigation-observation*`, repositorio/servicio de telemetría, servicio realtime, contratos, validador `core/irrigation/irrigation-event*`, stream/facade y componente de historial Angular. No se cambian firmware, roles, márgenes, `.env`, dependencias ni procesos del simulador. Cambios locales sin commit/push. **Esperar prueba del usuario**; para cambios automáticos pedir autorización antes de enviar otro lote DEMO finito. `sensor.status` sigue pendiente.

### Fase 5.9 — reportes CSV

**Validación final: 671 pruebas correctas — 189 backend, 312 Angular, 136 integración PostgreSQL/Socket.IO, 24 navegador Edge y 10 simulador.** Build, tipos, lint y formato correctos. Se repitieron completas las pruebas tras corregir las regresiones de selectores/fixtures mencionadas en [fase 5.9](phase-5-9.md); bases temporales limpiadas, principal sin nuevos fixtures. La advertencia de consultas concurrentes de `pg` existente permanece sin cambiar dependencias para ocultarla.

API CSV y panel Reportes con fechas personalizadas, identidad/origen seleccionados y límites 31 días/10000 filas. Sin crear datos en la base principal ni cambiar simulador/configuración. Nuevas pruebas unitarias de escape/fórmulas, null/false/cero, exceso sin truncado y UI Blob/cancelación/errores. Navegador descarga ambos archivos, verifica contenido DEMO, periodo vacío, error 413/reintento y móvil 390 px. Captura `reports-mobile.png` y archivos sintéticos `readings-demo.csv`, `irrigation-events-demo.csv`, `readings-empty.csv` revisados en el entorno temporal de pruebas.

### Barra lateral estable al hacer scroll — 2026-11-22

**305 pruebas Angular y 23 de navegador Edge aprobadas**, además de lint, tipos, build, formato global, diff y smoke. La nueva regresión desplaza el documento en dashboard y parcelas a 1440×500, comprueba que el lateral mantiene posición y altura de ventana, que su scroll interno permite alcanzar Estado técnico y que móvil 390 px conserva navegación compacta sin desbordamiento. Capturas sintéticas `sticky-dashboard-desktop.png` y `sticky-plots-desktop.png` revisadas. El primer intento encontró un desfase de coordenada fraccional de menos de 1 px; se ajustó solo la tolerancia del test y se repitieron las 23 pruebas correctamente. Sin cambios a API, base, roles o simulador.

### Creación de parcelas por FARMER — actualización posterior a 5.8

Validación: **178 backend, 305 Angular, 131 integración PostgreSQL/Socket.IO y 22 navegador Edge aprobadas**. Lint, tipos y build correctos. La prueba de navegador crea una parcela FARMER desde móvil 390 px, comprueba propietario y superficie persistidos, muestra éxito y abre un dashboard sin dispositivos; captura `farmer-create-plot-mobile.png` en el entorno sintético de pruebas. Integración comprueba rechazo de propietario/rol inyectados, aislamiento frente a otros ADMIN y prohibición de otras escrituras FARMER. No se insertan parcelas de prueba en la base principal.

Formulario habilitado para agricultor sin asignar propietario desde cliente, con mensaje de éxito y actualización de lista. No crea dispositivos/lecturas automáticamente. Pruebas solo en bases temporales; la parcela DEMO local previa se conserva. Sin migración, cambios a `.env`, roles ni simulador en este incremento. El usuario debe probar creando su parcela desde Mis parcelas antes de pasar a otra funcionalidad.

### Preparación autorizada para prueba manual — 2026-11-22

Tras mostrar «Mis parcelas» vacío, el usuario autorizó datos DEMO para su cuenta existente. Se provisionó **DEMO · Simulador local** con un dispositivo y seis sensores, conservando FARMER. Se habilitó `TELEMETRY_MODE=demo` en `.env` local privado; la API recargó su configuración. Se guardaron nueve lecturas DEMO (una comprobación HTTP y un lote de ocho), con órdenes de apertura/cierre simuladas y feedback físico null. El primer intento coincidió con recarga de API; la comprobación y repetición terminaron correctamente. El simulador finito ya terminó: una desconexión posterior es esperable, no fallo físico. Sin configurar rangos/márgenes ni tocar hardware. `.env` y `.local/simulator.json` siguen ignorados por Git. Para probar: Actualizar en Mis parcelas → Panel de monitoreo → Datos simulados · DEMO → Riego → Consultar / actualizar historial. El origen predeterminado del dashboard sigue siendo real.

### Historial observado 5.8 — 2026-11-22

**642 pruebas correctas: 178 backend, 302 Angular, 131 integración PostgreSQL/Socket.IO, 21 navegador Edge y 10 simulador.** Lint, tipos y build correctos. La nueva consulta verifica duplicados, null, feedback independiente, predecesor fuera del filtro, páginas, mensajes tardíos, desempate, FARMER/ADMIN propietario, DEMO, actividad y OpenAPI. Navegador comprueba tabla, error/reintento y navegación sin perder sesión. Captura móvil 390 px revisada sin desbordamiento del documento; tabla con scroll interno. Pruebas en bases temporales eliminadas por el runner, sin fixtures en la principal. Dos errores de expectativas/selector de tests se corrigieron y se repitieron las suites completas, sin cambiar el contrato existente.

Formato global y `git diff --check` correctos. Smoke final: liveness/readiness 200, frontend local 200 y OpenAPI del backend activo incluye `/plots/{id}/irrigation-events`. La comparación requisito por requisito está en [requirements-status.md](requirements-status.md). No se inició CSV, IA, clima ni predicción. Sin cambios a firmware, roles, márgenes, `.env` o estado del simulador. Sin migraciones nuevas ni publicación/commit. La próxima acción es prueba manual del usuario; si faltan datos de demostración, consultar antes de provisionarlos o enviarlos.

### Actualización y comprobación de otra copia local — 2026-11-22

Se integró `00bf4e8` desde `origin/main` mediante fast-forward, sin conflictos ni sobrescribir cambios locales. Se regeneró el cliente Prisma y se aplicaron las tres migraciones pendientes de rangos, desconexión y humedad mediante `migrate deploy`, sin resetear la base. Antes y después se compararon conteos y huellas del contenido de las seis tablas de negocio anteriores: permanecieron iguales. El `.env` privado conservó su huella; no se cambiaron roles, márgenes, configuración de dispositivos ni el estado del simulador. `migrate status` confirma las seis migraciones al día.

Se ejecutaron nuevamente **627 pruebas correctas en este equipo: 178 backend, 295 Angular, 124 integración PostgreSQL/Socket.IO, 20 navegador Edge y 10 simulador**. Lint, tipos, build, validación Prisma, formato y smoke correctos. Las comprobaciones iniciales de build e integración alcanzaron sus límites de tiempo al ejecutarse conjuntamente; se repitieron con margen suficiente y finalizaron correctamente. Se eliminó únicamente la base temporal sin conexiones del runner interrumpido. Las pruebas completas posteriores también limpiaron sus bases temporales.

La API local responde liveness/readiness 200 y OpenAPI incluye rangos, desconexión y humedad. Angular responde 200 en `http://localhost:4200`. No se crearon parcelas, dispositivos, rangos, políticas o telemetría de demostración en la base principal para verificarlo. Las pruebas de navegador usaron su propio entorno aislado.

El aviso de formato de esta copia afectaba solo a finales CRLF de 83 archivos: se comprobó que su contenido versionado ya usa LF y se normalizó la copia de trabajo mediante Prettier, sin cambios de lógica ni diferencias versionadas en esos archivos. El chequeo global de formato pasa; no se alteró la configuración de Git. Permanece la advertencia de deprecación de consultas concurrentes del cliente `pg` ya registrada en 5.7, sin ocultarla ni cambiar dependencias.

Se alineó la instrucción final de este documento con 5.7: las alertas de humedad ya existen. El siguiente incremento sigue pendiente de autorización; no se inició desarrollo de eventos de riego ni reportes. Esta corrección documental no se ha publicado automáticamente en GitHub.

### Registro de la entrega del compañero

Fase 5.7: **178 backend, 295 Angular, 124 integración PostgreSQL/Socket.IO, 20 navegador y 10 simulador correctas (627 total)**. Tipos/lint/build/Prisma/formato correctos; revisión móvil 390 px sin desbordamiento. Reglas aprobadas: tres bajas consecutivas activan; tres ≥ mínimo + margen recuperan. Margen explícito por sonda, sin defaults. Inválidos/ausentes/antiguos rompen confirmaciones; reales sin calibrar excluidos, DEMO etiquetado. Estado/cursor/episodios durables y auditoría; cambios de rango/margen cierran por configuración y reinician atómicamente. Reconocer no cierra. Prueba Edge detectó formulario sin directiva de submit: corregido con FormGroup y regresión DOM/navegador. **Tras autorización se aplicó `20261121200000_moisture_alerts` a la principal local; conteos anteriores conservados en nueve tablas y cuatro tablas nuevas vacías.** Smoke/salud y rutas OpenAPI correctos; Angular 200 en localhost:4200 (IPv6 ::1). Se repitieron las 20 pruebas Edge, incluido Guardar margen; sin guardar valores en la principal ni reiniciar simulador. Ver [fase 5.7](phase-5-7.md).

Corrección posterior a 5.6: el enlace «Alertas» ahora usa RouterLink relativo con fragmento y conserva parámetros, en lugar de `href="#alerts"` que, por el base href raíz, recargaba la app y perdía el JWT en memoria. Desplazamiento/foco por ViewportScroller, también al repetir clic; destino con tabindex -1. **250 Angular y 19 navegador correctas**, más tipos/lint/build/formato. La regresión de navegador verifica ruta, parcela/dispositivo/origen, sesión autenticada y ausencia de navegación de documento. Sin cambiar auth, backend, datos o simulador. Otros enlaces nativos no se modificaron en este arreglo.

Fase 5.6: **535 pruebas correctas — 249 Angular, 151 backend, 107 integración PostgreSQL/Socket.IO, 18 navegador Edge Chromium y 10 simulador**. Lint, tipos, build, validación Prisma, formato de archivos afectados, diff y smoke correctos. Navegador verifica reconocimiento FARMER sin cerrar condición, nuevo contacto conservando historial, errores aislados y cambio de origen; capturas 1440/390 px revisadas sin desbordamiento. Migración aditiva aplicada localmente tras verificarla en bases temporales; esquema al día y conteos de negocio anteriores conservados. El detector generó una alerta DEMO legítima mientras el simulador sigue detenido. Se corrigió el override de presupuesto HTTP **solo en la matriz de navegador** usando el token de opciones de Throttler; seguridad en producción y suite de seguridad intactas. Detalles en [fase 5.6](phase-5-6.md).

Resultados anteriores:

Fase 5.5: **445 pruebas correctas — 206 Angular, 128 backend, 86 integración PostgreSQL/Socket.IO, 15 navegador Edge Chromium y 10 simulador**. Lint, tipos, build, smoke, formato de archivos afectados y diff correctos. Navegador verifica vigencias anterior/nueva, filtros, error/reintento sin ocultar mediciones y paginación de 103 lecturas sin arrastrar límites a periodos previos a la configuración. Capturas de 1440/390 px revisadas con tabla abierta, sin desbordamiento de página. Sin cambios de schema/migraciones, cuentas, configuración, datos principales, firmware ni procesos del simulador. Resultados y limitaciones en [fase 5.5](phase-5-5.md).

Fase 5.4: **360 pruebas correctas — 168 Angular, 97 backend, 73 integración PostgreSQL/Socket.IO, 12 navegador Edge Chromium y 10 simulador**. Lint, tipos, build, formato de archivos del incremento y smoke correctos. Nuevas pruebas de límites inclusivos, unidades, cero, calidad inválida/ausente, antigüedad, error/ausencia de rango, separación de calibración/DEMO y actualización de cinco tarjetas. Navegador verifica cambio por telemetría y por edición de rango sin otra lectura; capturas 1440/390 px revisadas sin desbordamiento móvil. Sin cambios al backend de negocio, datos principales, cuentas, configuración o procesos locales.

Corrección posterior del simulador: **10 pruebas del simulador y 73 de integración**, lint, build, formato de archivos afectados y smoke correctos. Recuperación HTTP local real tras cuatro 503 sin duplicar identidad. Se confirmaron lecturas DEMO y actividad reciente del continuo reiniciado con autorización. El usuario también autorizó promover su cuenta local a ADMIN; se actualizó solo su rol conservando parcelas y contraseña. No guardar identificadores/correos/credenciales de esa cuenta en documentación. La UI requiere volver a iniciar sesión porque conserva el rol de la sesión anterior.

Fase 5.3: **294 pruebas correctas — 109 Angular, 97 backend, 73 integración PostgreSQL/Socket.IO, 10 navegador Edge Chromium y 5 simulador**. Lint, tipos, build y smoke aprobados; formato de archivos del incremento correcto. Nuevas pruebas de formulario, versión, conflicto, guardado incierto, permisos FARMER y auditoría desde navegador ADMIN; diálogo móvil y capturas revisadas. Sin cambios al backend de negocio, schema, migraciones, roles locales o `.env`. La matriz de navegador desactiva solo su rate limit de prueba; seguridad/integración mantiene sus pruebas reales de limitación. Detalles en [fase 5.3](phase-5-3.md).

Verificación histórica de fase 5.2:

Fase 5.2: **260 pruebas correctas — 97 backend, 78 Angular, 73 integración PostgreSQL/Socket.IO, 7 navegador Edge Chromium y 5 simulador**. Lint, tipos, build y smoke correctos. Nuevas pruebas de identidad, unidades, errores parciales, timeout, cancelación, polling, reconexión y GET sin formularios; navegador FARMER/DEMO, fallo y reintento de rangos, móvil 390 px sin desbordamiento. Sin cambios a schema/migraciones ni fixtures en la base principal. Archivos del incremento pasan Prettier; persisten avisos globales CRLF anteriores.

Verificación histórica de fase 5.1:

Fase 5.1: **225 pruebas correctas — 97 backend, 45 Angular, 73 integración PostgreSQL/Socket.IO, 5 navegador Edge Chromium y 5 simulador**. De ellas, 33 unitarias y 26 de integración son nuevas de rangos. Lint, tipos, build, validación Prisma y smoke aprobados. Migración aditiva aplicada a la base local después de verificarla en bases temporales; sin fixtures en la principal ni cambios a `.env`. OpenAPI local 0.5.0 expone rangos. Chrome no está en la ruta predeterminada: la prueba de navegador pasó al indicar Edge mediante `BROWSER_EXECUTABLE_PATH`. Detalles en [fase 5.1](phase-5.md).

Registro de formato del entorno de entrega: los archivos del incremento eran correctos; su chequeo global señalaba 125 archivos anteriores únicamente por CRLF. No confundir ese resultado histórico con la verificación posterior de esta copia ni con la fase 4 en otro entorno.

Verificación histórica de fase 4:

**164 pruebas correctas**: 64 backend, 43 Angular, 47 integración PostgreSQL/Socket.IO, 5 navegador Chrome y 5 simulador. Lint, typecheck, build, formato, validación Prisma y smoke de salud aprobados. Ver comandos y condiciones en `docs/phase-4.md`.

El navegador real verificó login FARMER → simulador Node → NestJS → PostgreSQL → Socket.IO → Angular, lecturas parciales/antiguas, corte de red y recuperación; escritorio 1440 px y móvil 390 px sin desbordamiento. Estas pruebas usan cuentas, bases y puertos temporales, no los recursos de un desarrollador.

La auditoría de dependencias registrada mantiene 19 avisos: 16 moderados y 3 altos, ninguno crítico. No se ha aplicado `audit fix --force` ni se declara preparación para producción.

## Siguiente incremento recomendado

Continuar **fase 5 en incrementos pequeños, instrucción por instrucción**, sin implementar todo simultáneamente:

1. Revisar DERCAS §§20–23 y el esquema actual de sensores.
2. El modelo, migración, DTO, API, permisos y auditoría de rangos ya existen; no recrearlos.
3. La lectura/presentación de rangos en Angular ya existe (5.2); no recrearla ni unirla al refresco de cada evento de telemetría.
4. Edición ADMIN (5.3), clasificación de tarjetas (5.4) y líneas del histórico por vigencia (5.5) ya existen. No recrearlas ni extender el rango actual hacia el pasado. No afirmar «Normal» o salud del cultivo por una comparación numérica.
5. Desconexión (5.6) y baja humedad (5.7) ya existen. El usuario aprobó la propuesta de tres lecturas y margen positivo por sonda, incluida exclusión de reales sin calibrar, y luego autorizó aplicar la migración 5.7 localmente (realizado). Falta configurar márgenes manualmente; no inventarlos ni reiniciar simulador. Sin acciones de válvula.
6. Peticiones posteriores: implementados historial observado 5.8, creación propia FARMER, sidebar estable, CSV 5.9, `irrigation.updated` 5.10, `sensor.status` 5.11 y fechas personalizadas gráfico/tabla 5.12. Monitoreo e Historial conservan sesión/selección. [Comparación completa](requirements-status.md) registra pendientes: fechas personalizadas de riego, gestión administrativa/asignación, IA, clima/predicción y validación física.
7. **El usuario quiere ir probando cada entrega. Revisar manualmente 5.12 antes de empezar otro módulo.** No recrear eventos, CSV ni filtros del gráfico. No crear fixtures ni iniciar simulador automáticamente; las lecturas persistidas bastan para filtrar el histórico. Elegir un solo incremento tras la revisión.

No avanzar simultáneamente con todo el alcance. Diagnóstico IA, clima y predicción siguen en fases posteriores.

## Restricciones y decisiones que deben conservarse

- **El usuario exige preguntar antes de cualquier cambio adicional al alcance autorizado.** No avanzar automáticamente a otra parte de fase 5 ni cambiar roles, configuración o procesos ajenos al encargo. Tras fase 5.3 autorizó expresamente corregir/reiniciar el simulador y promover su cuenta local a ADMIN; ambas operaciones se realizaron sin ampliar acceso a parcelas ajenas. Esa autorización no habilita cambios adicionales.
- El ESP32 controla localmente el riego. No hay órdenes remotas de apertura ni política de promedio/mínimo/mayoría autorizada para las tres sondas.
- Orden del relé no demuestra apertura física ni flujo. No inventar duración, litros, ahorro o resultados agronómicos.
- Falta confirmar protocolo real, modelos y calibración del hardware y contrato del servidor receptor externo. `ExternalTelemetryAdapter` sigue como interfaz; no afirmar que está conectado.
- No elevar números a calidad calibrada por encontrar un JSON de metadatos sin semántica verificada. La UI muestra «Sin calibrar» y «Sin rango configurado» donde corresponde.
- La tarjeta IA permanece pendiente, sin resultados ficticios ni botones de cámara funcionales. El banner utiliza SVG local, no la fotografía original de referencia que no está disponible como archivo.
- Socket.IO es best-effort, sin outbox durable ni clustering; REST recupera estado. La fachada usa eventos como invalidación y consulta el último dato al servidor para conservar su desempate.
- El selector DEMO solo aparece en desarrollo y el backend también exige habilitación. No mezclar reales y simulados.
- Tras un reinicio de OpenCode se cancelaron los servidores y el simulador. El usuario pidió levantar la web/API: Docker/PostgreSQL y ambos servidores de desarrollo se iniciaron de nuevo. El simulador permanece detenido; no reiniciarlo silenciosamente. Una alerta DEMO activa en ese estado es legítima y no implica fallo físico.
- Falta un flujo administrativo completo de asignación de parcelas a agricultores. No resolverlo concediendo acceso global.

## Orientación en el código

| Ruta                                                | Responsabilidad                              |
| --------------------------------------------------- | -------------------------------------------- |
| `backend/src/auth/`, `users/`, `plots/`, `devices/` | Seguridad, propiedad y provisión             |
| `backend/src/iot-ingestion/`, `telemetry/`          | DTO, normalización, persistencia y REST      |
| `backend/src/realtime/`                             | Socket.IO, autorización y estado             |
| `backend/prisma/`                                   | Esquema y migraciones versionadas            |
| `frontend/src/app/core/telemetry/`                  | Fuentes API/demo y fachada reactiva          |
| `frontend/src/app/core/sensor-thresholds/`          | Consulta GET y ciclo independiente de rangos |
| `frontend/src/app/features/dashboard/`              | Vista y componentes agrícolas                |
| `packages/contracts/`                               | Tipos compartidos, no validación HTTP        |
| `scripts/` y `backend/test/`                        | Entorno, simulador y verificación aislada    |

## Qué no viaja por GitHub

`.env`, secretos de dispositivos, memoria local de asistentes, usuarios, lecturas y volumen PostgreSQL. Cada compañero configura su equipo según README. Consultar [CONTRIBUTING.md](../CONTRIBUTING.md) para clonar, trabajar en ramas y abrir Pull Requests.

## Instrucción sugerida para el siguiente asistente

**Conservar la corrección de sesión** de `docs/session-renewal.md`: JWT15m renovables con cookie HttpOnly, máximo8h absoluto y logout revocable. Ya aplicada la migración local sin alterar las 13 tablas anteriores. Si usa una sesión de antes del cambio necesita login una vez; no desactivar validaciones de expiración, sesión activa, origen o propiedad para evitar cierres.

> Lee AGENTS.md y sus documentos obligatorios; después README.md, docs/HANDOFF.md, docs/requirements-status.md y fases 4 y 5.1–5.12. Inspecciona Git sin sobrescribir cambios locales. Telemetría, rangos, alertas, historial observado, CSV, eventos separados y fechas personalizadas del gráfico/tabla ya existen: no recrearlos. FARMER crea parcelas propias sin ampliar otros permisos. Revisar 5.12 antes de otro módulo: panel DEMO → Historial → Desde/Hasta → Aplicar fechas al historial, usando lecturas existentes. No iniciar simulador ni crear fixtures automáticamente. Conservar sidebar, navegación Monitoreo/Historial con sesión y ubicación textual sin Maps. No asumir permiso para roles/márgenes/configuración, publicación, despliegue, firmware o borrado. 5.8–5.12 no añaden migraciones ni acreditan flujo/duración/litros. IA, clima, predicción, gestión administrativa completa y fechas personalizadas de riego siguen pendientes. Verificar y documentar resultados reales.

Actualizar este archivo al entregar la siguiente tarea; no incluir credenciales ni depender del historial privado del chat.
