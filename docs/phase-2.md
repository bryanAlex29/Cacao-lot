# Fase 2 — Seguridad y datos

**Fecha:** 2026-11-20. Complementa DERCAS sin alterar el stack ni la regla de riego local.

**Actualización posterior:** a petición del usuario se añadió registro público exclusivamente FARMER. Sustituye la política inicial de alta solo administrativa; ver [registration.md](registration.md) para el flujo y sus verificaciones. La creación de ADMIN continúa limitada a la provisión por CLI.

**Corrección posterior a 5.12:** el usuario confirmó cierres a los 15 minutos. Se incorporó [renovación mediante cookie HttpOnly, sesión de ocho horas y revocación al salir](session-renewal.md), con migración aditiva. Sustituye las limitaciones iniciales «recargar exige login», «sin refresh» y «logout no revoca» documentadas abajo como registro histórico; no amplía la duración del JWT ni los roles.

## Entrega

- Modelos Prisma `User`, `Plot`, `Device` y `Sensor`; relaciones restrictivas, índices, unicidad y timestamps UTC.
- Migración aditiva `20261120170000_identity_and_resources`, aplicada mediante `migrate deploy`. La base principal no tenía tablas antes de aplicarla. No se ejecutó reset, borrado ni seed de cuentas reales.
- Login JWT HS256 de 15 minutos, issuer y audience restringidos, comprobación de expiración y nueva consulta de usuario activo/rol por solicitud.
- Contraseñas Argon2id (64 MiB, 3 iteraciones, paralelismo 1), salt de biblioteca y verificación ficticia de coste equivalente para correo inexistente.
- Guardias globales: denegar por defecto; login, registro FARMER y salud públicos. Roles para escritura y filtros de propietario tanto en lecturas como modificaciones.
- Validación de DTO, rechazo de propiedades extra, IDs UUID, paginación limitada y errores ORM sin detalles internos.
- Angular con formularios reactivos: login y listado paginado/creación de parcelas propias. Token solo en memoria, guardia de navegación e interceptor limitado a la API propia.
- Dispositivos y sensores gestionados por API. No hay telemetría ni evidencia de conexión del ESP32 todavía.

## Roles y propiedad

| Operación                                                  | ADMIN | FARMER |
| ---------------------------------------------------------- | ----- | ------ |
| Consultar identidad propia                                 | Sí    | Sí     |
| Crear usuario FARMER                                       | Sí    | No     |
| Listar/consultar parcelas y dispositivos propios           | Sí    | Sí     |
| Crear parcela propia (actualización autorizada 2026-11-22) | Sí    | Sí     |
| Editar/archivar parcela propia                             | Sí    | No     |
| Registrar/deshabilitar dispositivo propio                  | Sí    | No     |
| Leer o modificar recursos ajenos                           | No    | No     |
| Crear ADMIN por HTTP o cambiar propietario desde un DTO    | No    | No     |

Se usa `404` para recurso inexistente, archivado o ajeno, sin revelar su existencia. El rol ADMIN no concede acceso global. `DELETE` de parcela archiva: no borra filas, dispositivos ni sensores; los recursos de esa parcela dejan de ser accesibles por sus rutas.

**Límite explícito:** todavía no hay endpoint para asignar/transferir parcelas a agricultores ni una jerarquía de organizaciones. Crear FARMER no le asigna una parcela del administrador. Las pruebas provisionan parcelas de cada propietario como fixtures, solo en la base temporal. Definir un flujo autorizado y auditable antes de habilitar esta asignación; no añadir un `ownerId` libre a creación como atajo.

## Endpoints implementados

Todos bajo `/api/v1`. Salvo login y salud, requieren `Authorization: Bearer <JWT>`.

