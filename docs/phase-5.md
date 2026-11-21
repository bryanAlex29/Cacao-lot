# Fase 5.1 — Rangos por sensor mediante API

## Alcance

Primer incremento de gestión agrícola: configuración persistida de mínimo/máximo por **UUID de sensor y variable**, con permisos de propietario, auditoría transaccional y control de concurrencia. Conserva Angular + NestJS + PostgreSQL/Prisma y la separación real/DEMO. No incluye formularios Angular, clasificación agronómica, líneas de umbral, alertas, reportes ni cambios al firmware.

La fase 4 permanece operativa. El snapshot y `telemetry.updated` no cambian. En la entrega original 5.1 el dashboard todavía no consultaba rangos. **Actualización:** la [fase 5.2](phase-5-2.md) ya integra consulta y presentación en Angular, sin formulario ni clasificación/líneas de umbral.

## API y permisos

| Método | Ruta                                   | Permiso                    |
| ------ | -------------------------------------- | -------------------------- |
| GET    | `/api/v1/sensors/:sensorId/thresholds` | ADMIN o FARMER propietario |
| PUT    | `/api/v1/sensors/:sensorId/thresholds` | ADMIN propietario          |

Ambas rutas requieren JWT y se documentan en Swagger (`/api/v1/docs`, versión 0.5.0). `sensorId` es el UUID persistente que aparece en `sensors` al consultar el dispositivo mediante `GET /api/v1/plots/:plotId/devices/:deviceId`; `soil_1` es un código local y no sirve como UUID. No se exponen claves de dispositivos ni hashes.

- ADMIN no tiene acceso global. FARMER no escribe, ni siquiera en su parcela.
- Sensor/dispositivo deshabilitado, parcela archivada, recurso ajeno o inexistente: 404. Usuario inactivo o JWT inválido/caducado: 401. Rol insuficiente: 403.
- El origen se obtiene del dispositivo, no del cliente. DEMO exige `TELEMETRY_MODE=demo` y entorno no productivo, también al consultar rangos.
- Sin configuración, GET responde 200 con `threshold: null`; no crea valores por defecto ni requiere telemetría previa.
- Lluvia booleana no admite esta configuración: 400 en GET y PUT.

Ejemplo **ilustrativo, no recomendación agronómica**, para una sonda de suelo:

```json
{
  "variable": "SOIL_MOISTURE",
  "unit": "PERCENT",
  "minValue": 20,
  "maxValue": 70,
  "expectedVersion": 0
}
```

La respuesta contiene `sensorId`, `deviceId`, `plotId`, `source`, `variable`, `unit` y `threshold`. Este último contiene `id`, `minValue`, `maxValue`, `hysteresis`, `effectiveAt`, `updatedBy` y `version`.

1. Consultar el rango actual.
2. Para crearlo usar `expectedVersion: 0`; para editarlo enviar la versión actual.
3. El servidor asigna autor, fecha UTC y versión (1 al crear, incremento por cambio).
4. Una versión desactualizada produce 409 sin modificar rango ni auditoría; volver a consultar antes de decidir una nueva edición, sin sobrescribir silenciosamente.
5. PUT con la versión actual y valores idénticos conserva fecha y versión, sin nueva auditoría. Repetir una creación con versión 0 después de creada produce 409, no una sobrescritura.

No se admite `source`, `ownerId`, `updatedBy`, `effectiveAt` ni `hysteresis` del cliente. La vigencia es inmediata; no hay programación de cambios futuros ni endpoint de eliminación.

## Validación, calibración y control físico

- Números finitos, sin convertir strings ni aceptar null; mínimo estrictamente menor que máximo.
- Suelo y humedad ambiental: `SOIL_MOISTURE`/`AIR_HUMIDITY`, unidad `PERCENT`, valores entre 0 y 100.
- Temperatura: `TEMPERATURE`, unidad `CELSIUS`, entre -50 y 100, conforme al intervalo técnico de la ingesta actual.
- Variable/unidad deben corresponder al sensor identificado. Los límites técnicos no son rangos agronómicos recomendados ni prueba de calibración.
- Cada sonda A/B/C y cada sensor ambiental cuantitativo conserva su rango independiente. Un sensor DEMO no configura otro real.
- `hysteresis=0` es un campo reservado y restringido en la base; no existe motor de histéresis/antirrebote en este incremento. No se publica como capacidad implementada.
- No se modifica `calibrationMetadata`, calidad, lecturas, umbrales del ESP32 ni órdenes de válvula. No se crean rangos agronómicos predeterminados o recursos DEMO automáticamente.

