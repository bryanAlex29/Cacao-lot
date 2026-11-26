# CacaoSmart IoT

Monitoreo y riego inteligente para cacao en Chone, Manabí, Ecuador. Proyecto TerriTech Hackathon CITIC 2026.

**Presentación vigente:** renovación gráfica y solo **sensor de suelo 1** visible,
por indicación del usuario. Backend, contratos y datos anteriores permanecen intactos.
Los apartados de tres zonas inferiores conservan el alcance/evolución originales.
Ver [cambios visuales y verificación](docs/visual-refresh-single-sensor.md).

**Traspaso a Bryan:** [avance y guía de pruebas iniciales](docs/ENTREGA_BRYAN.md),
[prompt de continuidad](docs/PROMPT_BRYAN.md) y Word
`CacaoSmart_Avance_y_Traspaso_Bryan.docx` en la raíz. La guía incluye IA/clima y
renovación visual 1–6; los estados de fases inferiores son registros históricos.
Primero descargar el commit completo de entrega, probar y reportar; no comenzar
funciones nuevas ni asumir que los cambios locales ya están en GitHub.

## Estado actual: fase 6.3 (comparación privada de fotografías)

**Regresión múltiple · integración web experimental:** consulta por sonda de
modelos previamente entrenados/evaluados offline, registro privado versionado y
comparación con persistencia. No entrena al abrir la web ni inventa resultados
si falta modelo o datos. Migración aditiva aplicada con respaldo verificado y
datos anteriores intactos; ningún modelo sintético registrado en tu cuenta.
Ver [uso, registro y límites](docs/prediction-web-regression.md).

**Predicción hídrica · primera entrega web experimental:** seleccionar un equipo y
pulsar **Consultar referencia experimental** para ver persistencia de humedad por
A/B/C, gráfico/tabla y errores retrospectivos. Sin datos utilizables muestra el
motivo, no valores ficticios. No es una regresión operativa, un balance hídrico ni
una recomendación de riego. Sin migraciones ni dependencias nuevas. Ver
[alcance, uso y cierre](docs/prediction-web-reference.md).

**Nuevo:** selecciona dos fotos en **Diagnóstico IA · DEMO → Historial privado → Añadir a comparación**. Fotografías, fechas y resultados existentes lado a lado, intercambio A/B y limpieza; apiladas en móvil. Comparación manual, sin afirmar mejoría ni identificar plantas automáticamente. Sin nuevo análisis, migración o dependencia. **OpenAI continúa en espera.** Ver [guía y revisión manual](docs/phase-6-3.md).

**Nuevo:** Desde/Hasta y estado en **Diagnóstico IA · DEMO → Historial privado**. Hora local convertida a UTC, fechas inclusivas por creación, periodo fijo máximo 31 días, filtros conservados al paginar/actualizar y botón Limpiar. Sin migraciones ni dependencias respecto a 6.1. **OpenAI queda en espera por decisión del usuario; no se conecta ni genera costos.** Ver [guía y prueba manual](docs/phase-6-2.md).

**Nuevo:** **Mis parcelas → Diagnóstico IA · DEMO**, para ADMIN/FARMER propietarios, incluso sin sensores. Foto con vista previa y consentimiento, validación JPEG/PNG/WebP (8 MB), sanitización sin EXIF, almacenamiento privado, resultado simulado no concluyente, historial y eliminación. Cuota 5 intentos/día UTC y retención 7 días por defecto. **No usa OpenAI ni genera costos; no detecta enfermedades reales.** Ver [guía, configuración y límites](docs/phase-6-1.md). Requiere instalar `sharp`, generar Prisma y aplicar la migración aditiva con los comandos habituales de arranque.

**Nueva entrega local:** ADMIN propietario puede registrar dispositivos desde **Mis parcelas → Ver dispositivos y sensores**, guardar la clave mostrada una sola vez y habilitar/deshabilitar recepción con confirmación. También puede **Editar parcela** y **Archivar parcela** con nombre escrito. No cambia roles FARMER ni asignaciones; no borra físicamente datos ni controla válvulas. Sin migraciones/dependencias nuevas. Ver [guía, límites y pruebas](docs/phase-5-15-16.md). Pendiente revisión manual; sin publicación automática.

