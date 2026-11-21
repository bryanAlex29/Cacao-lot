# DERCAS — CacaoSmart IoT

**Versión:** 1.4 · **Proyecto:** TerriTech Hackathon CITIC 2026 · **Ubicación piloto:** Chone, Manabí, Ecuador

## 1. Descripción y alcance
CacaoSmart IoT es una solución de monitoreo y riego automatizado para cacao. Un ESP32 recibe mediciones independientes de **tres sensores de humedad del suelo** (zonas A, B y C), temperatura, humedad relativa y detección de lluvia; controla un relé conectado a una electroválvula. La plataforma web permite consultar datos, eventos, alertas y estimaciones de consumo y ahorro de agua.

**Estado confirmado:** el usuario indica que el prototipo físico funciona. **Pendiente de verificar:** conectividad con backend, sensores y modelos exactos, calibración, medición de caudal y despliegue de la plataforma. Las pantallas y cifras del mockup son ilustrativas.

## 2. Objetivos
- Monitorear las condiciones ambientales y del suelo por parcela.
- Activar el riego cuando la humedad esté por debajo de un umbral configurado y no se detecte lluvia.
- Registrar telemetría, decisiones y eventos de riego.
- Mostrar indicadores históricos y alertas al productor.
- Estimar consumo y ahorro solo con metodología y supuestos explícitos.
- Contribuir al ODS 6 (rector), ODS 12 y ODS 13.

## 3. Pila tecnológica
- **Frontend:** Angular (versión estable compatible), TypeScript, Angular Router, formularios reactivos, componentes standalone, SCSS o CSS, biblioteca de gráficos compatible.
- **Backend:** Node.js LTS, TypeScript, NestJS recomendado para estructura modular, API REST, validación de DTO y OpenAPI/Swagger.
- **Base de datos:** PostgreSQL con Prisma ORM y migraciones versionadas.
- **Dispositivo:** ESP32, firmware existente; protocolo HTTP(S) con JSON para MVP, o MQTT con TLS como evolución opcional.
- **Desarrollo:** Docker Compose para PostgreSQL, variables de entorno, pruebas automatizadas y Git.

## 4. Roles
- **Administrador:** configura parcelas, dispositivos, usuarios y umbrales.
- **Agricultor:** consulta sus parcelas, telemetría, historial, alertas y reportes.
- **Dispositivo:** envía telemetría y eventos autenticados; no tiene permisos de usuario humano.

## 5. Requisitos funcionales
| ID | Requisito | Prioridad | Aceptación |
|---|---|---|---|
| RF-01 | Autenticación y autorización por roles | Alta | Acceso restringido a recursos propios |
| RF-02 | Registrar y gestionar parcelas | Alta | CRUD con validación y propietario |
| RF-03 | Registrar ESP32 y asociarlo a parcela | Alta | Identificador único y credenciales independientes |
| RF-04 | Recibir las tres humedades de suelo identificadas por zona, temperatura, humedad ambiental y lluvia | Alta | Payload válido persistido con hora y dispositivo |
| RF-05 | Mostrar panel con últimas mediciones y fecha de actualización | Alta | Distingue datos recientes y desconexión |
| RF-06 | Consultar histórico por rango de fechas | Alta | Gráfico y tabla con filtros |
| RF-07 | Mostrar estado del riego y registrar cambios | Alta | Eventos de apertura/cierre consultables |
| RF-08 | Configurar rangos min/max por sensor y variable dentro de la parcela | Alta | `min < max`, unidades coherentes, permisos y auditoría; no modifica el firmware automáticamente |
| RF-09 | Generar alertas por baja humedad y desconexión | Media | Alertas con estado y fecha |
| RF-10 | Calcular consumo estimado si existe caudal calibrado | Media | Litros = caudal (L/min) × minutos abiertos; indicar «estimado» |
| RF-11 | Calcular ahorro frente a línea base documentada | Media | No mostrar porcentaje sin línea base |
| RF-12 | Exportar reportes CSV | Baja | Exportación respeta filtros y permisos |
| RF-13 | Simular datos para demostración sin mezclarlos con datos reales | Alta | Ambiente demo y etiqueta visible |
| RF-23 | Registro público de agricultores, solicitado después de la fase 2 | Alta | Nombre, correo y contraseña validados; solo FARMER fijado en servidor, Argon2id, límite de solicitudes y sesión JWT. No acepta rol ni propietario del cliente; no asigna parcelas automáticamente |

## 6. Regla de control del riego
- Regla conceptual para una lectura válida: si la humedad relevante está por debajo del umbral de control y no se detecta lluvia, el **firmware local** puede solicitar apertura; en caso contrario, cierre, sujeto a sus protecciones de seguridad.
- Con tres sensores, la selección o agregación de la humedad relevante está **pendiente de acordar y probar**, según la sección 18.2. Esta regla no autoriza a implementar mínimo, promedio o mayoría ni órdenes automáticas desde NestJS o Angular.
- El **ESP32 debe conservar el control local** cuando falle la red; el servidor no debe ser una dependencia para cerrar la válvula.
- Añadir límite máximo de riego continuo, manejo de lecturas inválidas, histéresis y estado seguro ante reinicio o falla; valores definitivos requieren calibración y prueba de campo.
- Evitar encendidos/apagados repetidos por fluctuaciones de lectura.
- No habilitar apertura manual remota en MVP sin autenticación reforzada, confirmación y límites de seguridad.

## 7. Arquitectura
```text
Sensores ──> ESP32 ──> Relé ──> Electroválvula
               │
               └── HTTPS + API key por dispositivo ──> Node.js / NestJS
                                                      │
                                                      └── PostgreSQL
                                                           │
Angular Web ── HTTPS + JWT ──────────────────────────────── API REST
```

