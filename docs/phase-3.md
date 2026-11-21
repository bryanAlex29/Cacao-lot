# Fase 3 — Telemetría y simulador

## Alcance y archivos

Ingesta HTTP → PostgreSQL → snapshot/histórico REST. No incluye Socket.IO ni cambios de interfaz; corresponden a la fase siguiente. Firmware intacto, sin conexión real acreditada.

- `backend/prisma/schema.prisma`, migraciones `20261121010000_telemetry` y `20261121011000_telemetry_index_name`: origen/intervalo del dispositivo, lecturas y tres filas de suelo por evento. Migraciones aditivas, sin reset ni modificación de contraseñas.
- `backend/src/devices/`: autenticación independiente y estado derivado; provisioning incluye `source` inmutable e intervalo técnico configurable al crear.
- `backend/src/auth/`, `backend/src/app.module.ts`: guard global reconoce rutas exclusivas de dispositivo; no permite JWT como sustituto.
- `backend/src/iot-ingestion/`, `backend/src/telemetry/`: DTO v1.2, normalización, repositorio transaccional y REST.
- `backend/src/integrations/`: política de origen e interfaz externa pendiente del protocolo auténtico.
- `packages/contracts/src/index.d.ts`: lectura normalizada y snapshot compartidos.
- `scripts/simulator*.mjs`, `scripts/integration-test.mjs`, tests: demo explícita y bases temporales aisladas.

## Contrato de ingreso

`POST /api/v1/iot/telemetry` con `X-Device-Id` UUID v4 persistente y `X-Device-Key` de 64 caracteres hexadecimales. La respuesta de provisioning muestra ese secreto una vez; PostgreSQL solo guarda SHA-256. No incluir claves en logs, Angular ni comandos de historial.

Se exige `schemaVersion="1.2"`, `eventId` de 1–120 caracteres, `deviceId` coincidente, `recordedAt`, `soilMoisture`, ambiente, lluvia y `valve` conforme a DERCAS §18.3. A diferencia de los IDs ilustrativos del documento, la identidad autenticada implementada es UUID, no serial. Swagger documenta DTOs y respuestas.

- Las tres claves `soil_1/2/3`, ambiente, lluvia y ambas claves de válvula son obligatorias, aunque su valor puede ser **null**. Omisiones, cadenas numéricas, booleanos como texto y claves extra (incluidas anidadas) se rechazan.
- Humedades 0–100 %, temperatura **−50 a 100 °C**: envolvente técnica de ingreso, no rango agronómico ni afirmación del modelo físico. Ajustable al confirmar hardware; no cambia firmware.
- Fecha ISO8601 estricta con zona horaria. Se acepta hasta 60 s de adelanto técnico; más adelante se rechaza. Sin reloj fiable, enviar `null`: timestamp de servidor. Se conservan fechas antiguas como histórico, no se inventa sincronización.
- `source` enviado es informativo y se excluye del hash idempotente. El canal provisionado decide real/demo. Demo exige `TELEMETRY_MODE=demo` fuera de producción. No hay fallback a simulados.
- Números sin calibración verificada se etiquetan **uncalibrated**, incluso en demo; booleanos conocidos **valid**. Sensor deshabilitado o dato null → **missing/null**, nunca cero ni dato previo arrastrado. Los metadatos de calibración existentes no tienen todavía semántica validada para elevar calidad.
- La orden del relé y la confirmación física se conservan separadas. `feedbackOpen=null` sigue desconocido, aunque el relé esté activado. Nada ordena abrir una válvula.

Respuesta **201** tanto para alta como reintento reconocido: `{duplicate, reading}`. Lectura normalizada sin secretos, hash interno ni BigInt de ordenación.