**Últimos incrementos:** fechas Desde/Hasta del riego observado (5.13, máximo 31 días y periodo fijo) e inventario de solo lectura en **Mis parcelas → Ver dispositivos y sensores** (5.14, paginado, REAL/DEMO, último contacto y sensores). Sin nuevas migraciones ni dependencias respecto a `3ba7bf4`. Ver [fase 5.13](docs/phase-5-13.md), [fase 5.14](docs/phase-5-14.md) y [guía para continuar](docs/CONTINUAR.md).

**Corrección de sesión:** ya no se expulsa al usuario al vencer el primer JWT de 15 minutos. Renovación automática mediante cookie HttpOnly y sesión revocable, máximo absoluto 8 horas; también recupera una recarga. **Iniciar sesión una vez tras actualizar** para activar la cookie nueva. Ver [seguridad, límites y prueba manual](docs/session-renewal.md).

Base ejecutable con **Angular + NestJS + PostgreSQL/Prisma**, registro, parcelas propias y **dashboard de telemetría en vivo** con tres zonas. La pantalla pública `/estado` comprueba salud real de API/PostgreSQL. Hay alertas persistentes de desconexión y baja humedad por sonda; la migración de humedad fue verificada en bases temporales y aplicada localmente con autorización, preservando datos anteriores. IA real y métricas hídricas siguen pendientes; el flujo fotográfico de 6.1 es simulado.

Fase 5: **rangos min/max por UUID de sensor**, con permisos por propietario, auditoría atómica y versión para ediciones concurrentes. ADMIN propietario puede editarlos desde «Configurar rango»; FARMER conserva solo lectura. Las tarjetas de A/B/C, temperatura y humedad ambiental comparan las lecturas recientes con su rango: **Bajo / En rango / Alto**, manteniendo calidad, antigüedad y real/DEMO por separado. Los extremos son inclusivos; sin configuración no se inventan límites. La comparación es numérica, no diagnóstico ni prueba de calibración. El gráfico de suelo añade mínimos/máximos **por vigencia**: cambiar hoy un rango no lo aplica al pasado. Ver [API de fase 5.1](docs/phase-5.md), [consulta de fase 5.2](docs/phase-5-2.md), [edición de fase 5.3](docs/phase-5-3.md), [clasificación de fase 5.4](docs/phase-5-4.md) y [límites históricos de fase 5.5](docs/phase-5-5.md).

**Alertas de desconexión (5.6):** el backend detecta más de cinco intervalos sin mensajes, incluso sin navegador abierto. Guarda un episodio activo por dispositivo; ADMIN o FARMER propietario puede reconocerlo sin cerrar la condición. Un mensaje nuevo aceptado restablece contacto y conserva el historial. Sin contacto previo no se inventa desconexión. El panel separa real/DEMO, errores y reconocimiento; no abre válvulas ni evalúa humedad. Ver [fase 5.6](docs/phase-5-6.md).

**Baja humedad (5.7):** tres lecturas consecutivas bajo el mínimo por A/B/C; recuperación con tres ≥ mínimo + margen positivo configurado, sin defaults. Datos inválidos/ausentes/antiguos rompen confirmaciones sin resolver; reales sin calibrar no cuentan. Cambio de rango/margen cierra por configuración, no recuperación. Panel/configuración ADMIN y reconocimiento propietario independientes del riego. **Migración aplicada localmente; configurar el margen de cada sonda explícitamente para habilitarla.** Ver [fase 5.7](docs/phase-5-7.md).

**Riego observado (5.8):** historial paginado del relé y feedback físico derivado de telemetría persistida, sin migración. Menú **Riego → Consultar / actualizar historial**, filtros 24 h/7/30 días y estados anteriores/actuales separados por real/DEMO. Null no significa cierre; no se infieren duración, caudal ni litros. Ver [fase 5.8 y prueba manual](docs/phase-5-8.md) y [comparación completa con DERCAS](docs/requirements-status.md).

**Reportes CSV (5.9):** menú **Reportes** dentro del dashboard, descarga de lecturas o cambios observados de riego, fechas personalizadas o 24 h/7/30 días. Solo dispositivo/origen/parcela autorizados, ADMIN/FARMER; UTC, calidad y null explícitos. Máximo 31 días/10000 registros, error sin truncar si se excede. Sin cifras hídricas inventadas ni migración. Ver [fase 5.9 y prueba manual](docs/phase-5-9.md).