## 8. Entidades de datos propuestas
- `users`: id, name, email, password_hash, role, created_at.
- `plots`: id, owner_id, name, location_label, area_m2 nullable, created_at. Los rangos agronómicos se almacenan en `sensor_thresholds` (secciones 20 y 22), no en un único `threshold_pct` canónico por parcela.
- `devices`: id, plot_id, serial, credential_hash, status, last_seen_at.
- `readings`: id, device_id, event_id, recorded_at nullable, received_at, timestamp_origin (`device`/`server`), temperature_c nullable, air_humidity_pct nullable, rain_detected nullable, relay_commanded_open nullable, valve_feedback_open nullable, source (`real`/`demo`). Un valor desconocido es `null`, no cero ni falso.
- `soil_readings`: id, reading_id, sensor_id, zone_id, moisture_pct, quality_flag; exactamente una lectura por sensor identificado en cada evento completo, con posibilidad de lecturas parciales marcadas.
- `soil_sensors`: id, device_id, code (`soil_1`/`soil_2`/`soil_3`), zone_id, calibration_metadata, enabled.
- `valve_status_events`: id, device_id, observed_at, relay_commanded_open nullable, feedback_open nullable, source; distinguir orden de relé de confirmación física de apertura.
- `irrigation_events`: id, device_id, started_at, ended_at, duration_seconds, trigger, estimated_liters nullable.
- `alerts`: id, plot_id, type, severity, message, created_at, acknowledged_at nullable.
- `config_audit`: id, plot_id, actor_id, field, old_value, new_value, changed_at.

Índices en `readings(device_id, recorded_at)` y `irrigation_events(device_id, started_at)`. Usar UTC en almacenamiento y mostrar zona horaria local en interfaz.

## 9. Contrato inicial de API
| Método | Ruta | Función |
|---|---|---|
| POST | `/api/v1/auth/login` | Iniciar sesión |
| POST | `/api/v1/auth/register` | Crear cuenta FARMER e iniciar sesión; sin permisos administrativos ni verificación de posesión del correo todavía |
| GET | `/api/v1/plots` | Listar parcelas autorizadas |
| POST | `/api/v1/plots` | Crear parcela |
| GET | `/api/v1/plots/:id/dashboard` | Resumen del panel |
| GET | `/api/v1/plots/:id/readings?from=&to=` | Histórico |
| PATCH | `/api/v1/plots/:id/settings` | Ajustes generales de parcela; los rangos por sensor usan `/api/v1/sensors/:id/thresholds` |
| GET | `/api/v1/plots/:id/irrigation-events` | Eventos de riego |
| GET | `/api/v1/plots/:id/alerts` | Alertas |
| POST | `/api/v1/iot/telemetry` | Ingesta autenticada del ESP32 |

Ejemplo de telemetría de demostración (mismo contrato canónico de la sección 18.3):
```json
{
  "schemaVersion": "1.2",
  "eventId": "esp32-cacao-001:1842",
  "deviceId": "esp32-cacao-001",
  "recordedAt": "2026-11-19T20:00:00Z",
  "soilMoisture": {"soil_1": 42.0, "soil_2": 28.0, "soil_3": 55.0},
  "temperatureC": 28.4,
  "airHumidityPct": 76.0,
  "rainDetected": false,
  "valve": {"relayCommandedOpen": true, "feedbackOpen": null},
  "source": "demo"
}
```
El servidor valida rangos, timestamps, autenticación y asociación del dispositivo; no confía en un `deviceId` sin credenciales.

## 10. Pantallas Angular
1. Inicio de sesión y registro público de agricultores (`/login`, `/registro`), con confirmación de contraseña en la UI, errores claros y enlaces entre ambas pantallas. Alta de ADMIN exclusivamente mediante provisión administrativa, no registro público.
2. Dashboard: parcela seleccionada, conexión, tres tarjetas independientes de humedad de suelo (zonas A/B/C), sensores ambientales y lluvia, estado de riego, histórico, alertas y ODS.
3. Parcelas: listado y detalle.
4. Monitoreo: lecturas recientes e histórico.
5. Riego: estado y eventos; rangos de monitoreo editables por usuarios autorizados, separados de la política de control local del firmware.
6. Consumo: estimaciones, método y advertencias de calidad.
7. Alertas: listado y reconocimiento.
8. Reportes: filtros y exportación.
9. Configuración: perfil, parcelas y dispositivos.

**Estilo:** verde oscuro, blanco y verde claro; diseño responsive, contraste accesible y etiquetas en español. Mostrar estados de carga, error, datos obsoletos y sin datos.

**Especificación visual complementaria:** [DISENO_VISUAL_CacaoSmart.md](DISENO_VISUAL_CacaoSmart.md) documenta la captura aportada por el usuario, sus colores aproximados, estructura de escritorio, navegación y tarjetas. Incluye el diagnóstico IA que sustituye al circuito según la sección 19. Las medidas y códigos de color son orientativos; cifras, umbrales, estados de conexión y resultados de IA del mockup no constituyen datos reales ni reglas funcionales validadas. La vista móvil y los comportamientos no observables requieren diseño y verificación adicionales.

## 11. Requisitos no funcionales
- Política vigente para contraseñas nuevas: mínimo **8** y máximo **128** caracteres, al menos una mayúscula y un símbolo o signo de puntuación. Aplicar en registro, alta administrativa y bootstrap; espacios y dígitos no sustituyen el símbolo. No imponer dígitos ni minúsculas adicionales. El login de cuentas existentes sigue verificando su hash sin aplicar retroactivamente la nueva composición.
- HTTPS/TLS, contraseñas con Argon2/bcrypt, tokens de duración limitada, validación de entrada, rate limiting, CORS restringido y secretos fuera de Git.
- Autorización por propietario/parcela en **cada** endpoint.
- Respaldo periódico de PostgreSQL y procedimiento de restauración probado.
- Logging estructurado sin contraseñas ni secretos.
- Soporte para reconexión del dispositivo y reintentos con identificador idempotente para evitar duplicados.
- Interfaz responsive y navegable por teclado.
- Separación explícita de datos reales y de demostración.

## 12. Métricas e indicadores
- Humedad del suelo (%), temperatura (°C), humedad relativa (%), lluvia (sí/no).
- Tiempo de riego (minutos), volumen estimado (L) **solo con caudal calibrado**, volumen por superficie (L/m²) **solo con área registrada**.
- Ahorro (%) **solo con línea base comparable y documentada**.
- Alertas por umbral en el núcleo inicial, sin atribuirles capacidad predictiva. La extensión de pronóstico de la sección 22 permanece en alcance; tiempo de anticipación y resultados validados solo se declaran con evaluación verificable del modelo.