| Método | Ruta                               | Función                                                                                         |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`                      | Correo/contraseña; devuelve token, expiración y usuario público                                 |
| GET    | `/auth/me`                         | Identidad activa obtenida en servidor                                                           |
| POST   | `/users`                           | ADMIN crea FARMER con nombre, correo y contraseña; no acepta `role`                             |
| GET    | `/plots?limit=20&offset=0`         | Página de parcelas propias activas                                                              |
| POST   | `/plots`                           | ADMIN/FARMER crean parcela propia: `name`, `locationLabel`, `areaM2?`; propietario desde sesión |
| GET    | `/plots/:id`                       | Detalle de parcela propia                                                                       |
| PATCH  | `/plots/:id`                       | ADMIN edita esos campos, nunca dueño ni umbrales del firmware                                   |
| DELETE | `/plots/:id`                       | ADMIN archiva parcela propia; 204                                                               |
| GET    | `/plots/:plotId/devices`           | Página de dispositivos propios con sensores                                                     |
| GET    | `/plots/:plotId/devices/:deviceId` | Detalle propio, sin credenciales                                                                |
| POST   | `/plots/:plotId/devices`           | ADMIN registra serial y recibe clave una vez                                                    |
| PATCH  | `/plots/:plotId/devices/:deviceId` | ADMIN cambia únicamente `isActive`                                                              |

Las páginas contienen `{ items, total, limit, offset }`, con `limit` entre 1 y 100 y `offset` entre 0 y 100000. `areaM2` opcional admite `null`; si existe debe ser un número positivo finito. Los campos desconocidos se rechazan, no se ignoran silenciosamente.

El endpoint de ajustes generales `/plots/:id/settings` de DERCAS no se usa como alias de edición en esta fase: la edición básica está en `PATCH /plots/:id`. Rangos min/max y auditoría agronómica llegarán en su fase; no hay sincronización con firmware.

Swagger documenta los DTO y Bearer en desarrollo. No pegar secretos en capturas o reportes.

## Dispositivos y sensores

Cada registro crea dispositivo y seis identidades en la misma operación atómica:

| Código estable   | Variable              | Unidad   | Zona      |
| ---------------- | --------------------- | -------- | --------- |
| `soil_1`         | Humedad del suelo     | %        | A         |
| `soil_2`         | Humedad del suelo     | %        | B         |
| `soil_3`         | Humedad del suelo     | %        | C         |
| `temperatureC`   | Temperatura ambiental | °C       | No aplica |
| `airHumidityPct` | Humedad ambiental     | %        | No aplica |
| `rainDetected`   | Detección de lluvia   | Booleana | No aplica |

La lluvia binaria no se convierte en mm ni porcentaje. Una restricción SQL impide combinaciones inconsistentes de código, variable, unidad y zona. La calibración permanece desconocida y no se crean lecturas ni umbrales ficticios. `UNKNOWN` y `lastSeenAt=null` no acreditan conectividad.

La clave del dispositivo son 32 bytes aleatorios (64 caracteres hexadecimales), expuesta solo como `deviceKey` en la respuesta de creación. Se persiste SHA-256 de ese secreto de alta entropía; las contraseñas humanas, en cambio, usan Argon2id. No reutilizar la clave como contraseña de usuario ni como JWT. Listados y detalles no devuelven clave ni hash. No existe recuperación de clave ni rotación todavía; conservarla de forma privada y definir rotación antes de producción. La validación de esa credencial al ingerir llegará en fase 3.

## Provisión y sesión

- `npm run setup:auth-env` agrega un secreto JWT aleatorio a `.env` existente sin reemplazar configuración; `setup:env` lo incluye en instalaciones nuevas.
- `npm run admin:create` toma `BOOTSTRAP_ADMIN_NAME/EMAIL/PASSWORD` del entorno local. Solo admite desarrollo y host PostgreSQL local; crea únicamente el primer ADMIN. Bloqueo transaccional evita dos altas simultáneas. Retirar esas variables tras el alta.
- No se crean administradores, parcelas ni dispositivos permanentes con datos de ejemplo durante el desarrollo automatizado.
- La UI elimina credenciales del formulario tras éxito/error y no persiste JWT en localStorage/sessionStorage/cookies. Recargar exige nuevo login.
- Cerrar sesión elimina el token del cliente, no revoca inmediatamente copias ya emitidas: duran hasta 15 minutos. No hay refresh, recuperación de contraseña ni revocación por sesión; no presentar esto como IAM de producción completo.
- El interceptor no envía JWT a dominios externos y no elimina una sesión nueva por un 401 atrasado de la anterior.
- Límite login: 5 solicitudes/minuto por IP; resto de API: 60/minuto por ruta e IP. Salud excluida. Contadores en memoria de una instancia; no confiar en `X-Forwarded-For` sin configurar proxy seguro. Un despliegue distribuido requerirá almacenamiento compartido y revisión de límites.
- Respuestas con `Cache-Control: no-store`. Errores inesperados no devuelven SQL, argumentos, hashes ni credenciales; aún se debe diseñar observabilidad sanitizada para producción.

## Verificación

Comandos:

```powershell
npm run db:validate
npm run db:generate
npm run db:migrate
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run format:check
npm run smoke
```

Las pruebas de integración crean una base temporal `cacaosmart_test_<hex>` dentro del PostgreSQL local, aplican la migración y limpian exclusivamente esa base al terminar. El runner valida host/entorno, genera internamente el nombre y el test exige que coincida con el destino esperado. No utiliza `migrate reset` ni borra datos de la base principal. La cuenta local de pruebas necesita permiso para crear/eliminar bases; no usarla como rol de producción.

Cobertura: JWT inválido/caducado/otra audiencia; rutas públicas/protegidas; dos administradores y un agricultor; lectura/escritura ajenas; rol revalidado; campos extra/área/UUID/paginación; Argon2id y correos normalizados; secreto de dispositivo hash y no recuperable; sensores atómicos sin huérfanos ante duplicado; archivo lógico; limitación de login; bootstrap de primer admin sin sobrescritura. Angular prueba expiración/logout, guardia, interceptor sin fuga a externos, 401 atrasado, limpieza de contraseña y parcela sin propietario enviado por cliente.

Resultados ejecutados: **20 pruebas backend, 13 pruebas Angular y 13 pruebas de integración PostgreSQL: 46 en total**. Typecheck y build de ambas aplicaciones correctos; esquema Prisma válido y migración reaplicada sin pendientes. Smoke de salud/OpenAPI responde 200 y `/plots` sin JWT responde 401. Las rutas Angular `/login`, `/parcelas` y `/estado` entregan HTML por HTTP; esto no sustituye la comprobación visual en navegador.

El test de bootstrap encontró y corrigió el uso de `$queryRaw` sobre `pg_advisory_xact_lock`, cuyo retorno `void` no se debe decodificar como fila; se utiliza `$executeRaw`. La prueba crea el primer administrador únicamente en la base temporal, comprueba un segundo intento rechazado y verifica el hash. La base principal conserva cero usuarios, parcelas y dispositivos después de las pruebas: el usuario debe elegir y provisionar su administrador local siguiendo el README.

No se ha realizado revisión visual en navegador real ni pruebas de hardware. Las pruebas Angular usan DOM simulado. La gestión de dispositivos/usuarios por UI, asignación de agricultores, cambio de contraseña, recuperación, rotación de claves y revocación de sesiones quedan pendientes explícitos, no se simulan.

## Compatibilidad y riesgos

- `@nestjs/jwt` **11.0.2** compatible con CommonJS/Jest 29; la versión 12 probada era ESM y no se cambió el backend completo por esa dependencia.
- Observación de desarrollo con Nodemon **3.1.11**, limitado a `src` y `.env`; evita reinicios por dependencias o compilación y detecta módulos nuevos. La selección más reciente probada introducía un aviso transitivo adicional de minimatch; no se forzó un override incompatible.
- Auditoría conserva **19 avisos: 16 moderados, 3 altos, sin críticos**, como en la fase 1. Revisar antes de despliegue; no se ejecutó `audit fix --force`.
- PostgreSQL local sigue en `127.0.0.1:5433`, API en `3100`, Angular en `4200`; ningún otro proyecto se modifica.

## Siguiente fase

Ingesta IoT autenticada por dispositivo, validación de payload, deduplicación `deviceId + eventId`, persistencia de tres zonas y simulador por el mismo endpoint. La ingesta deberá rechazar dispositivos deshabilitados y parcelas archivadas. Socket.IO y dashboard posterior deberán reutilizar permisos por parcela; no abrir salas públicas. Se conserva todo el alcance posterior de IA, clima y predicción sin tocar firmware.

## Key Learnings:

1. Un JWT firmado no sustituye comprobar usuario activo, rol vigente y propietario del recurso.
2. Las claves aleatorias de dispositivos y las contraseñas humanas requieren tratamientos de hash distintos.
3. Una base efímera permite probar migración y aislamiento reales sin resetear ni poblar la base principal.