**Riego en tiempo real (5.10):** evento independiente `irrigation.updated` tras guardar una primera observación o cambio que queda como último. Después de **Riego → Consultar / actualizar historial**, la tabla se refresca por REST al recibir cambios o reconectar; no aplica estados de mensajes atrasados. Sin nuevas lecturas no aparecen cambios. No inicia el simulador ni acredita flujo físico. Ver [fase 5.10 y prueba manual](docs/phase-5-10.md).

**Estado de sensores (5.11):** evento separado `sensor.status` v1.0 con identidad, calidad, antigüedad y comparación numérica por sensor, derivado de la última lectura y rangos persistidos. Una sonda sin datos no desconecta las demás. Al cambiar el estado, Angular recupera mediciones/rangos por REST, también si un rango se cambió desde otra sesión. Sin calibración o rango no se inventan. No crea nuevas alertas ni inicia el simulador. Ver [contrato, límites y prueba manual de 5.11](docs/phase-5-11.md).

**Fechas del histórico (5.12):** menú **Historial → Desde/Hasta → Aplicar fechas al historial** filtra el gráfico A/B/C y su tabla, máximo 31 días. Hora local convertida a UTC y periodo fijo al paginar/actualizar/reconectar; presets 24 h/7/30 días siguen siendo móviles. No filtra las tarjetas actuales ni modifica los filtros de riego o reportes. Historial ya conserva la sesión al navegar. Ver [fase 5.12 y prueba manual](docs/phase-5-12.md).

- Angular standalone, Router, HttpClient y detección de cambios sin Zone.js.
- API NestJS con entorno validado, CORS restringido, validación global y OpenAPI en desarrollo.
- PostgreSQL en Docker Compose aislado del resto de proyectos.
- Prisma con adaptador PostgreSQL y migración inicial de usuarios, parcelas, dispositivos y sensores.
- JWT de 15 minutos, contraseñas Argon2id, permisos por rol y propietario, validación y limitación de solicitudes.
- Registro de dispositivos con clave aleatoria visible una vez y seis sensores en una operación atómica; ingesta autenticada, idempotente y transaccional.
- Snapshot e histórico REST por propietario, origen y dispositivo; simulador local determinista de tres sondas.
- Socket.IO con JWT y permisos por parcela/dispositivo/origen, reconexión y recuperación REST.
- Angular: `/login`, `/registro` público, `/parcelas` protegido (listado y creación propia para ADMIN/FARMER) y `/estado` público.
- Tipos compartidos de telemetría y puertos para desacoplar fuentes demo/reales.
- Pruebas de configuración, salud HTTP y presentación de disponibilidad.

Hay un flujo fotográfico privado con proveedor IA **simulado**; no hay análisis OpenAI real, predicción hídrica validada ni control remoto de válvula. Las referencias de humedad son experimentales. La telemetría está probada con simulador, **no con ESP32 real**. Alta/habilitación visual de dispositivos para ADMIN propietario disponible; asignación entre cuentas, rotación de claves y administración avanzada pendientes. No desplegar esta base como producto terminado.

## Especificaciones

- [Guía de presentación estudiantil](docs/GUIA_PRESENTACION.md): guion de siete
  minutos, recorrido, preguntas y alternativa si falla internet.

- [Simulaciones sintéticas y pruebas aisladas](docs/synthetic-simulations.md):
  `simulation:preview` muestra escenarios ficticios offline, sin tocar la cuenta,
  hardware ni OpenAI. Pruebas por contrato e integración temporal separadas.

- [Preparación operativa: salud, HTTPS, respaldo y recuperación](docs/operations.md).
  Herramientas `ops:check`, `ops:health` y `ops:backup`; plantillas sin activar,
  sin despliegue ni conexión OpenAI.

- [Preparación para conectar el ESP32 sin modificar firmware](docs/ESP32_PREPARACION.md)
  y [ficha de integración pendiente](docs/ESP32_FICHA_INTEGRACION.md).
  `npm run iot:check -- --demo` comprueba el JSON offline, sin enviar lecturas
  ni necesitar credenciales. La red y provisión REAL requieren revisión aparte.

- [Exportación autenticada de lecturas de suelo para evaluación offline](docs/prediction-offline-export.md):
  descarga JSON por parcela propia, dispositivo y origen, sin entrenamiento HTTP
  ni pronósticos operativos. Disponible en **Predicción hídrica → Exportar para
  evaluación offline**; [guía del formulario](docs/prediction-offline-export-ui.md).