## Persistencia y auditoría

Migración aditiva `20261121060000_sensor_thresholds`:

- `sensor_thresholds`: un rango por sensor/variable, autor, vigencia y versión.
- `sensor_threshold_audits`: actor, parcela, sensor, origen, variable, fecha, versión y snapshots anterior/nuevo; anterior SQL NULL en la creación.
- Restricciones SQL de orden, intervalo técnico, versión y unidad; FK compuesta a sensor/variable/unidad impide atribuir un rango a una identidad incompatible.
- Las filas de auditoría solo se insertan desde esta API; no se exponen edición, borrado ni consulta HTTP de auditoría en esta fase. No es un registro a prueba de manipulación por administradores de PostgreSQL.

La escritura y su auditoría comparten una transacción. Si falla la auditoría, se revierte tanto una creación como una edición. Los bloqueos siguen el orden de ingesta **dispositivo → parcela/usuario → sensor**; se revalidan propiedad, rol, actividad, ubicación y política de origen antes de guardar. Bloquear el sensor también serializa la creación cuando aún no existe fila de rango. `expectedVersion` impide que dos ediciones concurrentes sobrescriban cambios sin advertencia.

El historial conserva los snapshots de cada cambio; no se recalculan ni reclasifican lecturas históricas con nuevos rangos.

## Arranque y verificación

```powershell
npm run db:generate
npm run db:validate
npm run db:migrate
npm run dev:backend
```

La migración se verificó primero en bases temporales y luego se aplicó a PostgreSQL local mediante `migrate deploy`, sin resetear ni borrar datos. No se crearon usuarios, dispositivos, rangos o lecturas de prueba en la base principal, ni se modificó `.env`.

Comandos de comprobación:

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:simulator
npm run build
npm run format:check
npm run smoke
```

`sensor-thresholds.integration.ts` es descubierto automáticamente por el runner existente: crea su propia base temporal, aplica las migraciones y elimina exclusivamente esa base al terminar. Incluye un fallo sintético de auditoría mediante un trigger que solo se crea en esa base temporal. La matriz de esta suite desactiva el rate limit para superar 60 solicitudes; JWT, permisos y validaciones siguen activos. La suite de seguridad conserva las comprobaciones de limitación de solicitudes.

Resultados verificados: **225 pruebas correctas — 97 backend, 45 Angular, 73 integración PostgreSQL/Socket.IO (26 nuevas de rangos), 5 navegador Edge Chromium y 5 simulador**. Lint, tipos, build, validación Prisma y smoke correctos; OpenAPI local 0.5.0 expone ambas operaciones de rangos. Las pruebas incluyen autenticación, aislamiento incluso entre ADMIN, rechazo de escrituras FARMER, validación HTTP/SQL, tres sondas independientes, sensores ambientales, DEMO, recursos deshabilitados, concurrencia, no-op y rollback por fallo de auditoría.

**Formato:** los archivos de este incremento pasan Prettier y `git diff --check`. El comando global `npm run format:check` detecta 125 archivos anteriores con CRLF frente al LF esperado. Se comprobó en modo lectura que normalizar únicamente sus finales de línea elimina todas esas diferencias; no se reescribieron archivos ajenos a este incremento para resolverlo.

La primera ejecución de navegador falló antes de iniciar por ausencia de Chrome en la ruta predeterminada; la repetición con **Edge Chromium pasó las cinco pruebas**, incluido el recorrido del simulador y la vista móvil. Se utilizó el navegador existente sin descargar otro ni cambiar `.env`:

```powershell
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

## Archivos y siguiente incremento

- `backend/prisma/schema.prisma` y nueva migración.
- `backend/src/sensor-thresholds/`: módulo, DTO, controlador, servicio, reglas, mapping, repositorio y pruebas unitarias.
- `backend/src/app.module.ts`, `backend/src/configure-app.ts`: registro y OpenAPI.
- `packages/contracts/src/index.d.ts`: contratos de rangos, sin alterar los de ingesta/eventos.
- `backend/test/sensor-thresholds.integration.ts`: integración aislada.
- `README.md`, `docs/HANDOFF.md`, este documento: uso y límites.

La consulta y presentación Angular prevista aquí se completó en [fase 5.2](phase-5-2.md), conservando identidad, origen, calidad y estados sin datos/desactualizado. Esperar nueva instrucción para formulario ADMIN, clasificación y líneas de umbral; no reutilizar `telemetry.updated` con otro payload. Alertas, riego, reportes, IA y clima siguen pendientes.
