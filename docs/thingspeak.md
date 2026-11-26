# ThingSpeak: lectura, importación y mapa confirmado

El ESP32 ya envía a ThingSpeak según el usuario. Este incremento prepara un cliente
servidor-servidor, comprobación e importación periódica. No modifica firmware,
riego, claves de otros servicios, roles ni parcelas anteriores. Se preparó el ID
en el `.env` privado; la clave de lectura la introdujo el usuario localmente.
Con autorización explícita se creó una parcela y un dispositivo REAL para la
cuenta indicada y se habilitó la importación. No requiere USB ni abrir puertos del PC.

## Configurar y comprobar

En el `.env` privado existente de la raíz, añadir localmente:

```dotenv
THINGSPEAK_CHANNEL_ID=3554501
THINGSPEAK_READ_API_KEY=
```

En ThingSpeak, abrir el canal → **API Keys** → copiar **Read API Key**.
Pegarla después de `THINGSPEAK_READ_API_KEY=` en el `.env` privado de la raíz
y guardar. No dejar espacios dentro de la clave. No es necesario hacer público el canal.
Para canal privado usar exclusivamente **Read API Key**;
en un canal público puede quedar vacía. No enviar claves por chat, argumentos,
capturas o Git. No usar la Write API Key.

Desde la raíz:

```powershell
npm.cmd run thingspeak:check --workspace=@cacaosmart/backend
```

Realiza un único GET HTTPS a
`https://api.thingspeak.com/channels/{channelId}/feeds.json?results=1`.
La clave privada se incorpora al parámetro `api_key`, nunca se imprime la URL.
Evitar trazas HTTP externas que registren URLs con credenciales.
Timeout de 10 segundos, máximo 256 KiB, sin redirecciones ni reintentos.
Solo muestra ID/fecha de entrada y nombres de campos con contenido, no valores
ni metadatos del canal. Un canal vacío es una conexión válida sin mediciones.
Una entrada antigua no acredita conectividad actual del ESP32.

El proveedor documenta la lectura en:
<https://www.mathworks.com/help/thingspeak/readdata.html>.
La consulta automatizada de esa documentación devolvió HTTP 403 en este entorno;
la compatibilidad con el canal real debe confirmarse mediante el comando anterior.
Respetar los límites y condiciones de la cuenta ThingSpeak; la comprobación
puntual no inicia polling (el worker se activa por separado, como se describe abajo).

## Mapeo confirmado del canal 3554501

El transporte conserva `field1`–`field8` como texto/null. El mapeador separado
`thingspeak.mapping.ts` aplica exclusivamente al canal **3554501**:

| Campo  | Destino                        | Unidad               |
| ------ | ------------------------------ | -------------------- |
| field1 | Temperatura ambiental          | °C                   |
| field2 | Humedad ambiental              | %                    |
| field3 | Humedad del suelo A (`soil_1`) | %                    |
| field4 | Estado informado del relé      | 1 activo / 0 apagado |

El usuario confirmó una única sonda de suelo y su calibración. Se registra
calibración declarada por el usuario, no metadatos técnicos inventados.
B/C, lluvia y confirmación física permanecen null/sin datos.
El usuario confirmó `field4`: únicamente `1` = relé activo y `0` = relé apagado.
Se recortan espacios exteriores; vacío/ausente produce null/missing y cualquier
otro texto produce null/invalid. No se usa conversión por truthiness: `0` es false
válido, no ausencia. Se almacena en el campo interno `relayCommandedOpen` y se
muestra como **Relé activo/apagado** en el dashboard de ThingSpeak, sin inferir
posición de la válvula ni circulación de agua. `feedbackOpen` sigue null.

El mapa ampliado se aplica a **entradas nuevas**: las lecturas anteriores no se
reescriben. Si al reiniciar se vuelve a leer una entrada ya importada con el mapa
anterior y cambia su contenido normalizado, la deduplicación la rechaza sin
sobrescribirla; la siguiente entrada nueva permite continuar normalmente.
26 °C y 62 % son lecturas indicadas por el usuario, no constantes ni umbrales.
Se validan temperatura -50 a 100 °C y humedades 0 a 100 % conforme al ingreso
existente; texto inválido/fuera de rango produce null/calidad invalid, no cero.
0 y 100 % son extremos numéricamente válidos, no diagnóstico de funcionamiento.
La comprobación imprime calidad, no los valores privados.