- [Resumen de entrega y guía para que el compañero continúe](docs/CONTINUAR.md).

- [Entrada para agentes](AGENTS.md).
- [Instrucciones de desarrollo](AGENTS_CacaoSmart_v1.4.md).
- [DERCAS: requisitos y contratos](contexto/DERCAS_CacaoSmart_v1.4.md).
- [Referencia visual](contexto/DISENO_VISUAL_CacaoSmart.md).
- [Resultados y límites de la fase 1](docs/phase-1.md).
- [Seguridad, endpoints y resultados de la fase 2](docs/phase-2.md).
- [Registro público de agricultores](docs/registration.md).
- [Telemetría, simulador y resultados de fase 3](docs/phase-3.md).
- [Dashboard, Socket.IO y pruebas de navegador de fase 4](docs/phase-4.md).
- [Rangos por sensor, permisos y auditoría de fase 5.1](docs/phase-5.md).
- [Consulta y presentación de rangos en Angular de fase 5.2](docs/phase-5-2.md).
- [Edición visual de rangos para ADMIN propietario de fase 5.3](docs/phase-5-3.md).
- [Clasificación de lecturas en tarjetas de fase 5.4](docs/phase-5-4.md).
- [Límites históricos de A/B/C por vigencia de fase 5.5](docs/phase-5-5.md).
- [Alertas persistentes de desconexión y reconocimiento de fase 5.6](docs/phase-5-6.md).
- [Baja humedad por sonda, margen y reconocimiento de fase 5.7](docs/phase-5-7.md).
- [Historial de riego observado de fase 5.8](docs/phase-5-8.md).
- [Reportes CSV de telemetría y riego observado de fase 5.9](docs/phase-5-9.md).
- [Evento de riego y refresco REST del historial de fase 5.10](docs/phase-5-10.md).
- [Estado independiente de sensores y refresco REST de fase 5.11](docs/phase-5-11.md).
- [Fechas personalizadas del gráfico y tabla de humedad de fase 5.12](docs/phase-5-12.md).
- [Comparación de implementación y pendientes frente a DERCAS](docs/requirements-status.md).
- [Guía para colaboradores](CONTRIBUTING.md).
- [Estado y siguiente tarea para retomar el desarrollo](docs/HANDOFF.md).

DERCAS es la fuente de verdad funcional. La referencia visual orienta la interfaz, no demuestra mediciones ni valida umbrales agronómicos.

## Requisitos y versiones verificadas

| Herramienta                    | Versión verificada                                      |
| ------------------------------ | ------------------------------------------------------- |
| Node.js                        | 22.18.0; proyecto compatible con la rama 22 desde 22.12 |
| npm para instalar dependencias | 11.6.2, ejecutable con `npx` sin actualizar npm global  |
| Git                            | 2.50.1                                                  |
| Docker Engine                  | 29.5.3                                                  |
| Docker Compose                 | 5.1.4                                                   |
| Angular                        | 21.2.26; CLI/build 21.2.30                              |
| NestJS                         | 11.2.11                                                 |
| Prisma / adaptador PostgreSQL  | 7.10.1                                                  |
| PostgreSQL                     | Imagen `postgres:17-alpine`                             |

Las dependencias resueltas se conservan en `package-lock.json`. Usar la versión de npm indicada para instalar: npm 10.9.3 y 10.9.4 fallaron al resolver dependencias opcionales del árbol de Vitest con `Cannot read properties of null (reading 'edgesOut')`. No se cambió la instalación global de Node.js ni npm.

## Arranque local

**Presentación estudiantil en este PC:** [guía breve local](docs/LOCAL.md).
`npm.cmd run local:start` inicia API y Angular si ambos puertos están libres;
`local:check` revisa configuración y `local:health` comprueba API/base.
No cambia `.env` ni Neon, no inicia respaldos/simulador ni conecta OpenAI.

**Si el `.env` ya apunta a Neon:** iniciar únicamente API y Angular; no hace falta
Docker ni `db:up`. Para respaldar y ensayar recuperación sin tocar la principal,
usar `npm.cmd run backup:neon`. Ver [Neon: arranque, respaldo y pruebas
aisladas](docs/neon-backup-and-validation.md). Los pasos Docker siguientes siguen
siendo válidos solo para la configuración PostgreSQL local anterior.

