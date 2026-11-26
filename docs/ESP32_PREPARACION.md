# ESP32 — preparación sin hardware y conexión supervisada

## Qué queda preparado

- Contrato HTTP v1.2 existente, con un
  [JSON DEMO sin credenciales](examples/iot-telemetry.demo.json).
- Comprobador offline del mismo DTO y regla temporal que usa la ingesta.
- Pruebas con datos sintéticos para identidad, tres sondas, null, duplicados,
  orden temporal, desconexión y recuperación.
- [Ficha para recoger información del dispositivo](ESP32_FICHA_INTEGRACION.md).

**No se acredita conexión física.** No hay firmware nuevo, adaptador externo
inventado, cambios de pines, calibración, Wi-Fi, firewall, CORS, puertos o permisos.
El ESP32 mantiene la decisión local del riego.

## 1. Comprobaciones que puedes ejecutar hoy

Desde la raíz y con las dependencias existentes:

```powershell
# Solo lee el ejemplo y valida JSON; no necesita Docker ni credenciales.
npm.cmd run iot:check -- --demo

# Pruebas del comprobador y del simulador, sin usar tu cuenta.
npm.cmd run test:iot-contract
npm.cmd run test:simulator

# Con los servicios locales iniciados.
npm.cmd run smoke
```

`iot:check` no carga `.env`, no llama a un endpoint, no abre PostgreSQL,
no crea cuentas/dispositivos y no usa claves. Un resultado conforme significa
solo **estructura y reloj compatibles**, no autorización ni calibración.
El UUID del ejemplo es ficticio; no usarlo para registrar o identificar hardware.
Sus números también son ficticios: no enviarlos por un canal REAL aunque se
sustituya el UUID. El ejemplo es solo para comprobar el contrato offline.

Para tu muestra real, guardar únicamente el cuerpo JSON en un archivo privado
nuevo, por ejemplo `.local/esp32-muestra.json`, sin encabezados, claves ni
contraseñas. Después:

```powershell
npm.cmd run iot:check -- --input .local/esp32-muestra.json
```

El archivo debe ser JSON regular bajo `.local`, hasta **64 KiB** para esta
herramienta. Rechaza escapes de ruta, enlaces a fuera del área privada,
archivos no JSON, campos extra y valores de tipos incorrectos. Los errores
identifican solo campos conocidos y no muestran sus valores ni claves desconocidas.
Este límite del comprobador no redefine el límite HTTP del servidor.

Una salida con error no obliga a cambiar el firmware: si usa otro contrato,
primero completar la ficha y diseñar un adaptador fiel a su semántica.

## 2. Estado local observado y bloqueos para el ESP32

En esta revisión:

- API: `HOST=127.0.0.1`, `PORT=3100`, entorno de desarrollo.
- Telemetría DEMO habilitada; existe un dispositivo DEMO.
- La cuenta local es FARMER. No se le concedió ADMIN.

**La API solo escucha en este PC.** Conectar USB no crea un puente HTTP.
`localhost` y `127.0.0.1` dentro del ESP32 se refieren al propio dispositivo,
no al PC. El puerto Angular 4200 no es el receptor IoT y PostgreSQL 5433
no debe exponerse al dispositivo.

Antes de enviar desde una red real hay que acordar expresamente:

1. Si el ESP32 envía directamente o ya tiene servidor intermediario.
2. Dirección y transporte alcanzables, TLS/certificados y entorno autorizado.
3. Restricciones de red/firewall necesarias, sin abrir el router ni exponer
   PostgreSQL, y sin desactivar validación de certificados.
4. Provisión de un dispositivo **REAL**, separado de la DEMO.

Registrar dispositivos exige **ADMIN propietario de la parcela**. ADMIN no tiene
acceso global a parcelas FARMER. No cambiar roles ni asignar IDs directamente
en la base para resolverlo: acordar el flujo de propiedad/provisión primero.
La clave de dispositivo solo se muestra una vez y debe guardarse fuera de Git.
El origen se fija al provisionarlo; cambiar `source` en el JSON no cambia ese canal.

No se aplicaron hoy cambios de red, altas REAL, cuentas administrativas ni
transferencias de propiedad. Estos puntos siguen pendientes de autorización.
No desactivar CORS para intentar arreglar el acceso del ESP32: CORS es una
restricción de navegador, no sustituye autenticación IoT. El acceso web desde
otra máquina también requiere revisar orígenes y cookies por separado.