## Asociación e importación

Se creó **Cacao · ThingSpeak**, dispositivo **thingspeak-3554501**, en la única
cuenta activa coincidente con la indicada por el usuario. No se cambió su rol FARMER.
Ubicación y superficie reales no se conocen: ubicación pendiente explícita y área null.
Las sondas B/C y lluvia quedan deshabilitadas; no representan sensores instalados.
El inventario mantiene seis identidades para compatibilidad, sin inventar lecturas.

La CLI administrativa local requiere el UUID exacto de un propietario existente:

```powershell
npm.cmd run thingspeak:provision --workspace=@cacaosmart/backend -- UUID_DEL_PROPIETARIO
```

Solo desarrollo y canal 3554501. Crea parcela/dispositivo/inventario en transacción
y el vínculo privado `.local/thingspeak.json` sin claves. Si ya existe, comprueba
la asociación y no duplica ni reasigna recursos. No sobrescribir este archivo
para mover un canal a otra cuenta. Provisión administrativa excepcional autorizada,
no ampliación de los permisos HTTP de FARMER.

En `.env`, `THINGSPEAK_IMPORT_ENABLED=true` activa el worker al iniciar la API.
Sin esa variable, no consulta ni importa periódicamente. Reiniciar la API después
de cambiar variables o vínculo. Para detener solo la importación, poner false
y reiniciar. No hay servicio Windows ni ejecución con el PC apagado.

```powershell
# Una consulta e importación explícita, sin abrir puertos ni iniciar timers:
npm.cmd run thingspeak:import-once --workspace=@cacaosmart/backend
```

El vínculo fija una consulta cada **20 segundos** (configurable 20–3600),
intervalo de supervisión provisional, **no frecuencia confirmada del firmware**.
Para nuevos dispositivos se usa también como intervalo inicial de vigilancia; revisar al
confirmar la cadencia real. El dispositivo existente conserva su vigilancia de 60 s:
esta actualización solo cambia las consultas, no la frecuencia del firmware ni
los márgenes de desconexión existentes. Los 20 s se esperan tras terminar la
consulta previa; el tiempo de red/procesamiento se suma al intervalo.
No hay consultas solapadas por worker. Ante fallo:
backoff exponencial hasta 15 minutos, errores sanitizados y ninguna sustitución
por datos demo. Una sola instancia de API evita consultas duplicadas al proveedor.

Se consulta exclusivamente **la última entrada**. No es una descarga histórica:
pueden omitirse entradas si ThingSpeak recibe más rápido o durante una caída.
La recuperación paginada de todo el histórico queda pendiente.

Cada lectura usa el eventId estable `thingspeak:3554501:{entry_id}`.
Se reutiliza la transacción y deduplicación del pipeline existente; cambios de
contenido bajo el mismo entry_id se rechazan, no se sobrescriben. La identidad,
origen REAL, actividad del dispositivo/propietario, propiedad y no archivo se
revalidan también bajo los locks de ingesta. No se transfiere información entre cuentas.
El namespace thingspeak está reservado y rechazado por la ingesta HTTP ordinaria.
No se ofrece una credencial de ingesta directa del dispositivo ni un endpoint público.

Después del commit se publica `telemetry.updated` a las sesiones autorizadas;
no se publican cambios de riego inventados. El dashboard recupera por REST.
Suelo A lleva calidad valid por calibración declarada por el usuario (no validación
técnica independiente); temperatura/humedad ambiental permanecen uncalibrated,
aunque superen la validación numérica.

### Fechas y antigüedad sin migración