Ejecutar desde la raíz del proyecto, con Docker activo:

```powershell
node scripts/setup-env.mjs
node scripts/setup-auth-env.mjs
npx --yes npm@11.6.2 ci
npm run db:generate
npm run db:validate
npm run db:up
npm run db:migrate
```

El primer comando crea `.env` con una contraseña aleatoria **sin imprimirla**. Si ya existe, no lo sobrescribe. No compartir ni versionar ese archivo. El archivo `.env.example` solo documenta variables y no contiene credenciales reales.

`setup-auth-env` incorpora `JWT_SECRET` a un entorno anterior sin sobrescribir variables. `db:migrate` aplica migraciones pendientes mediante `migrate deploy`, sin resetear datos. No usar `db push` ni `migrate reset` para sustituir migraciones.

Iniciar la API en una terminal:

```powershell
npm run dev:backend
```

Iniciar Angular en otra terminal:

```powershell
npm run dev:frontend
```

Direcciones por defecto:

- Inicio de sesión: <http://localhost:4200/login> (también desde la raíz sin sesión).
- Crear cuenta de agricultor: <http://localhost:4200/registro>.
- Parcelas propias: <http://localhost:4200/parcelas>.
- Estado público: <http://localhost:4200/estado>.
- API activa: <http://127.0.0.1:3100/api/v1/health/live>.
- Base disponible: <http://127.0.0.1:3100/api/v1/health/ready>.
- Swagger: <http://127.0.0.1:3100/api/v1/docs>.
- OpenAPI JSON: <http://127.0.0.1:3100/api/v1/docs-json>.
- PostgreSQL: `127.0.0.1:5433`, accesible únicamente desde el equipo local.

El proxy de desarrollo de Angular envía `/api/**` y `/socket.io/**` (con upgrade WebSocket) a la API. Reiniciar `dev:frontend` tras actualizar el proxy. Una compilación de producción necesitará un proxy inverso equivalente y HTTPS; no se ha configurado hosting ni despliegue.

### Variables de entorno