## 13. Fases de implementación
1. **Base técnica:** verificar Node.js, npm, Git, Docker y versiones compatibles; preparar Angular, NestJS, PostgreSQL/Prisma, Docker Compose, entorno validado, README y endpoints de salud (servicio activo y base disponible). Respetar archivos existentes y preparar contratos y separación demo/real. Cerrar con lint, pruebas básicas, build y arranque local, documentando bloqueos reales.
2. **Seguridad y datos:** modelos, migraciones, autenticación, roles, parcelas, dispositivos y permisos por propietario.
3. **Telemetría:** ingesta autenticada, validación, idempotencia, lecturas parciales, consulta y simulador determinista de tres sensores. Adaptador externo preparado sin inventar contrato real.
4. **Tiempo real y dashboard:** REST + Socket.IO, reconexión y resincronización, interfaz fiel a la referencia visual, histórico de tres series y estados de calidad/conexión. La tarjeta IA puede indicar función pendiente hasta su fase, sin resultados o botones que aparenten funcionar.
5. **Gestión agrícola:** rangos min/max por sensor y variable, alertas, eventos de riego, métricas hídricas condicionadas a datos suficientes y reportes.
6. **Diagnóstico IA:** captura, consentimiento, almacenamiento privado, historial, proveedor simulado explícito e integración OpenAI posterior con imágenes autorizadas y presupuesto/configuración definidos.
7. **Clima y predicción:** ingesta pública con procedencia, baseline heurístico, regresión múltiple, evaluación cronológica y pantalla de pronóstico con incertidumbre y límites.
8. **Validación final:** integración de hardware/servidor real cuando exista contrato auténtico, pruebas end-to-end, seguridad, respaldos, documentación y demo del hackathon. Las pruebas se ejecutan también en cada fase, no solo al final.

Estas fases conservan todo el alcance v1.4 y ordenan su ejecución; no requieren implementar todo en el primer incremento. La conexión real puede verificarse antes si se dispone de contrato y hardware, sin cambiar el orden de dependencias. La falta de hardware, clave de OpenAI o datos para entrenar no bloquea la base ni los simuladores, pero impide declarar verificadas esas integraciones o predicciones.

## 14. Validación y criterios de entrega
- Lecturas del ESP32 se guardan y aparecen en Angular con marca temporal.
- Validar apertura/cierre local ante lluvia y humedad conforme a la política multizona que el equipo acuerde y pruebe (secciones 6 y 18.2); no asumir agregación ni umbrales a partir del mockup. Sin retroalimentación física, la web solo acredita la orden del relé, no apertura ni flujo real.
- Una desconexión no impide el control local seguro.
- Usuarios no pueden consultar parcelas ajenas.
- La demo no presenta datos ficticios como reales.
- Tests unitarios de reglas de negocio y tests de integración de API y base de datos.

## 15. Preguntas abiertas
Modelo exacto de sensores; protocolo y formato actual del firmware; voltaje/tipo de válvula; existencia de caudalímetro; caudal calibrado; umbral apropiado para suelo y cacao; cantidad de parcelas; frecuencia de envío; hosting; disponibilidad de internet; roles finales.

## 16. Restricciones de alcance
No afirmar reducción de consumo, rendimiento agrícola, predicción de sequía ni ahorro monetario sin evidencia. No modificar firmware que ya funciona sin conocer conexiones, lógica y pruebas de seguridad. El MVP prioriza monitoreo, trazabilidad y demostración reproducible.

## 17. Integración de telemetría en tiempo real (versión 1.1)
**Requisito arquitectónico obligatorio:** el frontend debe estar listo para recibir lecturas reales sin reescribir componentes. Implementar desde el inicio un contrato estable y un adaptador de origen de datos. La integración con el servidor que actualmente recibe sensores queda pendiente de conocer su protocolo y endpoints.

### 17.1 Flujo objetivo
```text
ESP32 + sensores -> servidor receptor / adaptador IoT -> NestJS -> PostgreSQL
                                                      |-> WebSocket (Socket.IO)
Angular <- GET /api/v1/plots/:id/dashboard (snapshot) --|
Angular <- evento telemetry.updated (stream) -----------|
```
Si el servidor receptor es distinto de NestJS, crear `TelemetryProvider`/`ExternalTelemetryAdapter` en backend: adaptar datos entrantes vía webhook HTTPS firmado, polling servidor-servidor o suscripción MQTT, según la interfaz disponible. **Nunca** conectar Angular directamente al ESP32, a PostgreSQL ni exponer credenciales del servidor receptor en el navegador.

### 17.2 Contrato canónico de lectura
Contrato de ingreso vigente, desarrollado en la sección 18.3. `source` en el ejemplo identifica demostración; el servidor determina el origen por el canal autenticado.
```json
{
  "schemaVersion": "1.2",
  "eventId": "esp32-cacao-001:1842",
  "deviceId": "esp32-cacao-001",
  "recordedAt": "2026-11-19T20:00:00Z",
  "soilMoisture": {"soil_1": 42.0, "soil_2": 28.0, "soil_3": 55.0},
  "temperatureC": 28.4,
  "airHumidityPct": 76.0,
  "rainDetected": false,
  "valve": {"relayCommandedOpen": true, "feedbackOpen": null},
  "source": "demo"
}
```
`eventId` es obligatorio para deduplicar reintentos; si el firmware no lo produce, el adaptador debe construir una clave estable acordada con el emisor. `recordedAt` debe ser hora fiable del dispositivo; si no existe, usar `null`, conservar `receivedAt` y registrar `timestampOrigin=server`. `valve.relayCommandedOpen` informa de la orden local observada del relé, no es una orden del servidor; `valve.feedbackOpen` solo informa de confirmación física cuando existe. El dispositivo autenticado determina la identidad: el `deviceId` del JSON no concede permisos. Los adaptadores pueden traducir formatos antiguos, pero no deben convertir un `valveOpen` ambiguo en confirmación física sin conocer su semántica.