| Código | Caso                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------- |
| 400    | DTO, tipos, rangos, fecha o claves no admitidas                                                         |
| 401    | Credencial ausente/incorrecta, dispositivo/propietario inactivo, parcela archivada o demo deshabilitada |
| 403    | UUID del cuerpo distinto del autenticado                                                                |
| 409    | `eventId` reutilizado con datos distintos o inventario de suelo incompleto                              |
| 429    | Límite global de solicitudes por IP; no reintentar indefinidamente                                      |

## Persistencia e idempotencia

Unicidad `(deviceId,eventId)`. Hash SHA-256 de campos canónicos ordenados, timestamp normalizado a milisegundos e identidad autenticada; orden de claves y origen informativo no alteran el evento. Un cambio de medición con el mismo ID se rechaza, incluso si la sonda está deshabilitada y su salida se normaliza a null.

Transacción con bloqueo del dispositivo y lectura bloqueada de parcela/propietario/sensores: revalida credencial, asociación y actividad después de autenticar. Inserta evento y tres filas suelo atómicamente. Un inventario incompleto revierte todo. Un retry idéntico devuelve la lectura original sin actualizar `lastSeenAt` ni repetir efectos. Una lectura antigua **nueva** sí acredita contacto y actualiza `lastSeenAt`, pero no desplaza el snapshot.

Orden descendente: tiempo efectivo (`recordedAt` o `receivedAt`), recepción y secuencia monotónica interna. El desempate es determinista y probado. La secuencia no se serializa como JSON. Índice temporal con nombre explícito evita truncación de identificadores PostgreSQL.

## Consulta por propietario

- `GET /api/v1/plots/:id/dashboard?source=real&deviceId=UUID`: `{plotId,source,device,reading}`; sin dispositivo o lecturas devuelve null, no datos inventados.
- `GET /api/v1/plots/:id/readings?source=real&deviceId=UUID&from=ISO&to=ISO&limit=20&offset=0`: página de lecturas normalizadas, últimas 24 h por defecto, rango máximo **31 días**, fechas inclusivas por tiempo efectivo y orden descendente. Límite 1–100 y offset acotado por DTO común.
- JWT de usuario activo y propiedad obligatorios incluso para ADMIN. Parcela/dispositivo ajeno → 404. Si hay varios dispositivos del origen seleccionado → 409; indicar `deviceId`, sin fusionar silenciosamente sondas. Se incluyen candidatos inactivos para conservar acceso explícito a su histórico.
- `source=real` predeterminado, `source=demo` explícito y sujeto a política. Con origen real nunca aparecen lecturas demo.
- Snapshot es **solo telemetría**, no el dashboard agrícola completo con rangos, alertas, agua o IA.

Conexión derivada del intervalo esperado configurado: sin contacto **unknown**, dispositivo deshabilitado **offline**, más de 2 intervalos **stale**, más de 5 **offline**. `lastSeenAt` acredita recepción, no frescura del reloj de campo ni salud individual de cada sonda. Default técnico 60 s; demo provisionada 5 s. No se afirma que esa sea la frecuencia del ESP32.

## Simulador