| Variable            | Función                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`          | `development`, `test` o `production`                                                                                           |
| `HOST`              | Dirección donde escucha NestJS; por defecto `127.0.0.1`                                                                        |
| `PORT`              | Puerto de API; por defecto `3100`                                                                                              |
| `CORS_ORIGIN`       | Un origen HTTP(S) explícito, sin rutas ni comodines                                                                            |
| `POSTGRES_USER`     | Usuario de la base local                                                                                                       |
| `POSTGRES_DB`       | Nombre de la base local                                                                                                        |
| `POSTGRES_PORT`     | Puerto publicado por Compose; por defecto `5433`                                                                               |
| `POSTGRES_PASSWORD` | Contraseña local utilizada por Compose                                                                                         |
| `DATABASE_URL`      | URL PostgreSQL privada utilizada por Prisma                                                                                    |
| `TELEMETRY_MODE`    | `real` o `demo`; `demo` permite explícitamente dispositivos y consultas demo fuera de producción; nunca sustituye datos reales |

Si se cambian usuario, contraseña, puerto o base, mantener `DATABASE_URL` coherente y codificar caracteres especiales de las credenciales en la URL. Si se cambia el puerto de API, actualizar también `frontend/proxy.conf.json`. Cambiar credenciales en `.env` no modifica automáticamente usuarios de un volumen PostgreSQL ya inicializado: no borrar el volumen para resolverlo sin autorización.

No se requieren claves de OpenAI ni credenciales del ESP32 en esta fase. No añadirlas al frontend.

Variables adicionales: `JWT_SECRET` debe contener 64 caracteres hexadecimales aleatorios; se genera localmente. `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` se usan solo para el alta inicial por CLI, no como credenciales de acceso permanentes en configuración.

## Registrarse como agricultor

Abrir `/login` y pulsar **Crear cuenta de agricultor**, o entrar directamente en `/registro`. Completar nombre, correo, contraseña de 8–128 caracteres con al menos una mayúscula y un símbolo, y confirmación. Los espacios no cuentan como símbolo; no se exige un número. Al terminar, la cuenta se guarda en PostgreSQL con contraseña Argon2id e inicia sesión automáticamente. No hace falta usar la terminal para registrarse como agricultor.

El registro público solo crea `FARMER`, no acepta roles ni propietarios del cliente y no asigna parcelas automáticamente. Todavía no existe verificación del correo por enlace ni recuperación de contraseña; se valida el formato, no la posesión del correo. El límite es de 3 solicitudes por minuto por IP, con mensajes para datos inválidos, duplicados o indisponibilidad. Ver [registro](docs/registration.md).

## Crear el primer administrador local (solo administración)

**Los agricultores ya pueden crear parcelas propias:** en **Mis parcelas**, completar nombre, ubicación y superficie opcional y pulsar **Crear parcela**. No hace falta cambiar a ADMIN. La parcela nueva comienza sin dispositivos ni mediciones; editar/archivar parcelas y provisionar dispositivos siguen reservados a ADMIN propietario. Ver [alcance y prueba manual](docs/farmer-plots.md).

No existen usuarios ni contraseñas predeterminados. Tras aplicar la migración:

1. Editar **el `.env` local ignorado por Git**, sin compartirlo, y añadir `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` con los datos elegidos. Usar una contraseña única de 8–128 caracteres con al menos una mayúscula y un símbolo; no pegarla en el chat ni escribirla en comandos que queden en el historial. Usar comillas si contiene espacios o caracteres especiales de dotenv.
2. Ejecutar `npm run admin:create`.
3. Retirar las tres variables `BOOTSTRAP_ADMIN_*` del archivo después del alta.
4. Abrir `/login` e ingresar con el correo y contraseña elegidos.

La CLI solo admite desarrollo con PostgreSQL local, guarda Argon2id y no imprime la contraseña. Si ya existe un administrador no modifica ni sobrescribe cuentas. La creación inicial se prueba en una base temporal, sin crear cuentas de prueba en la base principal.

### Política de acceso inicial

- ADMIN: crea agricultores y gestiona únicamente sus propias parcelas/dispositivos. Ser ADMIN **no** permite leer parcelas ajenas.
- FARMER: crea parcelas propias y consulta sus parcelas/dispositivos. No edita/archiva parcelas ni modifica dispositivos o rangos.
- El propietario de nuevas parcelas se obtiene del JWT validado, nunca de un `ownerId` enviado por el cliente.
- Hay registro público solo de FARMER, autorizado por solicitud posterior del usuario. No hay alta de ADMIN por HTTP, transferencia de propiedad ni bypass global. La provisión/asignación de parcelas para agricultores requiere un flujo administrativo explícito pendiente; no asignar recursos silenciosamente ni editar IDs para simular permisos.

El JWT Angular vive solo en memoria y dura hasta 15 minutos, pero se renueva automáticamente mediante una cookie HttpOnly/Strict, con máximo absoluto de sesión de 8 horas. Recargar recupera una sesión válida; Salir revoca la sesión vinculada en el servidor. No se guardan contraseñas ni tokens en localStorage/sessionStorage. API y Socket.IO revalidan usuario, rol y sesión. Usar el origen frontend configurado (localmente localhost:4200); antes de producción revisar HTTPS, recuperación, retención y administración completa. Ver [renovación de sesión](docs/session-renewal.md).

La tabla de endpoints, paginación y manejo de claves de dispositivo está en [fase 2](docs/phase-2.md) y Swagger. Mantener privadas las respuestas de login y de creación de dispositivo: contienen secretos de sesión o provisión.

## Telemetría y simulación local

**ThingSpeak REAL:** cliente e importador local del canal confirmado, con mapa
field1 temperatura / field2 humedad ambiental / field3 suelo A / field4 relé
(1 activo, 0 apagado; no confirma apertura física). Consulta cada
20 s cuando se habilita explícitamente; B/C sin datos, deduplicación por entry_id,
fecha del proveedor separada de recepción en NestJS. No descarga el histórico
completo ni cambia firmware/riego. Ver [configuración, uso y límites](docs/thingspeak.md).

**Simulación de lluvia anterior:** retirada del dashboard por petición del usuario.
Se conserva su código y [documentación histórica](docs/rain-simulation.md), sin acceso
desde la tarjeta de clima actual.

**Clima actual:** sustituye la tarjeta Lluvia, sin simulación. Condición, temperatura,
sensación térmica, humedad y precipitación modeladas por Open-Meteo, separadas del
ESP32. **Elegir ciudad** permite buscar y seleccionar por ciudad/región/país dentro
de la tarjeta, sin escribir coordenadas ni cambiar la parcela; selección temporal.
Requiere proveedor habilitado y confirmación de uso no comercial en el `.env`
privado. No se inventan datos si falta configuración o falla el servicio.
Ver [activación y límites](docs/current-weather-card.md).

**Agua y consumo → Ver ejemplo:** muestra 100 L frente a 80 L y una diferencia
ficticia de 20 L (20 %) dentro de esa misma tarjeta, sin salir del dashboard.
No representa consumo/ahorro real, no se guarda ni se exporta.
Ver [ejemplo local y límites](docs/water-consumption-example.md).

`POST /api/v1/iot/telemetry` requiere **`X-Device-Id` (UUID persistente, no serial)** y **`X-Device-Key`**. Un JWT de usuario no sirve para ingresar lecturas. El dispositivo fija `source` al provisionarlo; el mensaje no puede cambiarlo. Snapshot: `GET /api/v1/plots/:id/dashboard`; histórico: `GET /api/v1/plots/:id/readings`, ambos con JWT y propiedad de parcela.

Para usar el simulador **de forma explícita**, sin crear cuentas ni alterar dispositivos reales:

1. Aplicar `npm run db:migrate`. Configurar `NODE_ENV=development` y `TELEMETRY_MODE=demo` en el `.env` privado; reiniciar la API si hace falta.
2. Elegir el UUID de un propietario activo existente, obtenido de su sesión o administración autorizada. La CLI local puede provisionar una parcela DEMO para ese propietario; no transfiere parcelas existentes.
3. Ejecutar `npm run simulator:provision -- --owner UUID_DEL_PROPIETARIO`. Crea parcela/dispositivo **DEMO** y `.local/simulator.json` privado, ignorado por Git. No imprime la clave y no sobrescribe configuración anterior.
4. Con API local iniciada, ejecutar `npm run simulator -- --count 5` para cinco eventos, o `npm run simulator` hasta **Ctrl+C**. Publica cada 5 segundos, con tres variaciones independientes y sin órdenes de control físico.
5. Abrir **Mis parcelas → Panel de monitoreo**, elegir **Datos simulados · DEMO** y el dispositivo provisionado. También se puede consultar snapshot/histórico con `source=demo` y su `deviceId`. El origen real continúa siendo el predeterminado.

Detalles, límites, calidad e idempotencia en [fase 3](docs/phase-3.md). No se ha creado una demo automáticamente en la base principal.

En modo continuo, el simulador espera y se reconecta si la API local se reinicia o devuelve 429/5xx, conservando el mismo evento para evitar duplicados. Los lotes con `--count` mantienen reintentos acotados. Errores de autenticación, payload rechazado u origen no DEMO siguen deteniendo la simulación; Ctrl+C cancela también la espera de recuperación.

## Salud del servicio

**Protección de datos local:** disponible
[respaldo periódico opcional con verificación](docs/periodic-backups.md).
`npm run backup:periodic -- --once` crea y verifica una copia; el modo continuo
requiere activarlo explícitamente y mantener el proceso abierto. No está
programado automáticamente ni elimina copias anteriores.
Para otra unidad, usar el [comando de segunda copia verificada](docs/external-backup-copy.md);
la copia a F: no se actualiza automáticamente.

| Endpoint                                  | Significado                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`                 | `200`: proceso activo; no consulta PostgreSQL                                                  |
| `GET /api/v1/health/ready`                | `200`: PostgreSQL responde a `SELECT 1` mediante Prisma                                        |
| `GET /api/v1/health/ready` con base caída | `503`: `{ "status": "unavailable", "database": "down" }`; sin errores internos ni credenciales |

