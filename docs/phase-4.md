# Fase 4 — Tiempo real y dashboard

## Resultado y uso

Desde **Mis parcelas**, abrir **Panel de monitoreo**. Ruta protegida `/parcelas/:id/dashboard`; seleccionar dispositivo si hay varios. El selector de origen solo aparece en compilación Angular de desarrollo. `real` es el origen predeterminado; demo requiere habilitación explícita del backend y recursos provisionados según [fase 3](phase-3.md). No hay fallback ficticio.

La pantalla conserva sidebar verde oscuro, encabezado, banner, tres zonas A/B/C, ambiente y lluvia, franja de riego/diagnóstico, histórico y bloques de agua, alertas y ODS. El banner utiliza **ilustración SVG local**, no la fotografía de la captura original, que no está disponible como archivo. No se descargan imágenes externas ni se muestra el circuito. IA, alertas, duración y consumo están rotulados como pendientes/no disponibles, sin botones que aparenten funcionar ni cifras inventadas.

Los números se presentan con unidad, fecha y calidad; `null` es «Sin datos», cero y false se conservan. Sin calibración o rangos verificados no se afirma «Normal» ni se usa 35 % del mockup como umbral. Orden del relé y confirmación física continúan separadas. Se distingue conexión del dispositivo, conexión del navegador y antigüedad de la lectura; una recepción reciente de datos antiguos no convierte esos datos en actuales.

## Protocolo Socket.IO

- Mismo servidor HTTP de Nest, `path=/socket.io`, namespace **`/telemetry`**.
- `auth: {token: JWT}` en handshake, nunca token en URL. Se revalida la sesión con el servicio existente. `CORS_ORIGIN` restringe origen de navegador también para WebSocket; clientes sin Origin igualmente necesitan JWT.
- Enviar `subscribe` con `{plotId,deviceId,source}` y callback ACK `{ok:boolean}`. UUID v4 y origen explícito. Una suscripción activa por conexión; cambiarla abandona la anterior, incluso si la nueva es inválida. Máximo 20 suscripciones/minuto y límite básico de conexiones/IP, mensajes hasta 16 KiB. No se aceptan órdenes de válvula.
- Salas `plot:<plotId>:<source>:<deviceId>`. La propiedad se comprueba al unirse **y antes de cada emisión**; ADMIN no tiene bypass. No se hace broadcast ciego a salas que podrían conservar permisos revocados.
- `telemetry.updated`: evento agregado v1.0 de DERCAS §17.8. Publicación **solo después del commit** y para evento único. Un duplicado o rechazo no publica otra lectura.
- `device.status`: `{plotId,deviceId,source,status,lastSeenAt,expectedIntervalSeconds}`. Barrido cada 5 s, emite al cambiar metadata y desconecta sesiones expiradas, propietarios inactivos o recursos ya no autorizados. Antes de cada evento de telemetría la validación es inmediata, no depende del barrido.
- Lecturas parciales comunican calidad por sonda dentro del evento canónico; su presentación individual ya existe. Eventos de riego persistentes y motor de alertas pertenecen a gestión agrícola; no se inventan eventos de flujo físico ni diagnósticos del hardware.

Es un servicio Nest que administra Socket.IO nativo mediante lifecycle sobre HTTP, no handlers atravesados por guards HTTP. Dependencias nuevas: `socket.io`/`socket.io-client` 4.8.4. No se introducen comandos remotos ni cambios Prisma en esta fase.

## Recuperación y ordenación Angular

`TelemetryDataSource` separa UI del origen. `ApiTelemetryDataSource` y `DemoTelemetryDataSource` usan la **misma API autorizada**; la implementación demo no genera arrays ficticios en el navegador. `TelemetryFacade` vive por instancia del dashboard, libera HTTP/socket/timers al salir o cerrar sesión.

1. Obtener snapshot e histórico REST y establecer suscripción.
2. Al confirmar suscripción inicial o reconectar, volver a consultar REST. Los eventos actúan como invalidaciones: REST escoge la última lectura con el desempate de fase 3. Así no se sustituye una lectura nueva por un payload atrasado, ni se pierde la secuencia interna no expuesta por HTTP.
3. Agrupar notificaciones en 100 ms y cancelar solicitudes anteriores al cambiar selección/intervalo; no aplicar respuestas tardías de otra parcela/dispositivo.
4. Reconexión Socket.IO con backoff y jitter, de 1 a 10 s. REST cada 15 s también recupera eventos perdidos. Una desconexión deliberada del servidor por autorización no se reintenta indefinidamente: botón **Reconectar canal**, sujeto nuevamente a permisos. La caducidad/logout limpia pantalla y vuelve al login.
5. `device.status` actualiza solo conexión sin volver a descargar el histórico, ni retroceder `lastSeenAt`.