Seguir comandos de [README](../README.md#telemetría-y-simulación-local). Provisión exige `NODE_ENV=development`, PostgreSQL loopback, `TELEMETRY_MODE=demo` y UUID explícito de usuario activo. Crea recursos claramente DEMO y guarda clave solo en `.local/simulator.json`, con creación exclusiva (`wx`, modo 0600 donde el sistema lo aplica). En Windows conservar ACL privada de usuario; no compartir esa carpeta ni subirla. Si existe el archivo, la CLI falla sin crear recursos ni sobrescribirlo.

`npm run simulator -- --count 5` o continuo hasta Ctrl+C. Configuración fija local; rechaza destino remoto, credenciales URL, redirects y fuente no demo. API confirma origen demo en cada respuesta; si no, se detiene. Tres series ficticias deterministas independientes por número de evento; ID de ejecución único y secuencia estable. Reintentos conservan exactamente cuerpo/ID/hora, cuatro intentos por lote, backoff de 0.5/1/2 s y timeout de 5 s por request. 4xx salvo 429 son definitivos. No se simulan litros, ahorro ni feedback físico.

### Recuperación de cortes temporales (corrección posterior)

Durante desarrollo se observó una detención del simulador en la ventana de reinicio de Nodemon: última lectura recibida a las 06:43:10 UTC y nuevo arranque de Nest a las 06:43:22 UTC del 21/11/2026. El comportamiento anterior terminaba el proceso al agotar un único lote, aunque el corte fuera temporal y credenciales/dispositivo siguieran activos.

`SimulatorUnavailableError` identifica únicamente agotamiento por red, 429 o 5xx. `sendUntilAvailable` permite que **solo el modo continuo** espere 5/10/20/30 segundos (máximo 30 entre lotes) y reenvíe el mismo payload. No crea nuevos IDs ni fechas para un mensaje pendiente; los reintentos siguen siendo idempotentes y la primera muestra recuperada puede estar desactualizada, sin falsificar su hora. Los valores nuevos continúan después de confirmar el evento pendiente.

- `--count` sigue fallando tras su lote acotado; las pruebas o ejecuciones finitas no quedan esperando indefinidamente.
- 400/401/403/409 y confirmación de origen real permanecen definitivos; no se omiten permisos ni se mezclan orígenes para «recuperar».
- Ctrl+C/SIGTERM interrumpe tanto envío como espera. Los mensajes de recuperación no imprimen credenciales, payloads ni respuestas privadas.
- Archivos afectados: `scripts/simulator-core.mjs`, `scripts/simulator.mjs`, `scripts/simulator.test.mjs`; sin cambios a la API, rate limit, firmware o política de riego.
- Verificación específica: **10 pruebas del simulador y 73 de integración correctas**, incluida recuperación HTTP local real después de cuatro 503 con un único cuerpo/ID/fecha; también modo finito, cancelación y rechazos permanentes. Lint, build, formato de archivos afectados y smoke correctos. Se confirmaron dos eventos DEMO en la API local y actividad reciente del proceso continuo reiniciado con autorización del usuario.

No hay semillas automáticas ni se crearon recursos demo en la base principal al implementar. La prueba de extremo a extremo usa solo base temporal y credenciales efímeras. Para detener: Ctrl+C; la conexión caduca por intervalo. Para deshabilitar definitivamente, usar PATCH de dispositivo autorizado; volver a `TELEMETRY_MODE=real` cierra el canal demo. No borrar recursos ni configuración privada sin revisar primero.

## Verificación y límites

Comandos: `npm test`, `npm run test:simulator`, `npm run test:integration`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format:check`, `npm run db:validate`, `npm run smoke`.

Resultado ejecutado: **130 pruebas correctas** (64 backend, 27 Angular, 34 integración PostgreSQL en dos bases aisladas y 5 simulador). Lint, typecheck, build, formato y validación Prisma correctos; smoke de salud/readiness devuelve 200. Migraciones aplicadas a PostgreSQL local sin reset; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` devuelve migración vacía, sin divergencia de esquema. No se ejecutó provisión DEMO sobre la base principal ni se sobrescribió `.env`.

Cobertura: tres sondas, null, cero/false, datos inválidos, deshabilitados, retry exacto/concurrente y conflicto, orden temporal/desempate/paginación, permisos, aislamiento demo, revalidación transaccional, rollback de inventario incompleto y simulador Node → HTTP NestJS → PostgreSQL → REST. El runner crea y elimina una base generada por suite para no interferir con primer ADMIN de seguridad.

Pendientes: flujo completo Socket.IO/Angular y reconexión, salud individual de sondas en UI, rangos/alertas/eventos de riego en sus fases, calibración y protocolo físico. `ExternalTelemetryAdapter` sigue siendo interfaz sin integración inventada. No hay prueba del ESP32 ni producción/despliegue. Los avisos de auditoría previos no se han corregido mediante actualizaciones forzadas.