Estas comprobaciones **no acreditan conexión del ESP32**, calidad de sensores ni existencia de tablas de negocio. La API puede arrancar sin que PostgreSQL esté disponible; la readiness refleja el fallo. La UI identifica cuándo se hizo la última consulta y permite repetirla; no es un monitor continuo.

Swagger solo se habilita fuera de producción. Los endpoints de negocio requieren JWT por defecto; ingesta IoT requiere su credencial independiente. Únicamente login, registro de agricultores y salud son públicos. La UI no sustituye los permisos del servidor.

## Comandos de verificación

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
npm run db:validate
npm run test:integration
npm run test:simulator
npm run test:browser
```

Con API y PostgreSQL iniciados:

```powershell
npm run smoke
```

`smoke` verifica salud y OpenAPI en desarrollo; `SMOKE_API_URL` permite cambiar la URL base. `npm test` ejecuta pruebas unitarias/HTTP con base simulada y componentes Angular. `test:integration` crea una base temporal local `cacaosmart_test_<aleatorio>` **por suite**, aplica migraciones y prueba seguridad/telemetría con PostgreSQL real; elimina **solo esas bases generadas** al terminar, nunca resetea la principal. Requiere permiso local para crear/eliminar bases y no se admite en producción. `test:simulator` verifica series, configuración y reintentos sin tocar la base. La prueba manual de caída y recuperación de PostgreSQL está registrada en [fase 1](docs/phase-1.md).

Para iniciar la API compilada, después de `npm run build`:

```powershell
npm run start --workspace=@cacaosmart/backend
```

No ejecutarla al mismo tiempo que la API de desarrollo en el mismo puerto.

### Detener servicios sin borrar datos

- `Ctrl+C` en cada terminal de desarrollo.
- `npm run db:stop` para detener exclusivamente PostgreSQL de CacaoSmart.
- `npm run db:up` para volver a iniciarlo, conservando el volumen.

Compose usa el proyecto `cacaosmart-local` y el volumen `cacaosmart-local_postgres_data`. No requiere modificar otros contenedores. No ejecutar eliminación de volúmenes ni migraciones destructivas sin autorización.

## Estructura

```text
frontend/                 Angular: acceso, parcelas, dashboard y estado técnico
backend/src/config/       Validación de entorno
backend/src/database/     Prisma y adaptador PostgreSQL
backend/src/health/       Liveness y readiness
backend/src/auth/         JWT, Argon2id y guardias globales
backend/src/users/        Alta restringida de agricultores
backend/src/plots/        CRUD propio con archivo lógico
backend/src/devices/      Dispositivos, sensores y autenticación IoT
backend/src/iot-ingestion/ Endpoint canónico autenticado v1.2
backend/src/telemetry/    Normalización, persistencia, snapshot e histórico
scripts/simulator*.mjs   Provisión DEMO explícita y simulador local
backend/src/realtime/     Socket.IO autenticado y autorizado por parcela
backend/src/integrations/ Contrato de adaptador externo, sin URL inventada
backend/prisma/           Esquema y migración inicial versionada
packages/contracts/      Tipos compartidos sin código ejecutable
scripts/                 Entorno local y smoke de salud
contexto/                Requisitos y referencia visual
docs/                    Verificación y decisiones de implementación
```

El paquete de contratos solo contiene tipos: la validación HTTP se hace en los DTO NestJS, incluida la ingesta IoT. `TelemetryDataSource` ya tiene implementaciones real/demo contra la API y `TelemetryFacade` mantiene la UI desacoplada. La interfaz del receptor externo sigue pendiente de un contrato auténtico.

## Seguridad y pendientes

La auditoría de dependencias conserva avisos, registrados en [fase 1](docs/phase-1.md). No se aplicó `npm audit fix --force`, no se desactivó la auditoría y no se considera el proyecto listo para producción. Revisar dependencias antes de publicar o desplegar.

La edición ADMIN, clasificación numérica, límites históricos por vigencia, alertas de desconexión/baja humedad, historial de riego con fechas personalizadas, CSV, eventos separados y fechas del gráfico/tabla de humedad están implementados. También alta/habilitación visual de equipos, edición/archivo de parcelas propias para ADMIN y diagnóstico fotográfico **simulado** con historial filtrado y comparación manual de fotos. Falta configurar márgenes explícitos por sonda; no se inventan automáticamente. Gestión entre cuentas, rotación/restauración, OpenAI real (en espera) y clima/predicción siguen pendientes. Todo el alcance de DERCAS se conserva. Resolver el flujo de asignación antes de usarlo en campo. Ver [comparación de requisitos](docs/requirements-status.md).

El ESP32 mantiene el control local del riego. Sin calibración, caudal o línea base no se afirmarán litros, ahorro ni umbrales válidos. La IA será orientativa y nunca controlará la válvula.