- `recordedAt=null`: desconocemos la hora fiable de medición del ESP32.
- `receivedAt`: recepción/importación real en NestJS.
- `effectiveAt` existente: fecha `created_at` de recepción del proveedor.
- `timestampOrigin=server`: no se atribuye al reloj del ESP32.
- Campo opcional aditivo `providerObservedAt` en REST/Socket.IO: fecha del proveedor.
  Se reconstruye desde effectiveAt solo para las lecturas del namespace interno,
  sin columna nueva ni cambio del esquema Prisma.
- `lastSeenAt` conserva la fecha máxima observada en ThingSpeak. Consultar de nuevo
  la misma entrada no lo adelanta ni hace que una lectura antigua parezca reciente.

Dashboard, antigüedad, gráfico, rangos históricos y CSV usan providerObservedAt
antes de recordedAt/receivedAt. Un aviso explica que la fecha procede de ThingSpeak.
No acredita conectividad directa, caudal ni estado físico de válvula.

**Límite temporal de predicción:** la exportación offline JSON de este dispositivo
se bloquea explícitamente hasta extender su formato con procedencia de proveedor.
El formato actual solo conoce recordedAt/receivedAt y sería incorrecto entrenar
con la hora de importación. Historial y reportes CSV sí están disponibles.

Pendientes para ampliar la integración:

- Semántica de lluvia; confirmación física de válvula solo si existe.
- Frecuencia de envío y significado del timestamp de ThingSpeak.
- Estrategia de recuperación histórica/deduplicación y frecuencia de consulta.

La deduplicación por entry_id ya está implementada; la recuperación histórica
y la revisión de frecuencia quedan pendientes. No se confunde la recepción de
ThingSpeak con la hora de medición del ESP32.

## Uso en este PC y transferencia a otro equipo

La conexión local se configura en el `.env` **privado de la raíz**, no en Angular
ni en `.env.example`. El canal `3554501` es público como identificador, pero su
Read API Key es una credencial y no se publica. `.env.example` deja esa clave
vacía y la importación desactivada. Rotar la clave de lectura si se ha compartido
fuera del equipo autorizado; nunca usar la Write API Key en la aplicación.

**Descargar GitHub no descarga PostgreSQL.** El `.env` contiene configuración,
no la parcela ni sus lecturas. No copiar `DATABASE_URL` de otro PC esperando
acceder a su base local: `127.0.0.1` siempre apunta al propio equipo.

### Equipo nuevo con su propia base y cuenta

1. Seguir la instalación local y aplicar las migraciones en su propia base.
2. Crear o utilizar una cuenta autorizada; obtener su UUID exacto sin cambiar roles.
3. Configurar en su `.env` privado `THINGSPEAK_CHANNEL_ID=3554501` y la
   `THINGSPEAK_READ_API_KEY` recibida por un canal privado. Conservar sus propias
   credenciales de PostgreSQL/JWT y no copiar claves OpenAI innecesariamente.
4. Con `THINGSPEAK_IMPORT_ENABLED=false`, ejecutar:

   ```powershell
   npm.cmd run thingspeak:check --workspace=@cacaosmart/backend
   npm.cmd run thingspeak:provision --workspace=@cacaosmart/backend -- UUID_DEL_PROPIETARIO_LOCAL
   npm.cmd run thingspeak:import-once --workspace=@cacaosmart/backend
   ```

5. Poner `THINGSPEAK_IMPORT_ENABLED=true`, reiniciar la API y abrir **Mis parcelas
   → Cacao · ThingSpeak → Abrir panel de monitoreo**, con origen **Real**.

Este camino recrea la asociación para el propietario local y consulta la última
entrada del canal. **No recupera todo el histórico anterior**. Cada equipo tendrá
sus propios UUID y solo verá los recursos de su cuenta; no se habilita acceso
global a todas las personas que descarguen el repositorio.

### Conservar la misma parcela y el histórico

Crear un respaldo con `npm run backup:create` y verificarlo con
`npm run backup:verify -- --directory .local/backups/DIRECTORIO`. Guardar también
el vínculo privado `.local/thingspeak.json` correspondiente a esa base. La copia
de ese vínculo debe acompañar al respaldo de PostgreSQL: un vínculo de una base
distinta no concede acceso ni crea automáticamente sus UUID.

