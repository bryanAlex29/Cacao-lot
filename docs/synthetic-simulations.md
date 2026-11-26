# Simulaciones reproducibles sin hardware ni OpenAI

## Propósito y límites

Datos ficticios generados por código, no obtenidos de sensores ni de OpenAI.
Permiten repetir exactamente una entrada y comprobar el resultado esperado.
No validan el cultivo, calibración, exactitud de predicción, litros, ahorro
ni seguridad eléctrica o física del riego.

No se añaden datos a la cuenta principal. Las pruebas HTTP/DB utilizan cuentas
y dispositivos DEMO en bases temporales `cacaosmart_test_*`; no usar el JSON
de ejemplo en un canal REAL ni cambiar sus etiquetas para simular mediciones.
El intento deliberado de suplantar `source` forma parte de una prueba aislada:
se exige que el servidor conserve el origen DEMO autenticado.

## Vista previa offline

```powershell
npm.cmd run simulation:preview
npm.cmd run test:simulation-scenarios
```

La vista previa imprime JSON con UUID ficticio, fecha fija y resultados HTTP
esperados. No lee `.env`, credenciales o base, no envía peticiones y no escribe
archivos. Sus fechas son estáticas: no enviarlas a un dispositivo vivo.
Rechaza argumentos y ejecución con `NODE_ENV=production`.

El generador `scripts/simulation-scenarios.mjs` permite inyectar identidad y fecha
desde las pruebas aisladas. Nunca genera credenciales ni controla una válvula.
`feedbackOpen` permanece `null`; la orden de relé es solo una observación ficticia.

## Escenarios

| Paso                         | Resultado esperado                                      |
| ---------------------------- | ------------------------------------------------------- |
| Humedad normal               | Tres valores independientes, persistencia DEMO          |
| Humedad baja en A            | 15 % ficticio; otras sondas conservan sus valores       |
| Humedad alta en B            | 85 % ficticio; sin combinar porcentajes                 |
| Sonda B ausente              | B `null/missing`, A cero válido, C presente             |
| Recuperación B               | Vuelve el dato de B sin arrastrar el anterior           |
| Observación de relé          | Orden ficticia, sin confirmación física                 |
| Lluvia                       | Booleano, no precipitación en mm                        |
| Duplicado exacto             | 201 con `duplicate: true`, sin otra escritura           |
| Mismo ID, distinto contenido | 409 sin nueva escritura                                 |
| Mensaje atrasado             | Se guarda en histórico sin reemplazar la última lectura |
| Humedad fuera de 0–100       | 400 sin escritura                                       |
| Reloj futuro                 | 400 sin escritura                                       |
| Suplantación de origen       | Se conserva DEMO, no se crean registros REAL            |

El rango 30–70 % es **hipotético, no agronómicamente validado**. No se configura
automáticamente ni en sensores ni firmware. Bajo/alto de esta tabla describen
los números ficticios; las clasificaciones y alertas reales requieren rangos
explícitos y calidad apropiada. No se afirma que una lectura aislada active alerta.

## Pruebas de sistema

`backend/test/simulation-scenarios.integration.ts` consume el mismo generador,
envía los 13 pasos por HTTP y comprueba códigos, duplicados, conteos, tres filas
de suelo por lectura, calidad, selección de última lectura y origen persistido.
Se esperan nueve lecturas únicas y 27 filas de sondas en su base temporal.

Las pruebas existentes complementarias no se sustituyen:

- `telemetry.integration.ts`: autenticación, rollback, inventario, consultas,
  duplicados, CSV y lecturas parciales.
- `realtime.integration.ts`: publicación postcommit, aislamiento de salas,
  desconexión/recuperación, frescura por sonda y eventos de riego observado.
- `dashboard.integration.ts`: simulador → API → DB → Socket.IO → Angular,
  tres tarjetas, null/cero, mensajes atrasados, pérdida de red, recuperación
  REST, fechas, móvil, permisos y origen DEMO explícito.
- `scripts/simulator.test.mjs`: transporte caído/reintentos, payload idéntico y
  backoff; no enviar mensajes nuevos para sustituir un reintento pendiente.

En un entorno PostgreSQL **local ya preparado**, el runner existente
`npm.cmd run test:integration` incluye automáticamente la suite nueva; la matriz
de navegador utiliza `npm.cmd run test:browser`. No cambiar `.env` ni relajar
sus guardas para usarlos si actualmente apunta a Neon.
Esta entrega usa PostgreSQL temporal con binarios ya instalados, conexión pasada
por entorno solo al proceso de pruebas y Edge instalado, sin tocar la principal.

## Estado de verificación

- Tres pruebas del generador/contrato correctas; vista previa CLI y rechazo de
  argumentos/producción comprobados.
- Prueba nueva HTTP/DB correcta: 13 pasos, nueve lecturas únicas, 27 filas de
  sondas y ningún registro REAL.
- 29 pruebas de telemetría correctas; 10 del transporte del simulador correctas.
- 384 pruebas backend, 614 Angular, tipos, lint y build correctos.
- Tiempo real: 22 pruebas correctas, incluidos desconexión, recuperación REST,
  aislamiento y publicación después de persistir.
- Navegador Edge: 46 recorridos correctos con datos sintéticos, incluidos
  reconexión, móvil, alertas, rangos y referencias experimentales.
- Las cuatro bases temporales se eliminaron y el clúster de prueba se detuvo.
  Capturas sintéticas: `Temp/opencode/cacaosmart-browser-ufq3Ao`.
- Persiste la advertencia conocida de consultas concurrentes de `pg`, sin
  fallos de esta batería; no se ocultó ni se cambiaron dependencias.

Una suite aprobada acredita únicamente los casos comprobados, no todo escenario
de campo posible. No se cambiaron código productivo, reglas de riego, credenciales,
orígenes ni configuración privada; no se inició simulador contra la cuenta principal.