## 3. Contrato que acepta actualmente la aplicación

Ruta: `POST /api/v1/iot/telemetry`.

Encabezados:

- `Content-Type: application/json`.
- `X-Device-Id`: UUID v4 persistente provisionado, no el serial.
- `X-Device-Key`: credencial privada hexadecimal de 64 caracteres.

No usar el JWT de usuario como credencial IoT ni poner la clave en una URL,
comando compartido, captura, frontend, repositorio o mensaje de chat.
La clave no aparece en el ejemplo ni la necesita el comprobador offline.

Campos del cuerpo:

- `schemaVersion`: `"1.2"`, no la versión `"1.0"` del evento Socket.IO.
- `deviceId`: UUID del dispositivo, coincidente con el autenticado.
- `eventId`: cadena de 1–120 caracteres, única por dispositivo y evento.
- `recordedAt`: ISO8601 con zona horaria fiable, o `null` sin reloj fiable.
  Como máximo 60 segundos de adelanto técnico. Una fecha antigua se conserva
  sin desplazar una lectura actual más nueva.
- `soilMoisture`: las tres claves `soil_1`, `soil_2`, `soil_3`, cada una con
  porcentaje entre 0 y 100 o `null`.
- `temperatureC`: número entre -50 y 100 o `null`.
- `airHumidityPct`: número entre 0 y 100 o `null`.
- `rainDetected`: booleano o `null`, no texto ni precipitación en mm.
- `valve`: `relayCommandedOpen` y `feedbackOpen`, booleanos o `null`.
- `source`: informativo opcional; no sustituye el origen autenticado.

Ambiente, lluvia, reloj y ambas claves de válvula deben estar presentes,
aunque su valor sea `null`. Tampoco omitir una sonda: enviar su clave con null.
No rellenar ausencias con cero ni con la última medición anterior.

Los límites numéricos anteriores son **envolventes técnicas de ingreso**,
no umbrales agronómicos ni prueba de calibración. Un valor ADC bruto no es un
porcentaje por dividirlo entre el máximo del ADC: exigir calibración y unidades.
La aplicación conserva por separado calidad y clasificación por rangos.
Actualmente las magnitudes numéricas sin calibración verificada se presentan
como `uncalibrated`; ver un número en pantalla no valida su precisión.

### Identidad y reintentos

Un reintento del mismo evento conserva **ID, hora y valores exactos**. La API
responde 201 también al duplicado reconocido (`duplicate: true`), sin duplicar
lecturas. El mismo ID con otro contenido devuelve 409. Evitar colisiones tras
reiniciar la placa: confirmar cómo identifica arranque/secuencia el firmware.
No inventar una regla de IDs para un receptor externo sin revisar su contrato.

No regenerar la hora de un mensaje pendiente para simular frescura.
Un mensaje antiguo nuevo puede restablecer contacto, pero no cambia la medición
actual si existe otra más reciente.

### Relé y válvula

`relayCommandedOpen` informa de la orden observada del firmware; no es una orden
de esta aplicación. `feedbackOpen` solo debe tener valor si existe confirmación
física documentada. Sin ella, usar `null`, no copiar el estado del relé.
Un `valveOpen` antiguo o señal de relé activa en bajo necesita aclaración:
no inferir su significado ni invertir estados por suposición.

La frecuencia `expectedIntervalSeconds` debe corresponder a lo que envía el
firmware. El intervalo de 5 segundos del simulador no es una especificación
del hardware ni una regla de riego.

## 4. Qué recoger mañana, antes de cambiar nada

1. Código original `.ino` o proyecto PlatformIO `src/main.cpp`, conservando copia.
2. Modelo de placa/sensores y correspondencia física A/B/C.
3. Un mensaje real saneado y respuesta/código HTTP si ya envía datos.
4. Transporte y receptor actuales; no compartir tokens ni contraseña Wi-Fi.
5. Estado de reloj, unidades, calibración, frecuencia y estrategia de reintentos.
6. Si se observa solo relé o hay confirmación física y/o caudal medido.

Abrir el Monitor serie no garantiza obtener JSON si el firmware no lo imprime.
No pulsar **Subir** ni modificar el programa para conseguirlo sin revisión.
En algunas placas, conectar USB o abrir el puerto serie puede provocar un
reinicio por DTR/RTS: comprobar antes alimentación y estado seguro con la persona
responsable. No hacerlo durante riego activo ni con conexiones eléctricas
desconocidas. Esta guía no autoriza cambiar pines o tensiones.

