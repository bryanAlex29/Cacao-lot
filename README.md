# CacaoSmart IoT

Monitoreo y riego inteligente para cacao en Chone, Manabí, Ecuador. Proyecto TerriTech Hackathon CITIC 2026.

## Estado actual: fase 5.7 (baja humedad por sonda)

Base ejecutable con **Angular + NestJS + PostgreSQL/Prisma**, registro, parcelas propias y **dashboard de telemetría en vivo** con tres zonas. La pantalla pública `/estado` comprueba salud real de API/PostgreSQL. Hay alertas persistentes de desconexión y baja humedad por sonda; la migración de humedad fue verificada en bases temporales y aplicada localmente con autorización, preservando datos anteriores. IA y métricas hídricas siguen pendientes, sin resultados inventados.

Fase 5: **rangos min/max por UUID de sensor**, con permisos por propietario, auditoría atómica y versión para ediciones concurrentes. ADMIN propietario puede editarlos desde «Configurar rango»; FARMER conserva solo lectura. Las tarjetas de A/B/C, temperatura y humedad ambiental comparan las lecturas recientes con su rango: **Bajo / En rango / Alto**, manteniendo calidad, antigüedad y real/DEMO por separado. Los extremos son inclusivos; sin configuración no se inventan límites. La comparación es numérica, no diagnóstico ni prueba de calibración. El gráfico de suelo añade mínimos/máximos **por vigencia**: cambiar hoy un rango no lo aplica al pasado. Ver [API de fase 5.1](docs/phase-5.md), [consulta de fase 5.2](docs/phase-5-2.md), [edición de fase 5.3](docs/phase-5-3.md), [clasificación de fase 5.4](docs/phase-5-4.md) y [límites históricos de fase 5.5](docs/phase-5-5.md).

**Alertas de desconexión (5.6):** el backend detecta más de cinco intervalos sin mensajes, incluso sin navegador abierto. Guarda un episodio activo por dispositivo; ADMIN o FARMER propietario puede reconocerlo sin cerrar la condición. Un mensaje nuevo aceptado restablece contacto y conserva el historial. Sin contacto previo no se inventa desconexión. El panel separa real/DEMO, errores y reconocimiento; no abre válvulas ni evalúa humedad. Ver [fase 5.6](docs/phase-5-6.md).

**Baja humedad (5.7):** tres lecturas consecutivas bajo el mínimo por A/B/C; recuperación con tres ≥ mínimo + margen positivo configurado, sin defaults. Datos inválidos/ausentes/antiguos rompen confirmaciones sin resolver; reales sin calibrar no cuentan. Cambio de rango/margen cierra por configuración, no recuperación. Panel/configuración ADMIN y reconocimiento propietario independientes del riego. **Migración aplicada localmente; configurar el margen de cada sonda explícitamente para habilitarla.** Ver [fase 5.7](docs/phase-5-7.md).

- Angular standalone, Router, HttpClient y detección de cambios sin Zone.js.
- API NestJS con entorno validado, CORS restringido, validación global y OpenAPI en desarrollo.
- PostgreSQL en Docker Compose aislado del resto de proyectos.
- Prisma con adaptador PostgreSQL y migración inicial de usuarios, parcelas, dispositivos y sensores.
- JWT de 15 minutos, contraseñas Argon2id, permisos por rol y propietario, validación y limitación de solicitudes.
- Registro de dispositivos con clave aleatoria visible una vez y seis sensores en una operación atómica; ingesta autenticada, idempotente y transaccional.
- Snapshot e histórico REST por propietario, origen y dispositivo; simulador local determinista de tres sondas.
- Socket.IO con JWT y permisos por parcela/dispositivo/origen, reconexión y recuperación REST.
- Angular: `/login`, `/registro` público, `/parcelas` protegido (listado y creación propia para ADMIN) y `/estado` público.
- Tipos compartidos de telemetría y puertos para desacoplar fuentes demo/reales.
- Pruebas de configuración, salud HTTP y presentación de disponibilidad.

No hay análisis IA, predicción ni control remoto de válvula implementados. El recorrido completo hasta Angular está probado con simulador, **no con ESP32 real**. Gestión de dispositivos y altas de agricultores disponibles mediante API, no mediante formularios Angular todavía. No desplegar esta base como producto terminado.

## Especificaciones

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

No existen usuarios ni contraseñas predeterminados. Tras aplicar la migración:

1. Editar **el `.env` local ignorado por Git**, sin compartirlo, y añadir `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` con los datos elegidos. Usar una contraseña única de 8–128 caracteres con al menos una mayúscula y un símbolo; no pegarla en el chat ni escribirla en comandos que queden en el historial. Usar comillas si contiene espacios o caracteres especiales de dotenv.
2. Ejecutar `npm run admin:create`.
3. Retirar las tres variables `BOOTSTRAP_ADMIN_*` del archivo después del alta.
4. Abrir `/login` e ingresar con el correo y contraseña elegidos.

La CLI solo admite desarrollo con PostgreSQL local, guarda Argon2id y no imprime la contraseña. Si ya existe un administrador no modifica ni sobrescribe cuentas. La creación inicial se prueba en una base temporal, sin crear cuentas de prueba en la base principal.

### Política de acceso inicial

- ADMIN: crea agricultores y gestiona únicamente sus propias parcelas/dispositivos. Ser ADMIN **no** permite leer parcelas ajenas.
- FARMER: consulta sus parcelas y dispositivos; no los modifica.
- El propietario de nuevas parcelas se obtiene del JWT validado, nunca de un `ownerId` enviado por el cliente.
- Hay registro público solo de FARMER, autorizado por solicitud posterior del usuario. No hay alta de ADMIN por HTTP, transferencia de propiedad ni bypass global. La provisión/asignación de parcelas para agricultores requiere un flujo administrativo explícito pendiente; no asignar recursos silenciosamente ni editar IDs para simular permisos.

La sesión Angular vive solo en memoria: recargar la página o cerrar sesión elimina el token del cliente. El JWT expira en 15 minutos, sin refresh ni revocación individual inmediata al salir. En cada solicitud el backend vuelve a comprobar usuario activo y rol. Antes de producción se deben definir recuperación de contraseña, revocación y administración completa.

La tabla de endpoints, paginación y manejo de claves de dispositivo está en [fase 2](docs/phase-2.md) y Swagger. Mantener privadas las respuestas de login y de creación de dispositivo: contienen secretos de sesión o provisión.

## Telemetría y simulación local

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

La edición ADMIN, clasificación numérica, límites históricos por vigencia y alertas de desconexión/baja humedad están implementadas, con migraciones locales aplicadas. Falta configurar márgenes explícitos por sonda; no se inventan automáticamente. Cualquier incremento posterior requiere autorización; eventos de riego, reportes, diagnóstico IA y clima/predicción siguen pendientes. Todo el alcance de DERCAS se conserva. Resolver el flujo de asignación de parcelas antes de usarlo en campo. Ver [fase 5.7](docs/phase-5-7.md), [fase 5.6](docs/phase-5-6.md) y [histórico](docs/phase-5-5.md).

El ESP32 mantiene el control local del riego. Sin calibración, caudal o línea base no se afirmarán litros, ahorro ni umbrales válidos. La IA será orientativa y nunca controlará la válvula.