El histórico usa páginas de **100 lecturas**, filtros 24 h/7 días/30 días y botones de paginación. El gráfico representa **la página indicada**, no un agregado silencioso de todo el rango. Tres colores y trazos, tabla accesible de valores y marcas en hora local del navegador. Ausencias, calidad inválida y saltos mayores a dos intervalos esperados cortan la línea; no se interpolan huecos. No hay líneas de umbral si aún no hay rangos configurados.

## Proxy y arranque

`frontend/proxy.conf.json` mantiene `/api/**` y añade `/socket.io/**` con `ws:true`. **Reiniciar `npm run dev:frontend` si ya estaba iniciado antes de cambiar el proxy**. API: `npm run dev:backend`; UI: `http://localhost:4200/parcelas`. Despliegue futuro necesita proxy inverso compatible con upgrades WebSocket y TLS; no se ha desplegado.

Para ver actividad DEMO, seguir provisión explícita y `npm run simulator` de fase 3; en el dashboard elegir **Datos simulados · DEMO** y su dispositivo. Las pruebas no crean recursos demo en la base principal.

## Archivos principales

- `backend/src/realtime/realtime.service.ts`, `realtime.module.ts`: autenticación, suscripciones, publicación y conexión.
- `backend/src/telemetry/telemetry.service.ts`: publicar después de persistir.
- `frontend/src/app/core/telemetry/`: fuentes intercambiables y fachada reactiva.
- `frontend/src/app/features/dashboard/`: pantalla, tarjetas por sonda, gráfico, panel de diagnóstico pendiente e indicadores condicionados.
- `frontend/src/app/app.routes.ts`, `features/plots/plots.component.html`, `frontend/proxy.conf.json`: acceso y transporte.
- `packages/contracts/src/index.d.ts`: suscripción y estado compartidos.
- `backend/test/realtime.integration.ts`, `dashboard.integration.ts`, tests Angular, `scripts/integration-test.mjs`: verificación aislada.

## Verificación reproducible

```powershell
npm run lint
npm run typecheck
npm test
npm run test:simulator
npm run test:integration
npm run test:browser
npm run build
npm run format:check
npm run smoke
```

`test:integration`: bases temporales separadas para seguridad, ingesta y Socket.IO. Prueba JWT inválido/expirado, origen, permisos por propietario, separación real/demo, publicación posterior al commit, deduplicación, reconexión, estado offline y revocación.

`test:browser`: base temporal propia, Nest/Angular en **puertos efímeros**, Chromium instalado y credenciales sintéticas. Por defecto usa Chrome local en Windows; `BROWSER_EXECUTABLE_PATH` permite indicar un navegador Chromium compatible. Se utiliza `playwright-core` 1.58.2, sin descargar navegadores ni modificar perfiles personales. Prueba login FARMER → DEMO explícita → **simulador Node → API → PostgreSQL → Socket.IO → Angular**, sonda parcial, mensaje antiguo, corte de red y recuperación. Comprueba móvil 390 px sin desbordamiento y guarda capturas sintéticas en la carpeta temporal aprobada `Temp/opencode/cacaosmart-browser-*`, no en el repositorio. El runner elimina solo su base generada y detiene sus procesos; no usa la cuenta o los dispositivos principales.

Los tests Angular comprueban además limpieza de suscripciones, cambio de dispositivo/origen, filtros/paginación, errores sin fallback, antigüedad y discontinuidades. Las capturas de prueba validan estructura a 1440 y 390 px; no equivalen a una auditoría completa de accesibilidad o todos los navegadores.

Resultado de verificación: **164 pruebas correctas** — 64 backend, 43 Angular, 47 integración PostgreSQL/Socket.IO, 5 navegador Chrome real y 5 simulador. Lint, typecheck, build (sin advertencias de presupuesto CSS), formato y validación Prisma correctos; smoke de salud/readiness 200. No se modificó `.env`, no se crearon cuentas o telemetría de prueba en la base principal, y esta fase no añade migraciones. Se separaron paneles estáticos en componentes propios para mantener el presupuesto CSS sin aumentarlo.

## Límites conservados

Socket.IO es entrega best-effort sin outbox durable, clustering ni replay garantizado; REST periódico y reconexión recuperan estado. Los límites básicos no sustituyen protección de infraestructura o pruebas de carga. La auditoría raíz conserva **19 avisos (16 moderados y 3 altos, ninguno crítico)**; no se aplicó actualización forzada. No se acredita integración con ESP32 real, servidor receptor externo, OpenAI ni medición de agua.

Siguiente fase: gestión agrícola — rangos min/max, auditoría, alertas, eventos de riego y reportes, sin alterar firmware ni automatizar apertura remota.