El paquete de PostgreSQL/fotos puede contener cuentas, hashes y fotografías
privadas: compartir solo con personas autorizadas mediante almacenamiento privado
y protegido, **nunca en GitHub**. Las claves se transfieren por separado y solo
las necesarias. No subir `.env`, `.local/`, volcados ni fotografías al repositorio.

`backup:verify` ensaya restauración en una base temporal y la elimina: **no restaura
sobre la base principal del nuevo equipo**. La restauración definitiva requiere
planificar el destino y autorización antes de sobrescribir datos. Después de
restaurar en un destino nuevo, recuperar `.local/thingspeak.json`, comprobar la
cuenta propietaria y configurar su `.env` privado antes de activar el worker.

### Activación local — 26/11/2026

En este equipo se creó la parcela **Cacao · ThingSpeak** para la única cuenta
activa `bryan vera`, sin cambiar su rol ni sus parcelas anteriores. El canal real
respondió con los cuatro campos documentados y permitió importar nuevas entradas.
La provisión repetida comprobó la asociación sin duplicar parcela o dispositivo.
No se modificó firmware ni se enviaron órdenes al relé o a la válvula.

Se verificó un respaldo posterior con 21 tablas y una fotografía en una base
aislada; el vínculo `thingspeak.json` se copió al directorio privado del respaldo
y su huella SHA256 coincide con el original. La importación periódica quedó
activa y se verificó persistencia de entradas nuevas con origen REAL.

Después de incorporar `kike-dev` (`596a5a7`) por avance rápido, pasaron tipos,
lint, build y 1.211 pruebas (529 backend y 682 Angular). El cambio recibido solo
afecta metadatos `peer` del lockfile, sin modificar versiones ni hashes.
La auditoría completa informa 16 avisos moderados en herramientas de desarrollo;
con `--omit=dev` no informa vulnerabilidades. No se aplicó `audit fix --force`
porque propone cambiar Angular CLI de forma incompatible. No se repitieron aquí
las suites de integración ni de navegador real.

## Pruebas sin credenciales

```powershell
npm.cmd run test --workspace=@cacaosmart/backend -- --runTestsByPath src/integrations/thingspeak.client.spec.ts src/integrations/thingspeak.mapping.spec.ts
```

Las pruebas usan respuestas sintéticas y no contactan ThingSpeak ni PostgreSQL.

## Verificación local de esta entrega

- Lint, tipos y build de ambos workspaces correctos.
- 445 pruebas backend y 643 frontend correctas.
- Provisión real autorizada e importación real verificadas; una segunda
  importación devolvió duplicate y no creó una lectura adicional.
- Provisión repetida idempotente: no creó otra parcela/dispositivo. Lectura del
  propietario permitida y lectura de otro UUID denegada por el repositorio.
  Verificados 1713 registros totales tras la primera importación: 1712 previos
  más una lectura del dispositivo nuevo.
- API live/ready y web `/login` respondieron correctamente. Worker activado en
  la sesión local; prueba visual con la sesión del usuario y recepción Socket.IO
  autenticada siguen pendientes de revisión manual.
- Durante la primera importación PostgreSQL rechazó `readings_ingestion_order_key`:
  secuencia en 4 frente a máximo existente 1712. Se adelantó únicamente esa
  secuencia a 1712 bajo lock de la tabla, sin borrar ni editar filas.
  No se determinó en esta tarea cómo se produjo el desfase.
- No se aplicaron migraciones, no se transfirieron parcelas ni se modificó firmware.

### Ampliación field4 · relé

- 465 pruebas backend y 653 frontend correctas; lint, tipos y build correctos.
- Canal privado con field4 presente y válido comprobado. Nuevas entradas guardadas
  con relé activo y feedback físico null; apagado y ausencia/valor inválido
  comprobados por pruebas automatizadas, sin accionar el hardware.
- Panel muestra activo/apagado/desconocido sin botones de control.
- Consulta de 20 s y deduplicación sin cambios; lecturas anteriores intactas.