### 17.3 Entrega de eventos al navegador
- Angular hace GET inicial del snapshot y luego se suscribe a WebSocket autenticado, por parcela autorizada; evento `telemetry.updated` con lectura normalizada, `receivedAt`, `plotId` y `source`.
- El backend **primero valida y persiste** la lectura, **después** emite el evento; mantener REST como fuente de verdad tras recargas o pérdidas de conexión.
- Reconexión con backoff y relectura de snapshot; no asumir entrega exactamente una vez de WebSocket. Ordenar por tiempo y no reemplazar una lectura nueva con una antigua.
- `device.status` / `device.offline` y `irrigation.updated` como eventos separados; desconexión según intervalo configurable y margen de tolerancia, no un valor fijo inventado.
- Exponer `lastSeenAt`, `receivedAt`, estado `online/stale/offline` y errores de conectividad. La etiqueta «en línea» solo se muestra con evidencia reciente.
- Configurar CORS/orígenes WebSocket, JWT de usuario y autorización de acceso a cada parcela y sala.

### 17.4 Modo simulación y modo real
Definir una interfaz Angular `TelemetryDataSource` con implementaciones `DemoTelemetryDataSource` y `ApiTelemetryDataSource`; misma forma de datos y componentes. `environment`/configuración selecciona modo; etiqueta permanente «Datos simulados» en demo. No escribir telemetría demo en tablas de producción sin separación explícita por `source` y entorno. En modo real, fallar con estado visible y opción de reintento, **nunca** sustituir silenciosamente por datos inventados.

### 17.5 Ingesta y persistencia
- Endpoint `POST /api/v1/iot/telemetry` autenticado por dispositivo (HTTPS + credencial por dispositivo) para integración directa; añadir adaptador de servidor externo cuando se conozca su contrato.
- Validar 0–100% para humedades, valores físicos plausibles y timestamp; rechazar payload inválido con código y mensaje documentados.
- Índice único `(device_id, event_id)`; guardar `recorded_at`, `received_at`, `source`, y payload normalizado. Registrar reintentos como idempotentes, sin duplicar alertas ni eventos.
- Históricos con paginación y filtros; no cargar todo el histórico en memoria del navegador.
- La frecuencia de publicación será configurable y se fijará tras medir capacidad del enlace y consumo del ESP32.

### 17.6 Pruebas de integración obligatorias
1. Simulador envía lecturas al endpoint: PostgreSQL persiste y Angular actualiza sin recargar.
2. Cerrar WebSocket y reconectar: el dashboard recupera la lectura más reciente por REST.
3. Reenviar `eventId`: una sola lectura persistida.
4. Dos usuarios con parcelas diferentes: sin fuga de eventos entre salas.
5. Sensor deja de enviar: estado obsoleto/desconectado visible; no mostrar «en línea».
6. Lectura fuera de orden o inválida: no sobrescribe la última válida.
7. Desconexión de Internet: el ESP32 sigue tomando decisiones locales de riego de forma segura.

### 17.7 Información pendiente del servidor receptor
Solicitar antes de conectar: URL/base host, protocolo (HTTP, MQTT u otro), autenticación, ejemplo real de payload, frecuencia, identificadores de dispositivo, si soporta webhooks o lectura de últimos datos, timestamp y zona horaria. No inventar endpoints ni credenciales. Preparar un adaptador reemplazable hasta recibir estos datos.

### 17.8 Contrato único de evento `telemetry.updated`

El evento es **agregado por lectura de dispositivo**, no un evento individual por sensor. Utilizar la misma estructura normalizada para fuentes demo/reales, REST y Socket.IO. El dashboard REST envuelve esa lectura con parcela, rangos y estados; el histórico devuelve lecturas paginadas de la misma forma. Las respuestas REST no necesitan el envoltorio de transporte del evento.

Ejemplo normalizado de demostración, emitido solo después de validar y persistir:

```json
{
  "schemaVersion": "1.0",
  "plotId": "plot-demo-001",
  "reading": {
    "eventId": "esp32-cacao-001:1842",
    "deviceId": "esp32-cacao-001",
    "recordedAt": "2026-11-19T20:00:00Z",
    "receivedAt": "2026-11-19T20:00:01Z",
    "timestampOrigin": "device",
    "source": "demo",
    "soilMoisture": {"soil_1": 42, "soil_2": 28, "soil_3": 55},
    "temperatureC": 28.4,
    "airHumidityPct": 76,
    "rainDetected": false,
    "valve": {"relayCommandedOpen": true, "feedbackOpen": null},
    "quality": {
      "soil_1": "valid",
      "soil_2": "valid",
      "soil_3": "valid",
      "temperatureC": "valid",
      "airHumidityPct": "valid",
      "rainDetected": "valid",
      "relayCommandedOpen": "valid",
      "feedbackOpen": "missing"
    }
  }
}
```

- La versión `1.0` corresponde al evento normalizado; la versión `1.2` de la sección 18.3 corresponde al ingreso IoT. Son contratos distintos, no versiones intercambiables.
- Unidades canónicas: humedades en %, temperatura en °C, lluvia detectada booleana y estados de válvula booleanos; `null` representa ausencia de dato. No enviar lluvia binaria como precipitación en mm.
- `quality` describe calidad del dato (`valid`, `missing`, `invalid`, `uncalibrated`), no el estado agronómico bajo/en rango/alto. Una calidad inválida no se presenta como medición válida; conservar motivo de diagnóstico sin publicar un valor fuera de contrato.
- Conservar siempre las claves de los tres sensores en la lectura normalizada. Una lectura parcial utiliza valor `null` y calidad explícita para cada dato ausente. No rellenar con cero ni arrastrar silenciosamente valores anteriores a una lectura nueva.
- `receivedAt`, `plotId`, origen y calidad se asignan o verifican en servidor. Si `recordedAt=null`, la ordenación utiliza `receivedAt`; registrar el origen temporal y no permitir que una lectura anterior sustituya a otra más reciente. Definir y probar el desempate al implementar.
- `sensor.status` comunica salud/conectividad por sensor; `device.status`/`device.offline` comunican conexión del dispositivo; `irrigation.updated` comunica cambios de riego. No reutilizar `telemetry.updated` con otra estructura para esos eventos.
- Cambios incompatibles requieren nueva versión explícita y adaptación documentada. Mantener DTOs, OpenAPI, simulador y modelos TypeScript alineados.


## 18. Ampliación obligatoria — tres sensores y circuito de referencia (v1.2)