## 5. Secuencia de aceptación física, todavía pendiente

- Acordar receptor, red segura y provisión REAL autorizada.
- Comprobar credenciales e identidad sin publicarlas.
- Confirmar aceptación/persistencia de una lectura real, su hora y procedencia.
- Ver A/B/C y ambiente por separado en REST y dashboard REAL, sin mezclar DEMO.
- Validar valores y calibración contra una referencia apropiada.
- Probar reintento idéntico, lectura parcial y reconexión de forma supervisada.
- Confirmar que perder la red no vuelve inseguro el riego local, siguiendo las
  protecciones reales del equipo y sin provocar pruebas físicas peligrosas.

Solo después puede declararse integración física probada. Eso no acredita por
sí solo ahorro, caudal, predicción agrícola ni control remoto seguro.

## 6. Diagnóstico de errores

| Resultado              | Revisar                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| No conecta             | Ruta de red, dirección, puerto, escucha loopback, transporte y certificado; no empezar por cambiar la contraseña del usuario |
| 400                    | Contrato, claves obligatorias, tipos, rangos, reloj/zona                                                                     |
| 401                    | UUID/clave IoT, actividad de equipo/propietario, parcela archivada y política DEMO; JWT de usuario no sirve                  |
| 403                    | UUID del cuerpo distinto del autenticado                                                                                     |
| 409                    | ID reutilizado con datos diferentes o inventario incompleto; no reintentar sin diagnóstico                                   |
| 429                    | Respetar el límite; no enviar en bucle inmediato                                                                             |
| Red/5xx                | Mantener el evento exacto y usar reintento acotado/backoff; no inventar mensajes nuevos para el pendiente                    |
| 201 duplicado          | Confirmación del evento original, no una nueva medición                                                                      |
| En línea, dato antiguo | Contacto del equipo no equivale a frescura del reloj ni salud de cada sonda                                                  |

Las pruebas del simulador cubren reintentos, pero no definen automáticamente el
comportamiento del firmware. Si existe un receptor externo, hace falta su
protocolo y muestra auténticos antes de implementar `ExternalTelemetryAdapter`.

## Verificación de esta preparación

El comprobador reutiliza `IngestTelemetryDto`; la regla temporal existente se
extrajo a `backend/src/telemetry/ingestion-timestamp.ts` y se llama desde HTTP y
desde la comprobación offline, sin cambiar el límite ni la semántica.

Resultados recibidos de esta ejecución:

| Verificación                          | Resultado                                |
| ------------------------------------- | ---------------------------------------- |
| Comprobador offline                   | 23 pruebas correctas                     |
| Simulador                             | 10 pruebas correctas                     |
| Backend                               | 362 pruebas, 21 suites correctas         |
| Angular                               | 601 pruebas, 38 archivos correctos       |
| Integración HTTP/PostgreSQL/Socket.IO | 212 pruebas, 10 suites correctas         |
| Edge                                  | 44 recorridos correctos                  |
| Tipos, lint y build backend/frontend  | Correctos                                |
| Formato de archivos afectados y diff  | Correctos                                |
| Salud local                           | live/ready 200 y rutas OpenAPI presentes |

La integración/navegador usaron bases temporales generadas por el ejecutor y
las eliminaron al terminar. Capturas sintéticas locales:
`Temp/opencode/cacaosmart-browser-OyCDXm`.
Persiste la advertencia conocida de consultas concurrentes de `pg`; no se
ocultó ni se actualizó una dependencia para evitarla. El formato global conserva
el pendiente anterior de finales de línea/estilo, distinto de los archivos tocados.

Cobertura revalidada con datos sintéticos:

- `backend/test/telemetry.integration.ts`: lectura parcial, idempotencia,
  conflicto, fuera de orden, identidad, separación de orígenes y rollback.
- `backend/test/realtime.integration.ts`: Socket.IO, reconexión/recuperación
  REST, desconexión por dispositivo/sonda y publicación después de persistir.
- `backend/test/dashboard.integration.ts`: tres tarjetas, null/lectura parcial,
  mensajes atrasados, cortes/reconexión y sesiones, sin control remoto.

No se ejecutó firmware ni se probó seguridad eléctrica, conexión real,
calibración o comportamiento físico del riego. No hubo nuevas dependencias,
migraciones ni datos sintéticos en la base principal. No se acredita hardware
por pasar estas pruebas.
