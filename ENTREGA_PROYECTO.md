# CacaoSmart IoT — Documento de entrega y continuidad

**Fecha de corte:** 21 de noviembre de 2026

**Estado funcional:** fase 5.7, monitoreo y alertas por sonda

**Destino:** compañero desarrollador y su asistente de programación

**Formato:** Markdown, legible directamente en GitHub

> Este documento describe lo implementado, sus límites y cómo continuar. No contiene credenciales ni sustituye los requisitos. Que una función esté implementada o probada con simulación no significa que esté validada con el ESP32 real ni lista para producción.

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Documentos que se deben leer](#2-documentos-que-se-deben-leer)
3. [Arquitectura y tecnologías](#3-arquitectura-y-tecnologías)
4. [Funcionalidades implementadas](#4-funcionalidades-implementadas)
5. [Reglas de rangos y alertas](#5-reglas-de-rangos-y-alertas)
6. [Mapa del repositorio y API](#6-mapa-del-repositorio-y-api)
7. [Instalación en otro equipo](#7-instalación-en-otro-equipo)
8. [Pruebas y resultados](#8-pruebas-y-resultados)
9. [Estado local que no se transfiere por Git](#9-estado-local-que-no-se-transfiere-por-git)
10. [Pendientes y siguiente trabajo](#10-pendientes-y-siguiente-trabajo)
11. [Preparación para subir a Git](#11-preparación-para-subir-a-git)
12. [Prompt listo para continuar con una IA](#12-prompt-listo-para-continuar-con-una-ia)
13. [Lista de aceptación de la entrega](#13-lista-de-aceptación-de-la-entrega)

## 1. Resumen ejecutivo

CacaoSmart IoT es un proyecto de monitoreo agrícola para cacao en Chone, Manabí, Ecuador, desarrollado para TerriTech Hackathon CITIC 2026.

La aplicación web permite consultar las mediciones de **tres sondas de humedad de suelo independientes**, temperatura, humedad ambiental, lluvia y estado informado del relé. Incluye autenticación, parcelas propias, histórico, configuración de rangos, alertas de desconexión y alertas de baja humedad.

### Qué está listo en código

- Base Angular + NestJS + PostgreSQL/Prisma.
- Registro de agricultores, login y permisos por rol/propietario.
- Parcelas, dispositivos e identidades persistentes de sensores.
- Ingesta autenticada e idempotente de telemetría.
- Dashboard y actualizaciones mediante Socket.IO, con recuperación REST.
- Simulador local identificado como DEMO.
- Rangos por sensor con auditoría y edición ADMIN.
- Clasificación numérica y límites históricos por vigencia.
- Alertas persistentes de desconexión y baja humedad, con reconocimiento.
- Migraciones, pruebas y documentación de cada incremento.

### Qué todavía no se puede afirmar

- No se ha verificado el recorrido completo con el ESP32 real.
- No hay integración operativa con un servidor receptor externo.
- No hay control remoto de válvula desde la web.
- No hay diagnóstico IA, clima ni predicción implementados.
- No hay litros medidos, ahorro validado ni diagnóstico agronómico derivado de los colores de las tarjetas.
- No se ha desplegado ni declarado listo para producción.

**Importante para la entrega:** al preparar este documento hay cambios de desarrollo modificados y archivos nuevos todavía sin commit. El compañero solo recibirá los archivos que realmente se incluyan en los commits y se publiquen. Compartir únicamente este documento no transfiere las funcionalidades.

## 2. Documentos que se deben leer

Orden recomendado:

1. [AGENTS.md](AGENTS.md): entrada para agentes.
2. [Instrucciones de desarrollo](AGENTS_CacaoSmart_v1.4.md): stack, límites y forma de trabajo.
3. [DERCAS v1.4](contexto/DERCAS_CacaoSmart_v1.4.md): **fuente de verdad funcional**.
4. [Referencia visual](contexto/DISENO_VISUAL_CacaoSmart.md): necesaria si se cambia la interfaz.
5. [README](README.md): arranque, comandos y configuración.
6. [HANDOFF](docs/HANDOFF.md): estado técnico y decisiones de continuidad.
7. [CONTRIBUTING](CONTRIBUTING.md): colaboración mediante Git.

Documentación por fase:

| Documento                        | Contenido                                    |
| -------------------------------- | -------------------------------------------- |
| [Fase 1](docs/phase-1.md)        | Base técnica, entorno y salud                |
| [Fase 2](docs/phase-2.md)        | Seguridad, usuarios, parcelas y dispositivos |
| [Registro](docs/registration.md) | Registro público FARMER                      |
| [Fase 3](docs/phase-3.md)        | Telemetría y simulador                       |
| [Fase 4](docs/phase-4.md)        | Tiempo real y dashboard                      |
| [Fase 5.1](docs/phase-5.md)      | Modelo/API de rangos y auditoría             |
| [Fase 5.2](docs/phase-5-2.md)    | Consulta de rangos en Angular                |
| [Fase 5.3](docs/phase-5-3.md)    | Edición visual ADMIN                         |
| [Fase 5.4](docs/phase-5-4.md)    | Clasificación de las tarjetas                |
| [Fase 5.5](docs/phase-5-5.md)    | Límites históricos por vigencia              |
| [Fase 5.6](docs/phase-5-6.md)    | Alertas de desconexión                       |
| [Fase 5.7](docs/phase-5-7.md)    | Alertas de baja humedad                      |

Los documentos de fases anteriores conservan resultados y pendientes de aquel momento. Por ejemplo, una nota histórica que diga «baja humedad pendiente» no invalida la implementación posterior de 5.7. Leer el estado más reciente antes de recrear funciones.

Si aparece una contradicción funcional no resuelta con DERCAS, consultarla antes de implementar la parte afectada.

## 3. Arquitectura y tecnologías

```text
ESP32 / simulador explícito
    │ HTTPS/HTTP local + credencial de dispositivo
    ▼
NestJS: validación → transacción PostgreSQL → publicación Socket.IO
    │                         │
    │                         └─ lecturas, rangos, auditorías y alertas
    ▼
REST + Socket.IO autenticados con JWT de usuario
    ▼
Angular: parcelas, dashboard, histórico y paneles de alertas
```

Los detectores de alertas se ejecutan en el backend; no necesitan que el navegador esté abierto.

| Área                         | Tecnología                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Frontend                     | Angular 21, TypeScript, componentes standalone, Router, formularios reactivos |
| Estado y transporte frontend | Signals, RxJS, HttpClient y socket.io-client                                  |
| Backend                      | Node.js 22, TypeScript y NestJS 11                                            |
| Persistencia                 | PostgreSQL 17 y Prisma 7.10.1 con adaptador PostgreSQL                        |
| Autenticación                | JWT y Argon2id; credencial independiente para dispositivos                    |
| Contratos                    | Paquete compartido `@cacaosmart/contracts`                                    |
| Pruebas                      | Jest, Vitest/Angular y Playwright con Chromium compatible                     |
| Entorno local                | npm workspaces y Docker Compose para PostgreSQL                               |

Requisitos declarados: Node.js `^22.12.0`, npm `>=11.6.2`; el proyecto fija `npm@11.6.2` como gestor. Las últimas verificaciones locales utilizaron Node.js 22.23.5. Instalar con la versión de npm indicada y conservar `package-lock.json`.

**No sustituir el stack por React, Next.js, Firebase, MongoDB o Supabase sin autorización.**

## 4. Funcionalidades implementadas

### 4.1. Usuarios, sesión y permisos

- Registro público que crea únicamente cuentas `FARMER`.
- Login con JWT de 15 minutos y contraseñas almacenadas mediante Argon2id.
- Contraseñas nuevas: 8–128 caracteres, al menos una mayúscula y un símbolo. No se exige adicionalmente un número.
- Validación de entradas, límites de solicitudes y comprobación de usuario activo/rol en backend.
- `ADMIN` gestiona recursos propios; **no tiene acceso global a parcelas ajenas**.
- `FARMER` consulta sus recursos y puede reconocer sus alertas; no edita rangos ni márgenes.
- El registro no asigna parcelas automáticamente.
- La sesión Angular vive solo en memoria: una recarga completa elimina el token del cliente.

Pendientes de seguridad: verificación de correo, recuperación de contraseña, refresh de sesión y revocación individual inmediata. No se deben presentar como existentes.

### 4.2. Parcelas, dispositivos y sensores

- Gestión de parcelas propias con validación y archivo lógico.
- Creación/listado/detalle de dispositivos mediante API y controles de actividad.
- Credencial de dispositivo generada, visible una vez y almacenada como hash.
- Seis identidades persistentes: `soil_1`, `soil_2`, `soil_3`, `temperatureC`, `airHumidityPct` y `rainDetected`.
- UUID persistente del sensor para configurar sus rangos; el código A/B/C no sustituye ese UUID.

La gestión de dispositivos no tiene todavía un formulario Angular completo. Tampoco existe un flujo administrativo completo para asignar parcelas a agricultores.

### 4.3. Telemetría y simulación

- Ingreso canónico v1.2 mediante `POST /api/v1/iot/telemetry`.
- Autenticación con `X-Device-Id` y `X-Device-Key`; un JWT humano no sirve para enviar lecturas.
- Origen real/DEMO determinado por el dispositivo autenticado, no por una etiqueta libre del cliente.
- Unicidad por dispositivo + `eventId`: reintento idéntico no duplica lecturas.
- Reutilizar un mismo evento con contenido distinto produce conflicto.
- Persistencia transaccional de lectura y datos de las tres sondas.
- Valores ausentes permanecen `null`, no se sustituyen por cero ni por la lectura anterior.
- Se distinguen hora del dispositivo, recepción y origen temporal.
- Lecturas antiguas se conservan en el histórico sin desplazar la más reciente.
- Simulador determinista con tres variaciones independientes.
- El simulador continuo tolera interrupciones temporales de API conservando identidad y payload del evento; los errores permanentes no se ocultan.

### 4.4. Dashboard e histórico

- Ruta `/parcelas/:id/dashboard`, accesible desde Mis parcelas.
- Tres tarjetas de suelo independientes y tarjetas de ambiente/lluvia.
- Fecha de actualización, calidad y estado de conexión.
- Estado informado del relé separado de la confirmación física de válvula.
- Gráfico de tres series, filtros y consulta paginada de lecturas.
- Actualización Socket.IO con JWT y permisos por parcela, dispositivo y origen.
- Reconexión y recuperación por REST; sin fallback silencioso a datos ficticios.
- Vista móvil verificada, incluyendo un ancho de 390 px.

La tarjeta de diagnóstico IA es una función pendiente; no ofrece resultados reales de análisis. Consumo y ahorro permanecen no disponibles cuando faltan evidencias.

### 4.5. Correcciones importantes ya realizadas

**Enlace Alertas:** el antiguo enlace nativo `href="#alerts"` podía resolver contra el `base href` raíz y recargar la aplicación. Se perdía el JWT en memoria y aparecía login. Se corrigió con `RouterLink`, conservación de parámetros y desplazamiento/foco explícitos, incluso al repetir el clic.

**Botón Guardar margen:** el formulario necesitaba una directiva reactiva que conectara el evento `ngSubmit`. Se incorporó `FormGroup` y se verificó el envío real desde el navegador, no solo la llamada directa al método.

No se cambió el almacenamiento de sesión para resolver estos fallos. Otros enlaces nativos no se revisaron globalmente como parte de esa corrección.

## 5. Reglas de rangos y alertas

### 5.1. Rangos de monitoreo

- Mínimo y máximo por sensor y variable, con unidad coherente y `mínimo < máximo`.
- ADMIN propietario puede editar; FARMER propietario solo consulta.
- Sin configuración, mostrar «Sin rango configurado».
- Cada cambio guarda actor, fecha, valor anterior/nuevo y versión.
- Ediciones concurrentes usan versión esperada; un conflicto exige consultar/revisar, no sobrescribir.
- Bajo: valor < mínimo. En rango: mínimo ≤ valor ≤ máximo. Alto: valor > máximo.
- Calidad, antigüedad, comparación numérica y origen real/DEMO se presentan por separado.
- «En rango» **no significa calibrado ni cultivo sano**.
- La lluvia binaria no se interpreta como porcentaje ni precipitación en mm.

El histórico reconstruye intervalos de vigencia **[inicio, fin)** usando auditorías. Cambiar hoy un rango no modifica las líneas de ayer. La consulta admite hasta 31 días y un máximo interno de 1000 cambios; inconsistencias relevantes devuelven error en vez de inventar o truncar límites.

### 5.2. Alertas de desconexión

| Situación              | Comportamiento                                                                |
| ---------------------- | ----------------------------------------------------------------------------- |
| Activación             | Más de cinco intervalos de envío configurados desde `lastSeenAt` del servidor |
| Límite exacto          | Cinco intervalos exactos todavía no abren alerta                              |
| Sin contacto previo    | No se inventa desconexión                                                     |
| Reconocer              | Registra que el propietario vio el aviso; no cierra la condición              |
| Nuevo mensaje aceptado | Restablece contacto, aunque su medición sea antigua                           |
| Reintento idéntico     | No renueva contacto ni crea otro episodio                                     |
| Deshabilitar monitoreo | Cierre administrativo diferenciado                                            |
| Cambiar intervalo      | Cierre/reevaluación sin reescribir la evidencia anterior                      |

Una alerta activa por dispositivo, con evidencia y reconocimiento persistentes. Detector al arrancar/cada 5 segundos; el panel consulta cada 15 segundos. El cambio visual puede no ser instantáneo.

### 5.3. Alertas de baja humedad A/B/C

Las reglas siguientes fueron aprobadas; no están pendientes de decisión:

| Situación                                | Comportamiento                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Activación                               | Tres lecturas nuevas, recientes y consecutivas estrictamente bajo el mínimo |
| Recuperación                             | Tres consecutivas ≥ mínimo + margen de recuperación                         |
| Margen                                   | Positivo, en puntos porcentuales, configurado explícitamente por sonda      |
| Validación                               | Mínimo + margen ≤ máximo                                                    |
| Sin rango o margen                       | Alerta inhabilitada, con motivo visible                                     |
| Lectura que rompe la condición           | Reinicia el conteo correspondiente                                          |
| Datos ausentes/inválidos/antiguos        | Rompen confirmaciones, pero no resuelven un episodio activo                 |
| Duplicados/fechas iguales/fuera de orden | Se ignoran para confirmación                                                |
| Calidad real                             | Solo `valid`; datos reales sin calibrar no cuentan                          |
| Calidad DEMO                             | `valid` o `uncalibrated`, con identificación visible de simulación          |
| Reconocimiento                           | Independiente de recuperación; no cierra                                    |
| Cambio de rango o margen                 | Cierra por configuración modificada y reinicia; no es recuperación          |
| Silencio del equipo                      | No significa recuperación de humedad                                        |

Antigüedad y separación máximas entre lecturas: **dos intervalos configurados de envío**, incluyendo el límite exacto. Es un criterio técnico de frescura, no una recomendación agronómica.

Estado/cursor y episodios se guardan de forma durable. Una sola alerta activa por sonda; bloqueos e índice único parcial evitan duplicados por concurrencia. Detector independiente del navegador, al arrancar/cada 5 segundos, con lotes de hasta 100 lecturas por sonda/pasada.

La ingesta directa actual no acredita calibración de reales: no cambiar calidad a `valid` para «hacer funcionar» las alertas sin evidencia y contrato adecuados.

ADMIN configura el margen en **Alertas → Configuración de alertas A/B/C**. Los cambios no crean valores agronómicos predeterminados ni envían órdenes al ESP32.

## 6. Mapa del repositorio y API

### 6.1. Código

| Ruta                                                | Responsabilidad                                     |
| --------------------------------------------------- | --------------------------------------------------- |
| `frontend/src/app/core/auth/`                       | Sesión, interceptores y protección de acceso        |
| `frontend/src/app/core/telemetry/`                  | Fuentes y fachada reactiva de telemetría            |
| `frontend/src/app/core/sensor-thresholds/`          | Rangos, clasificación e histórico de vigencias      |
| `frontend/src/app/core/alerts/`                     | Clientes y fachadas de alertas                      |
| `frontend/src/app/features/dashboard/`              | Tarjetas, gráfico, editores y paneles               |
| `backend/src/auth/`, `users/`, `plots/`, `devices/` | Seguridad y gestión de recursos                     |
| `backend/src/iot-ingestion/`, `telemetry/`          | Ingesta, normalización y consultas                  |
| `backend/src/realtime/`                             | Socket.IO autenticado                               |
| `backend/src/integrations/`                         | Políticas de origen y contrato de adaptador externo |
| `backend/src/sensor-thresholds/`                    | Rangos, auditoría y vigencias                       |
| `backend/src/alerts/`                               | Desconexión y submódulo `moisture/`                 |
| `backend/prisma/`                                   | Esquema y migraciones                               |
| `backend/test/`                                     | Integración HTTP, PostgreSQL, Socket.IO y navegador |
| `packages/contracts/`                               | Tipos compartidos; no sustituye validación HTTP     |
| `scripts/`                                          | Entorno, provisión, simulador y runners             |

### 6.2. API clave

Todas las rutas siguientes son relativas a `/api/v1`. Los detalles completos de DTO y permisos se consultan en Swagger y los controladores.

| Ruta                                                       | Uso                                   |
| ---------------------------------------------------------- | ------------------------------------- |
| `POST /auth/login`, `POST /auth/register`                  | Acceso y registro FARMER              |
| `/plots` y recursos propios de dispositivos                | Gestión autorizada                    |
| `POST /iot/telemetry`                                      | Ingesta con credencial de dispositivo |
| `GET /plots/:id/dashboard`                                 | Snapshot                              |
| `GET /plots/:id/readings`                                  | Histórico paginado                    |
| `GET/PUT /sensors/:id/thresholds`                          | Rango actual                          |
| `GET /sensors/:id/thresholds/history`                      | Vigencias por periodo                 |
| `GET /plots/:plotId/alerts`                                | Desconexión por dispositivo/origen    |
| `POST /plots/:plotId/alerts/:alertId/acknowledge`          | Reconocer desconexión                 |
| `GET/PUT /sensors/:sensorId/moisture-alert-policy`         | Política de humedad                   |
| `GET /plots/:plotId/moisture-alerts`                       | Episodios de baja humedad             |
| `POST /plots/:plotId/moisture-alerts/:alertId/acknowledge` | Reconocer humedad                     |
| `GET /health/live`, `GET /health/ready`                    | Salud de proceso y PostgreSQL         |

PUT de política de humedad acepta únicamente `recoveryMarginPct`, `expectedVersion` y `expectedThresholdVersion`. Los reconocimientos no aceptan actor, fechas o cierre asignados por el cliente.

### 6.3. Migraciones incluidas

```text
20261120170000_identity_and_resources
20261121010000_telemetry
20261121011000_telemetry_index_name
20261121060000_sensor_thresholds
20261121080000_offline_alerts
20261121200000_moisture_alerts
```

La última añade política, auditoría, estado y episodios de humedad. **El nuevo guardado de rangos también depende de esas tablas**: el compañero debe aplicar todas las migraciones antes de usarlo.

No editar migraciones ya aplicadas, sustituirlas por `db push`, ejecutar resets ni borrar volúmenes para resolver un problema.

## 7. Instalación en otro equipo

Estos pasos son para un entorno **local de desarrollo**, no un procedimiento de producción.

### 7.1. Preparar herramientas

Comprobar Node.js 22 compatible, Git, npm y Docker con Compose. Tener Docker iniciado.

```powershell
node --version
npm --version
git --version
docker --version
docker compose version
```

Clonar la rama que contenga realmente la entrega, según la URL compartida por el propietario. Trabajar desde la raíz del monorepositorio; no instalar `frontend` y `backend` por separado.

### 7.2. Generar entorno e instalar

```powershell
node scripts/setup-env.mjs
node scripts/setup-auth-env.mjs
npx --yes npm@11.6.2 ci
npm run db:generate
npm run db:validate
npm run db:up
npm run db:migrate
```

- Los scripts generan secretos locales sin imprimirlos y no sobrescriben un `.env` existente.
- `db:migrate` ejecuta `migrate deploy`, aplicando las migraciones pendientes.
- El compañero debe generar su propio `.env`; no copiar el del desarrollador anterior.
- En Windows, si PowerShell bloquea `npm.ps1`, utilizar `npm.cmd` en lugar de `npm`, sin cambiar globalmente la política de ejecución por esta causa.
- No actualizar dependencias o regenerar el lockfile como paso de instalación.

Variables: `NODE_ENV`, `HOST`, `PORT`, `CORS_ORIGIN`, `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PORT`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `TELEMETRY_MODE` y `JWT_SECRET`. Consultar [.env.example](.env.example) y el README. Usuario/puerto/base deben ser coherentes con `DATABASE_URL`.

### 7.3. Arrancar servicios

Terminal 1:

```powershell
npm run dev:backend
```

Terminal 2:

```powershell
npm run dev:frontend
```

Direcciones predeterminadas:

| Servicio              | Dirección                                   |
| --------------------- | ------------------------------------------- |
| Login                 | `http://localhost:4200/login`               |
| Registro FARMER       | `http://localhost:4200/registro`            |
| Parcelas              | `http://localhost:4200/parcelas`            |
| Estado público        | `http://localhost:4200/estado`              |
| API activa            | `http://127.0.0.1:3100/api/v1/health/live`  |
| PostgreSQL disponible | `http://127.0.0.1:3100/api/v1/health/ready` |
| Swagger               | `http://127.0.0.1:3100/api/v1/docs`         |
| PostgreSQL local      | `127.0.0.1:5433`                            |

Angular escucha en `localhost`; en el equipo de origen resolvió a IPv6 `::1`. Si `127.0.0.1:4200` falla pero `localhost:4200` abre, no asumir que Angular está caído.

El proxy Angular conecta API y Socket.IO. No ejecutar dos APIs simultáneas sobre el mismo puerto. Swagger solo se habilita fuera de producción.

### 7.4. Crear cuentas locales

No hay usuarios ni contraseñas predeterminados.

- Para FARMER, usar `/registro`.
- Para el primer ADMIN, definir temporalmente en el `.env` privado `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD`; ejecutar `npm run admin:create` y retirar después esas variables.
- No pegar contraseñas en chat, comandos del historial, commits o Issues.
- La CLI no sobrescribe un administrador existente. No cambiar roles por SQL para saltarse el flujo acordado.

### 7.5. DEMO, solo si se decide ejecutarla

Esto crea recursos y lecturas de prueba; no es necesario para instalar ni debe ejecutarse automáticamente sobre una base ajena.

1. Establecer `NODE_ENV=development` y `TELEMETRY_MODE=demo` en el entorno local; reiniciar API si corresponde.
2. Obtener de forma autorizada el UUID de un propietario activo local.
3. Provisionar y enviar un lote finito:

```powershell
npm run simulator:provision -- --owner UUID_DEL_PROPIETARIO_LOCAL
npm run simulator -- --count 5
```

La provisión crea recursos DEMO y `.local/simulator.json` privado. No sobrescribe una configuración anterior. Para continuar indefinidamente existe `npm run simulator`, detenido con Ctrl+C; su ejecución debe ser explícita.

En el dashboard elegir **Datos simulados · DEMO** y el dispositivo correspondiente. El origen real sigue siendo el predeterminado. El modo DEMO no conecta hardware ni valida calibración.

### 7.6. Detener sin perder datos

- Ctrl+C en las terminales de Angular/API/simulador.
- `npm run db:stop` detiene PostgreSQL.
- `npm run db:up` lo inicia conservando el volumen.

Compose usa el proyecto `cacaosmart-local` y un volumen persistente. No eliminar volúmenes ni contenedores de otros proyectos.

## 8. Pruebas y resultados

### 8.1. Último resultado registrado de implementación

| Suite                            | Pruebas correctas |
| -------------------------------- | ----------------: |
| Backend                          |               178 |
| Angular                          |               295 |
| Integración PostgreSQL/Socket.IO |               124 |
| Navegador Edge/Chromium          |                20 |
| Simulador                        |                10 |
| **Total**                        |           **627** |

Además: tipos, lint, build, validación Prisma, formato de archivos afectados, diff y comprobaciones de salud correctos. Tras aplicar la migración local se repitieron las 20 pruebas de navegador, incluido Guardar margen.

Son resultados registrados al cierre de 5.7, **no una garantía de resultados en otro equipo ni una ejecución nueva por crear este documento**.

### 8.2. Comandos para reproducir

```powershell
npm run lint
npm run typecheck
npm test
npm run test:simulator
npm run test:integration
npm run build
npm run db:validate
npm run format:check
```

Para navegador, instalar/tener disponible un Chromium compatible. Ejemplo Windows con Edge, ajustando la ruta al equipo:

```powershell
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

Con la API y PostgreSQL locales iniciados:

```powershell
npm run smoke
```

Las integraciones crean bases temporales locales con prefijo controlado, aplican migraciones y eliminan solo esas bases al terminar. Requieren permisos para crear/eliminar bases; no ejecutarlas en producción ni contra una base compartida.

Los tests cubren autenticación, propiedad, origen, idempotencia, datos parciales/antiguos, reconexión, rangos/versiones/auditoría, vigencias, alertas persistentes/concurrencia y recorrido en navegador.

### 8.3. Advertencias conocidas

- El chequeo global de formato tiene avisos históricos de finales de línea CRLF en archivos anteriores. No reformatear todo el repositorio para ocultarlos ni confundirlos con fallos funcionales.
- Hay avisos de dependencias registrados en fases previas; no se hizo una auditoría nueva para este documento. Revaluar antes de producción, sin `audit fix --force` automático.
- Existe advertencia de `pg` sobre consultas concurrentes en un cliente de cara a pg 9. No se eliminaron controles ni actualizaron dependencias para silenciarla.
- Socket.IO es best-effort, sin outbox durable ni clustering. REST recupera el estado.
- Readiness comprueba conexión PostgreSQL, no calibración, hardware ni por sí sola la existencia de todas las tablas.

## 9. Estado local que no se transfiere por Git

Al cierre de la implementación:

- Las seis migraciones estaban aplicadas en la base del equipo de origen.
- La migración de humedad se aplicó con autorización y conservó los conteos de las nueve tablas de negocio anteriores.
- Las cuatro tablas nuevas de humedad quedaron vacías: no se fabricaron lecturas ni alertas y no se asignaron márgenes.
- El simulador continuo permanecía detenido; no se reinició automáticamente.
- API, PostgreSQL y Angular se comprobaron disponibles en aquel momento. Su ejecución actual debe verificarse, no suponerse.

**Nada de esto crea automáticamente el mismo estado en el equipo del compañero.**

No viajan por Git:

- Usuarios, contraseñas, parcelas, dispositivos, mediciones y alertas guardadas en PostgreSQL.
- El volumen Docker.
- `.env`, claves IoT y `.local/simulator.json`.
- Procesos que estén ejecutándose.
- Memoria privada del asistente ni historial de este chat.

Una alerta DEMO de desconexión en el equipo de origen puede ser legítima porque el simulador está detenido; no prueba una avería física.

Si en el futuro se acuerda transferir datos, debe hacerse como una operación separada, autorizada y por un canal seguro. No añadir un dump de la base al repositorio para resolver el traspaso.

## 10. Pendientes y siguiente trabajo

### 10.1. Primer paso recomendado al recibir el proyecto

1. Confirmar que el commit recibido incluye código, migraciones, contratos y pruebas de 5.7.
2. Leer la documentación y arrancar un entorno local propio.
3. Aplicar migraciones y reproducir las verificaciones pertinentes.
4. Si se acuerda una DEMO, provisionarla explícitamente.
5. Configurar rangos/márgenes elegidos conscientemente; ejemplos de prueba no son recomendaciones para campo.
6. Presentar al responsable el estado verificado y acordar **un único siguiente incremento**.

No empezar recreando alertas, rangos o dashboard: ya existen.

### 10.2. Funciones que siguen pendientes

| Área                 | Pendiente o condición                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Operación de humedad | Configurar márgenes explícitos por sonda; validar rangos con conocimiento agronómico               |
| Hardware real        | Protocolo/payload auténtico, modelos, calibración, frecuencia, conectividad y pruebas con ESP32    |
| Receptor externo     | Contrato, endpoint, autenticación y muestra real; el adaptador es solo una interfaz preparada      |
| Gestión agrícola     | Flujo completo para asignar parcelas a agricultores y formularios de dispositivos                  |
| Riego                | Eventos y duraciones a partir de evidencia auténtica; no control web automático                    |
| Agua                 | Litros solo con caudal/medición y método; ahorro solo con línea base                               |
| Reportes             | Exportación autorizada con filtros, sin fuga de datos                                              |
| Diagnóstico IA       | Captura, consentimiento, archivos privados, historial y proveedor backend; diagnóstico orientativo |
| Clima                | Proveedores públicos verificados, unidades, procedencia y manejo de fallos                         |
| Predicción           | Target/horizonte, baseline, evaluación cronológica y métricas sin fuga de futuro                   |
| Producción           | Hosting, HTTPS, proxy, secretos, respaldo/restauración, seguridad y operación                      |

El orden global de DERCAS sigue siendo: gestión agrícola → diagnóstico IA → clima/predicción → validación final. No iniciar todos los módulos simultáneamente.

### 10.3. Límites que no se deben cruzar

- No cambiar firmware ni reglas locales del ESP32 sin autorización y revisión.
- No crear comandos de apertura de válvula desde Angular/NestJS.
- No adoptar promedio, mínimo o mayoría de sondas como política de riego: esa decisión física sigue pendiente.
- No afirmar que una orden del relé demuestra apertura física o flujo.
- No inventar valores agronómicos, calibración, litros, ahorro, predicciones o diagnósticos.
- No conceder acceso global a ADMIN para resolver asignación de parcelas.
- No mezclar DEMO y real ni usar ejemplos como fallback de producción.
- No descartar trabajo existente, publicar, desplegar, cambiar roles o reiniciar simulador fuera del alcance autorizado.

## 11. Preparación para subir a Git

Esta sección es una guía para el responsable; **crear este documento no hace commits, push ni configura GitHub**.

### 11.1. Qué incluir

- Código de `frontend/`, `backend/` y `packages/contracts/`.
- Todas las migraciones, incluida la de humedad.
- Tests, scripts, configuración de desarrollo y `docker-compose.yml`.
- `package.json` y `package-lock.json`.
- `.env.example`, `.gitignore`, instrucciones, requisitos y documentación.
- Este archivo `ENTREGA_PROYECTO.md`.

Al momento de la entrega, varios módulos y migraciones figuran como nuevos/no rastreados. Revisar `git status`: **no basta con incluir solo los archivos que aparecen como modificados**.

### 11.2. Qué excluir

- `.env` y variantes con secretos.
- `.local/`, credenciales IoT, JWT, tokens GitHub y claves de OpenAI.
- Dumps, imágenes privadas, logs con datos personales y capturas sensibles.
- `node_modules/`, compilados, cobertura y cachés.

`.gitignore` ya excluye entorno, `.local`, dependencias y varios generados. Esto no protege un secreto que ya estuviera rastreado ni garantiza excluir cualquier dump o archivo privado. Revisar el contenido real antes de publicar; si se detecta una credencial publicada, rotarla y tratar el incidente, no solo borrar una línea en el último commit.

### 11.3. Revisión previa

```powershell
git status --short
git diff --stat
git diff --check
```

Después de agregar **selectivamente** los archivos acordados:

```powershell
git diff --cached --stat
git diff --cached
```

No se recomienda un `git add .` a ciegas sobre esta entrega. Revisar también los archivos nuevos.

Con los archivos revisados, pruebas pertinentes realizadas y publicación autorizada, el responsable podrá hacer commit y push a la rama acordada. No se proporciona un hash de entrega porque todavía no se ha creado uno para este documento.

El compañero debería trabajar en una rama por tarea y enviar Pull Request, sin force-push ni resolución de conflictos que descarte trabajo ajeno. No cambiar de rama con trabajo sin proteger. Ver [CONTRIBUTING](CONTRIBUTING.md).

## 12. Prompt listo para continuar con una IA

Copiar el siguiente bloque en el asistente del compañero después de clonar el repositorio. **No requiere memoria del chat original.** Este prompt refleja 5.7 y debe preferirse a prompts históricos de fases que todavía describían humedad como pendiente.

```text
Actúa como desarrollador de CacaoSmart IoT. Estoy continuando un proyecto
existente; no quiero recrearlo ni reemplazar su stack.

ANTES DE CAMBIAR NADA:
1. Lee completos AGENTS.md y AGENTS_CacaoSmart_v1.4.md.
2. Lee completo contexto/DERCAS_CacaoSmart_v1.4.md; es la fuente de verdad
   funcional. Si vas a cambiar UI, lee contexto/DISENO_VISUAL_CacaoSmart.md.
3. Lee README.md, ENTREGA_PROYECTO.md, docs/HANDOFF.md y CONTRIBUTING.md.
4. Consulta las fases 4 y 5.1–5.7 pertinentes. Distingue resultados históricos
   de estado actual; ante contradicciones no resueltas, pregunta.
5. Inspecciona git status, los scripts y el código. Conserva cambios existentes,
   incluidos archivos nuevos sin commit. No hagas resets ni descartes trabajo.

CONTEXTO YA IMPLEMENTADO:
- Angular standalone + TypeScript + NestJS + PostgreSQL/Prisma, npm workspaces.
- Login/registro FARMER, JWT de 15 min y Argon2id.
- Sesión Angular solo en memoria; no introducir persistencia de tokens por
   conveniencia ni interpretar una recarga completa como una sesión persistente.
- ADMIN no tiene acceso global: permisos por propietario en API y Socket.IO.
- Parcelas, dispositivos, seis sensores e ingesta IoT v1.2 autenticada,
   transaccional e idempotente por dispositivo/eventId.
- Telemetría A/B/C y ambiente, REST snapshot/histórico, Socket.IO/reconexión,
   dashboard y simulador DEMO explícito sin fallback real.
- Rangos por sensor con auditoría y versión; edición ADMIN, clasificación
   numérica y límites históricos por vigencia [inicio, fin).
- Alertas de desconexión: más de cinco intervalos desde lastSeenAt servidor;
   nunca sin contacto previo; reconocer no cierra y duplicado no renueva contacto.
- Alertas de baja humedad por sonda: tres lecturas nuevas/recientes consecutivas
   bajo mínimo activan; tres >= mínimo + margen positivo configurado recuperan.
   Mínimo + margen <= máximo; no hay defaults.
- Inválidos/ausentes/antiguos rompen confirmaciones sin recuperar; duplicados,
   fechas iguales o fuera de orden no confirman. Frescura/gap <= dos intervalos.
   DEMO admite valid/uncalibrated; real solo valid, sin fingir calibración.
- Cambiar rango/margen cierra por configuración, reinicia cursor/conteos y
   exige lecturas posteriores. Reconocimiento independiente, estado durable.
- Ya se corrigieron el enlace Alertas que perdía sesión y el submit del botón
   Guardar margen mediante FormGroup. No recrear estos arreglos.
- Se registraron 627 pruebas correctas: 178 backend, 295 Angular, 124 integración,
   20 navegador y 10 simulador. Debes reproducir las pertinentes y reportar tus
   propios resultados, no atribuirte una ejecución histórica.

ENTORNO DEL COMPAÑERO:
- Git no transfiere .env, usuarios, datos PostgreSQL, volumen, claves IoT,
   .local/simulator.json ni memoria del asistente.
- Comprueba Node.js 22 compatible, npm, Git y Docker antes de instalar.
   Usa el lockfile y npm 11.6.2 para instalar desde la raíz.
- Genera entorno propio y aplica todas las migraciones mediante los scripts.
   La última es 20261121200000_moisture_alerts; el guardado de rangos también
   depende de esas tablas. No edites migraciones aplicadas ni uses reset/db push.
- La migración estaba aplicada en el equipo original; no asumas que lo está
   en este clon. No hay cuentas, márgenes ni demo predeterminados.
- No arranques/provisiones el simulador ni cambies cuentas/roles/configuración
   sin autorización explícita para esas operaciones.

PENDIENTES:
- Márgenes A/B/C explícitos y validación agronómica/calibración reales.
- Conexión/validación con ESP32 y contrato auténtico del receptor externo.
- Flujo de asignación de parcelas, gestión UI de dispositivos, eventos de riego,
   métricas de agua condicionadas y reportes.
- Después: diagnóstico IA, clima y predicción conforme a DERCAS.
- Seguridad/operación/despliegue de producción siguen sin completar.

RESTRICCIONES:
- El ESP32 mantiene el control local. No cambies firmware ni envíes órdenes
   remotas a válvula. No impongas promedio/mínimo/mayoría como regla de riego.
- No confundas relé con apertura física, rango con calibración ni En rango con
   salud del cultivo. No inventes litros, ahorro, diagnósticos o predicciones.
- Preserva permisos y aislamiento real/DEMO, históricos y auditorías.
- No publiques, despliegues, hagas push, borres datos ni amplíes alcance
   automáticamente. Consulta dudas y bloqueos.
- Trabaja en un incremento pequeño; presenta archivos afectados, pruebas y
   criterios de aceptación antes de implementar. Al terminar actualiza docs.

PRIMER ENCARGO:
Haz una inspección de solo lectura y confirma el estado realmente recibido,
herramientas disponibles, migraciones presentes y bloqueos. Propón un único
siguiente incremento con justificación y criterios de aceptación.
No instales, cambies configuración ni implementes funciones hasta que yo
autorice el alcance propuesto.
```

Después de esa inspección, el compañero podrá autorizar una tarea concreta. Evitar instrucciones abiertas como «termina todo el proyecto».

## 13. Lista de aceptación de la entrega

### Responsable que comparte

- [ ] Revisó cambios modificados y archivos nuevos, no solo este documento.
- [ ] Incluyó código, contratos, tests y todas las migraciones en la entrega.
- [ ] Revisó secretos/datos personales y el diff preparado para commit.
- [ ] Publicó únicamente con autorización, e indicó rama y commit al compañero.
- [ ] No compartió `.env`, claves ni base privada por Git.

### Compañero que recibe

- [ ] Leyó requisitos, restricciones y documentación actual.
- [ ] Confirmó que recibió el código de 5.7, no solo una versión anterior.
- [ ] Generó su entorno y aplicó migraciones sin resetear datos.
- [ ] Verificó API, PostgreSQL y Angular.
- [ ] Reprodujo pruebas y registró resultados reales/bloqueos.
- [ ] Si quiere DEMO, acordó su provisión y ejecución explícitas.
- [ ] Entiende que rangos y márgenes no están validados agronómicamente.
- [ ] Acordó una tarea pequeña antes de ampliar el proyecto.

**Regla final:** continuar desde el estado verificado, no desde suposiciones ni del historial privado de un asistente.