### 18.1 Inventario funcional
- **Confirmado por el equipo:** 1 ESP32, **3 sensores de humedad del suelo**, sensor de temperatura y humedad relativa ambiental, detección de lluvia, módulo relé y electroválvula; automatización local y envío de datos al servidor para consulta web.
- **Visible en el circuito aportado:** ESP32, una sonda de humedad, sensor ambiental tipo DHT, relé, electroválvula y fuente rotulada 9 V. La imagen **no confirma** que los tres sensores de suelo ni el sensor de lluvia estén cableados, ni que haya sensor de posición de válvula o caudalímetro.
- **Pendiente:** modelo, alimentación, pines, calibración y cantidad exacta de sensores adicionales asociados a la válvula. No suponer que el relé confirma el flujo real ni conectar una válvula de tensión desconocida a 9 V sin verificar especificaciones y protecciones.

### 18.2 Regla multizona pendiente de decisión
El sistema registrará y mostrará las tres humedades por separado; **no se calculará un único porcentaje de suelo sin indicar método**. El control físico es una sola electroválvula según el esquema: **no prometer riego independiente por zonas**. La política que dispara la válvula (mínimo, promedio, mayoría, prioridad por zona u otra) debe acordarse y probarse en firmware; hasta entonces, dashboard muestra las tres lecturas y la decisión/estado observado del ESP32 sin recalcular ni mandar órdenes automáticas desde el servidor. Los umbrales ilustrativos (35 %) no equivalen a valores agronómicos validados.

### 18.3 Payload canónico v1.2 (ejemplo de demostración, NO telemetría real)
```json
{
  "schemaVersion": "1.2",
  "eventId": "esp32-cacao-001:1842",
  "deviceId": "esp32-cacao-001",
  "recordedAt": "2026-11-19T20:00:00Z",
  "soilMoisture": {"soil_1": 42, "soil_2": 28, "soil_3": 55},
  "temperatureC": 28.4,
  "airHumidityPct": 76,
  "rainDetected": false,
  "valve": {"relayCommandedOpen": true, "feedbackOpen": null},
  "source": "demo"
}
```
El servidor asigna `receivedAt`, valida el emisor y traduce a unidades canónicas; los identificadores `soil_1`–`soil_3` son estables. `feedbackOpen=null` significa que **no existe confirmación física de apertura**; no inferirla de la orden al relé. Para producción `source` se asigna según canal autenticado, no se confía en la etiqueta del emisor. Una lectura ausente se marca `null`/sin datos y genera diagnóstico, no se reemplaza por cero.

Para un evento completo se envían las tres humedades. Para uno parcial se mantienen las tres claves y se usa `null` para sensores ausentes; ambiente, lluvia y estado de relé también admiten `null` cuando no se conocen. El adaptador conserva o determina calidad y procedencia antes de publicar la lectura normalizada de la sección 17.8. No aceptar números o booleanos fuera de contrato; distinguir ausencia de dato de un mensaje inválido. Ningún campo del ingreso habilita control remoto de la válvula.

### 18.4 Pantalla Angular obligatoria conforme a la última maqueta
- Encabezado de parcela y estado de conexión real con última actualización.
- **Tres tarjetas:** Sensor 1 (Zona A), Sensor 2 (Zona B), Sensor 3 (Zona C), cada una con humedad %, estado de calidad, marca temporal y barra; estado bajo umbral solo si está configurado.
- Tarjetas separadas de temperatura, humedad relativa y detección de lluvia.
- Estado de riego: orden del relé y, solo si hay retroalimentación física, confirmación de válvula; duración de sesión y litros solo si están disponibles o se pueden estimar con supuestos documentados.
- Gráfico histórico **de tres series**, una por sensor, filtros 24 h / 7 días / 30 días y línea de umbral solo si se conoce la política.
- Tarjeta «Diagnóstico de plantas con IA» en lugar del esquema de hardware, conforme a la sección 19 y la referencia visual. El circuito y el flujo ESP32 -> backend -> PostgreSQL -> WebSocket -> Angular se documentan técnicamente fuera del dashboard.
- Consumo/ahorro, alertas por zona y tarjetas ODS 6, 12 y 13. No mostrar cifras simuladas como mediciones reales.
- Menú: Inicio, Monitoreo, Parcelas, Diagnóstico IA, Historial, Riego, Consumo de agua, Alertas, Reportes y Configuración. La pantalla adicional «Predicción hídrica» de la sección 22 requiere acceso identificable al implementarse; su posición en navegación queda por definir sin eliminar las opciones de referencia.

### 18.5 Eventos de tiempo real
- `telemetry.updated`: evento agregado conforme a la sección 17.8; incluye `soilMoisture` con los tres identificadores, ambiente, lluvia, fechas, origen y calidad dentro de `reading`.
- `irrigation.updated`: refleja estado observado, orden del relé y retroalimentación de válvula si existe.
- `sensor.status`: alerta por sonda sin datos, fuera de rango o desactualizada, sin confundirla con falla de todo el dispositivo.
- Al reconectar WebSocket, obtener snapshot REST por parcela, recuperar lecturas faltantes y descartar eventos anteriores al último mostrado.

### 18.6 Criterios adicionales de aceptación
1. Tres sondas se muestran de forma independiente y conservan su identidad al llegar lecturas nuevas.
2. Una sonda desconectada se muestra «Sin datos» sin ocultar las otras dos.
3. Los gráficos históricos tienen tres series correctas y filtros funcionales.
4. Se actualizan las tarjetas por WebSocket sin recargar y se recuperan tras reconexión.
5. El dashboard no inventa caudal, ahorro, estado físico de válvula ni reglas de agregación.
6. La lógica local del ESP32 continúa operando sin conectividad web.


## 19. Módulo: diagnóstico visual de cacao mediante IA (v1.3)
**Propósito:** permitir al agricultor tomar una foto con cámara o subir una imagen de hojas, frutos o tallos, solicitar análisis visual a un modelo GPT con capacidad de visión y recibir una **evaluación orientativa**, síntomas observables, posibles causas y acciones de seguimiento. No sustituye un diagnóstico fitopatológico profesional.

### Requisitos funcionales adicionales
| ID | Requisito | Prioridad | Criterio de aceptación |
|---|---|---|---|
| RF-14 | Nueva ruta Angular `/diagnostico-ia` y acceso desde menú | Alta | Diseño responsive consistente con dashboard verde/blanco |
| RF-15 | Tomar foto desde dispositivo móvil o seleccionar archivo | Alta | `input type=file accept=image/* capture=environment` cuando sea compatible; alternativa de galería |
| RF-16 | Previsualizar, sustituir y confirmar fotografía | Alta | No enviar sin consentimiento del usuario |
| RF-17 | Validar imagen y analizarla desde NestJS usando API OpenAI | Alta | JPEG/PNG/WebP; tamaño máximo configurable, por defecto 8 MB; error claro ante archivo inválido |
| RF-18 | Mostrar resultado estructurado | Alta | Parte de planta, signos visibles, causas posibles, incertidumbre, próximos pasos y advertencia |
| RF-19 | Guardar diagnóstico vinculado al agricultor y parcela | Alta | Historial filtrable por parcela, fecha y estado |
| RF-20 | Comparar fotos anteriores de una planta | Media | Mostrar dos fotografías y fechas; no declarar mejoría automáticamente sin evidencia |
| RF-21 | Gestionar fallo de API, cuota, timeout y límites | Alta | Mensajes amigables, reintento controlado y sin duplicar cargos por clics repetidos |
| RF-22 | Separar datos reales y demo de diagnósticos | Alta | Modo demo explícito; nunca presentar diagnóstico simulado como real |

### Diseño de interfaz actualizado
- Mantener tarjetas de **tres sensores de humedad** (zonas A, B, C), temperatura, humedad relativa, lluvia, estado de riego, consumo, alertas, tendencias y ODS 6/12/13.
- **Eliminar el esquema/circuito de hardware del dashboard principal** y usar ese espacio para una tarjeta «Diagnóstico de plantas con IA»: foto de hoja, acciones «Tomar foto» y «Subir imagen», estado del análisis, resumen de síntomas, posibles causas, recomendaciones y aviso «Análisis orientativo, no diagnóstico definitivo».
- Crear pantalla completa con captura, galería, vista previa, progreso, resultado y diagnósticos anteriores; en móvil apilar tarjetas y facilitar captura desde cámara.
- Los datos de sensores, consumo, ahorro y ejemplos de IA en maquetas son ilustrativos, claramente etiquetados.

### Arquitectura e integración
```text
Angular (captura/selección + confirmación)
  └── HTTPS multipart/form-data + JWT ──> NestJS /ai-diagnostics
      ├── autenticación + autorización sobre parcela
      ├── validación de tipo real, tamaño y límites por usuario
      ├── almacenamiento privado de imágenes (local en desarrollo; objeto privado en producción)
      ├── servicio OpenAI (clave solo en servidor; modelo con visión configurable)
      ├── validación de salida estructurada y reglas de seguridad
      └── PostgreSQL/Prisma (diagnóstico, metadatos, auditoría)
Angular ── GET /ai-diagnostics?plotId=... ──> Historial
```
El flujo de **telemetría en tiempo real** ESP32 → NestJS → PostgreSQL → WebSocket/Socket.IO → Angular se mantiene independiente del módulo de imágenes. El módulo de IA no controla la electroválvula ni modifica decisiones de riego.

### Contrato API sugerido
- `POST /api/v1/ai-diagnostics` (JWT, multipart `image`, `plotId`, `plantId?`, `notes?`): devuelve `id`, `status` (`pending|completed|failed`), `createdAt`.
- `GET /api/v1/ai-diagnostics/:id`: resultado solo para propietario/autorizado.
- `GET /api/v1/ai-diagnostics?plotId=&page=&limit=`: historial paginado.
- `DELETE /api/v1/ai-diagnostics/:id`: eliminación autorizada de registro e imagen según política.
- Opcional `GET /api/v1/ai-diagnostics/:id/image`: URL temporal o proxy autenticado; nunca ruta pública sin control.

Ejemplo de salida validada en backend (no diagnóstico real):
```json
{
  "plantPart": "leaf",
  "visibleSymptoms": ["manchas oscuras"],
  "possibleCauses": [{"name": "enfermedad foliar u otra causa", "reason": "patrón visual inespecífico"}],
  "uncertainty": "high",
  "recommendedActions": ["Tomar fotos adicionales", "Solicitar revisión de un técnico agrícola"],
  "requiresExpertReview": true,
  "disclaimer": "Análisis visual orientativo; no confirma enfermedades."
}
```
**No inventar probabilidades o precisión clínica/agronómica.** Si la imagen es borrosa, no muestra cacao o carece de evidencia suficiente, responder «no concluyente» y solicitar una foto mejor. No ofrecer prescripciones de pesticidas, dosis ni tratamientos químicos específicos sin respaldo profesional/local.

### Modelo de datos Prisma sugerido
- `Plant`: `id`, `plotId`, `label`, `createdAt` (opcional para MVP).
- `AiDiagnosis`: `id`, `userId`, `plotId`, `plantId?`, `imageStorageKey`, `mimeType`, `status`, `plantPart?`, `visibleSymptoms` JSON, `possibleCauses` JSON, `uncertainty?`, `recommendedActions` JSON, `requiresExpertReview`, `disclaimer`, `modelId?`, `errorCode?`, `createdAt`, `completedAt?`.
- Relaciones e índices por `plotId`, `userId`, `createdAt`; migraciones Prisma versionadas. No almacenar imágenes binarias en PostgreSQL por defecto.

### Seguridad, privacidad y costos
- API key de OpenAI en variables de entorno backend (`OPENAI_API_KEY`), jamás en Angular, Git o respuestas HTTP.
- Usar SDK oficial del servidor y modelo con capacidad de visión disponible/configurable (`OPENAI_VISION_MODEL`); comprobar contrato actual de API antes de codificar.
- Validar tipo por contenido, tamaño, permisos y cuota; limpiar metadatos EXIF/geolocalización cuando sea posible; evitar ejecución de archivos y aplicar rate limiting.
- No enviar datos personales innecesarios a la API; informar al usuario que la foto se enviará a un proveedor externo para análisis; política de retención y eliminación configurable.
- Definir límites por usuario/día, timeout, reintentos con backoff y métricas de uso/costo sin registrar imágenes o claves en logs.
- La respuesta del modelo es **dato no confiable**: parsear y validar esquema, no ejecutar instrucciones contenidas en imagen ni texto devuelto.

### Variables de entorno nuevas
`OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, `AI_MAX_IMAGE_MB=8`, `AI_DAILY_LIMIT_PER_USER`, `AI_REQUEST_TIMEOUT_MS`, `IMAGE_STORAGE_PATH` (desarrollo), `IMAGE_RETENTION_DAYS`.

### Pruebas de aceptación del módulo IA
1. Captura móvil y carga de JPEG/PNG/WebP funcionan y muestran vista previa.
2. Imagen inválida, demasiado grande, vacía o de otra parcela se rechaza con mensaje claro.
3. Se crea diagnóstico y el historial solo es visible para usuarios autorizados.
4. Con API simulada se comprueba la estructura, estados de carga, fallos y reintentos.
5. Si el modelo no puede concluir, muestra incertidumbre y revisión técnica; no afirma diagnóstico definitivo.
6. La tarjeta de IA reemplaza el diagrama de circuito; los tres sensores y el resto del dashboard permanecen visibles.
7. La ausencia de credenciales de OpenAI no bloquea monitoreo, riego ni modo demo.

### Pendientes de confirmación
Modelos exactos de sensores y protocolo de ingreso, regla de agregación de los tres sensores para riego, método de medición de agua, proveedor de almacenamiento de imágenes, presupuesto de API y política de retención. No bloquear la construcción del frontend por estas decisiones: abstraer adaptadores y utilizar mocks identificados.


## 20. Ampliación v1.4 — rangos de sensores y visualización dinámica
**RF-IA-01 (alta):** configurar `min_value` y `max_value` por sensor, parcela, variable y unidad, con `min_value < max_value`; mantener auditoría, fecha de vigencia y valores por defecto **no agronómicos** hasta calibración. El rango físico de lectura (p. ej., 0–100 % de humedad calibrada) es distinto del rango agronómico deseable; jamás confundirlos.

**RF-IA-02 (alta):** mostrar por separado los tres sensores de suelo (A/B/C) en medidores de nivel, barras de progreso, tarjetas y series históricas con líneas de mínimo/máximo, marcas de tiempo, unidades, estado de calibración y calidad del dato. Indicadores: bajo / en rango / alto / sin datos / desactualizado. La posición del medidor cambia con cada lectura real recibida por Socket.IO; el simulador funciona por la misma interfaz de datos con etiqueta «DEMO».

**RF-IA-03 (alta):** soportar rangos propios para temperatura (°C), humedad ambiental (%), humedad del suelo (%) y otras magnitudes cuantitativas. La lluvia detectada es una variable booleana, no un porcentaje; la precipitación acumulada en mm es otra variable procedente de fuente meteorológica o pluviómetro, no del sensor binario.

**Modelo y API de rangos:** `sensor_thresholds` es la fuente canónica por sensor y variable; los sensores ambientales deben contar con identidad persistente, no solo las sondas de suelo. Los IDs `soil_1`–`soil_3` son códigos estables dentro del dispositivo; `/sensors/:id/thresholds` usa el ID persistente autorizado por parcela. Los valores por defecto, si existen, se identifican como demostración/no validados. Si no hay rango configurado, mostrar «Sin rango configurado» en vez de afirmar «Normal». Cambiar un rango en la web afecta clasificación y alertas; no actualiza umbrales del firmware automáticamente. Cualquier sincronización futura exige contrato, autorización y pruebas de seguridad. Mantener separados rangos agronómicos, calibración física y política multizona de riego.

**RF-IA-04 (media):** validar umbrales, aplicar histéresis y alertas con antirrebote; una lectura fuera de rango no implica por sí misma una orden remota de abrir la válvula. Las reglas físicas de control local siguen pendientes de acordar y probar para los tres sensores. Evitar que una sonda defectuosa provoque riego excesivo.

**RF-IA-05 (alta):** graficar evolución por sensor y comparación A/B/C en 24 horas, 7 días, 30 días y rangos personalizados; mostrar discontinuidades, no interpolar silenciosamente datos faltantes, y registrar zona horaria de presentación.

## 21. Ampliación v1.4 — datos públicos agroclimáticos
**Objetivo:** construir un conjunto reproducible de variables externas para Chone, Manabí, que complemente la telemetría del ESP32, sin afirmar que equivale a mediciones de campo.

Fuentes candidatas a verificar, con documentación y términos de uso antes de integrar:
- **Open-Meteo Historical Weather API:** https://open-meteo.com/en/docs/historical-weather-api — temperatura, precipitación, humedad relativa, evapotranspiración de referencia ET₀ y variables de suelo cuando estén disponibles para ubicación/modelo/periodo. Datos meteorológicos de reanálisis/modelados; documentar resolución y fuente.
- **NASA POWER:** https://power.larc.nasa.gov/ — series agroclimáticas de radiación, temperatura, precipitación, humedad y viento, según parámetro y disponibilidad.
- **FAO CropWat / FAO-56:** https://www.fao.org/land-water/databases-and-software/cropwat/en/ — marco de cálculo de necesidades de agua y evapotranspiración, **no** dataset local de consumo medido del cacao.

Registrar `provider`, `dataset`, `lat`, `lon` (coordenadas de parcela solo si autorizadas), `date`, `timezone`, `variable`, `unit`, `value`, `quality`, `fetched_at`, `model_or_station`, `resolution` y versión del origen. Los datos públicos no garantizan predicción fiable para una parcela sin calibración con observaciones locales. La fuente meteorológica puede aportar precipitación en mm; un sensor de lluvia digital solo confirma presencia/ausencia.

**Pipeline:** tarea programada de ingestión → validación de unidades, fechas, duplicados, vacíos y cobertura → persistencia de datos crudos y normalizados → unión temporal por parcela → tabla de características versionada. Cachear solicitudes, gestionar límites de uso, errores y reintentos; evitar rellenar series con valores inventados. No usar datos futuros observados al simular predicciones históricas (fuga de información).

## 22. Ampliación v1.4 — pronóstico de humedad y necesidad hídrica
**RF-PR-01 (alta):** implementar una línea base de **regresión lineal múltiple** para pronosticar humedad del suelo por zona o déficit hídrico, con horizonte inicial de 1–7 días y ampliación solo tras validación. Variables candidatas: humedad A/B/C con retardos y tendencias, temperatura, humedad ambiental, lluvia medida, precipitación externa, ET₀, riegos previos, estación y atributos de parcela. El objetivo (`target`) y la unidad se definen explícitamente para cada modelo; no confundir predicción de humedad con predicción de litros.

**RF-PR-02 (alta):** comparar contra un método **heurístico / balance hídrico** (precipitación efectiva + riego – evapotranspiración – otras pérdidas, con parámetros calibrados). El balance no es una regresión; ambas alternativas se evalúan por separado y pueden combinarse si los datos lo justifican.

**RF-PR-03 (alta):** estimar la fecha de próximo riego cuando el pronóstico cruce un umbral **calibrado** y reportar déficit en mm; convertir a volumen solo con área de parcela y eficiencia de aplicación: `litros_brutos = deficit_mm * area_m2 / eficiencia` (1 mm sobre 1 m² = 1 L). No afirmar demanda real de cacao sin coeficiente de cultivo (Kc), suelo, profundidad radicular, lluvia efectiva, edad del cultivo y calibración local. Si faltan, mostrar «No calculable» o una estimación condicionada con supuestos visibles.

**RF-PR-04 (alta):** evaluación temporal (train/validation/test por fecha, nunca mezcla aleatoria para series), comparación con persistencia/naive, MAE/RMSE por horizonte y parcela, análisis de sesgo, intervalos de incertidumbre cuando estén calibrados. Prohibido mostrar precisión, fecha o volumen como resultado validado antes de medir el error fuera de muestra. Las predicciones mensuales se consideran exploratorias hasta contar con historial y validación adecuados.

**RF-PR-05 (media):** entrenamiento offline en Python/scikit-learn, con artefacto de modelo versionado, metadatos de variables y fecha de entrenamiento. Exponer predicciones mediante servicio Python interno autenticado o proceso batch que NestJS consulta; no ejecutar entrenamiento pesado en solicitudes del usuario. Fallback seguro si el modelo falla o faltan datos.

**RF-PR-06 (alta):** pantalla Angular «Predicción hídrica» con fecha/horizonte, gráfico observado vs pronosticado, bandas de incertidumbre cuando existan, necesidad de riego estimada, déficit mm, volumen L solo si calculable, origen de datos, última actualización, versión de modelo, métricas y estado «experimental / validado». Prohibido que la predicción controle automáticamente la válvula sin un proceso posterior de validación y autorización.

### Persistencia adicional
- Registro persistente de sensores de suelo y ambientales vinculado a dispositivo/parcela, reutilizando o generalizando `soil_sensors` sin perder los códigos A/B/C. `sensor_thresholds.sensor_id` debe referenciar esa identidad para soportar también temperatura y humedad ambiental.
- `sensor_thresholds(id, sensor_id, variable, min_value, max_value, unit, hysteresis, effective_at, updated_by)`; conservar auditoría y vigencia. La parcela se verifica a través de la asociación del sensor y dispositivo.
- `weather_observations(id, plot_id, provider, dataset, observed_at, variable, value, unit, quality, provenance)` con índice `(plot_id, variable, observed_at)`.
- `model_versions(id, name, version, target, horizon_days, feature_schema, trained_until, metrics_json, artifact_ref, status)`.
- `predictions(id, plot_id, zone_id, model_version_id, issued_at, target_at, variable, predicted_value, unit, lower_bound, upper_bound, data_quality, source)`.
- `water_demand_estimates(id, plot_id, issued_at, target_date, deficit_mm, area_m2, efficiency, gross_liters, assumptions_json, status)`.

### API y eventos adicionales
- `GET/PUT /api/v1/sensors/:id/thresholds` (permisos por parcela, validación y auditoría).
- `GET /api/v1/plots/:id/series?variable=...&from=...&to=...&sensorId=...`.
- `GET /api/v1/plots/:id/weather?from=...&to=...`.
- `GET /api/v1/plots/:id/predictions?horizonDays=7`.
- `GET /api/v1/plots/:id/water-demand`.
- `POST /api/v1/internal/weather/sync` (solo servicio autorizado; preferir job programado).
- Evento Socket.IO `telemetry.updated` agregado y versionado según la sección 17.8. No emitir un payload individual `sensorId/value/unit` bajo ese mismo nombre. Usar salas autorizadas por parcela y eventos separados de estado de conexión; no confiar en identificadores enviados por clientes.

### Criterios de aceptación v1.4
1. Tres medidores A/B/C actualizan sus niveles sin refrescar y muestran min/max configurados; prueban casos bajo, dentro, alto, sin lectura y desconectado.
2. Umbrales inválidos son rechazados y los cambios quedan auditados; no alteran firmware por accidente.
3. Un proceso de ingestión de ejemplo almacena clima con procedencia y sin confundir lluvia binaria con precipitación mm.
4. Entrenamiento reproducible con partición temporal, comparación contra baseline y métricas verificables, sin fuga temporal.
5. Pronóstico devuelve horizonte, fecha, variable, unidad, versión de modelo y calidad; si no hay suficientes datos indica indisponibilidad.
6. El volumen estimado solo aparece cuando existen déficit, área y eficiencia definidos; los ejemplos de la demo siempre están rotulados.
7. No hay apertura automática de válvula basada únicamente en pronósticos.

## 23. Estado de decisiones pendientes
- Confirmar modelos y calibración de tres sondas, DHT, sensor de lluvia, tipo de válvula y fuente de alimentación.
- Confirmar protocolo real del ESP32, frecuencia de envío y servidor receptor.
- Definir con agrónomo rangos por sensor, suelo y etapa del cacao, histéresis y política de tres zonas para **una sola** electroválvula.
- Definir superficie, caudal/caudalímetro, eficiencia, edad de cacao, tipo de suelo y profundidad efectiva para demanda en litros.
- Verificar disponibilidad y licencia de variables históricas de Open-Meteo/NASA POWER en coordenadas y fechas del piloto.
- Reunir datos de campo suficientes para validar modelos; no presentar la simulación como predicción real.
