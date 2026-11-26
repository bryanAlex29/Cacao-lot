# Operación — preparación previa a OpenAI

## Estado y alcance

Hay herramientas de revisión y plantillas; **no hay despliegue ni tareas permanentes
activadas por esta entrega**. OpenAI permanece desconectado. El perfil de referencia
es un único host con proxy HTTPS, Angular estático y NestJS en loopback, con
PostgreSQL remoto mediante TLS verificado. No es una decisión de hosting.

## Comprobaciones sin modificar configuración

Desde la raíz:

```powershell
npm.cmd run ops:check
npm.cmd run ops:health -- --base-url http://127.0.0.1:3100
npm.cmd run test:operations
```

`ops:check` lee `.env` sin cargarlo en el proceso ni contactar servicios.
Solo imprime identificadores de controles, nunca valores ni mensajes internos.
También acepta `--env .local/production.env --production` para un candidato
privado. No copiar un candidato sobre la configuración de desarrollo.

El candidato exige origen HTTPS, API en loopback, telemetría REAL, IA/clima
desactivados, secreto sin patrones triviales, transporte de base remoto
`sslmode=verify-full`, sin parámetros de conexión desconocidos, almacenamiento
absoluto fuera del release y ausencia de credenciales bootstrap.
Esto no comprueba entropía, certificados, ACL, disco, red ni permisos efectivos.
Siempre devuelve `productionReady: false`: quedan aprobaciones manuales.

`ops:health` consulta exclusivamente live/ready, sin Swagger (desactivado en
producción), sin credenciales y sin seguir redirecciones. Limita tiempo y cuerpo
de respuesta. Sale con código 1 si falla cualquiera de los dos; no equivale a
comprobar login, dispositivo o seguridad completa. HTTP solo se permite en loopback;
el origen remoto debe ser HTTPS explícito. No desactivar TLS para hacerlo pasar.

## Hosting y HTTPS: decisión pendiente

Plantillas no activadas:

- `ops/.env.example`: variables sin secretos.
- `ops/Caddyfile.example`: mismo origen para Angular, `/api/*` y `/socket.io/*`.

Antes de utilizarlas hay que elegir proveedor, sistema operativo, dominio,
presupuesto, almacenamiento persistente y responsable. No abrir puertos de
PostgreSQL, API o desarrollo Angular al público. La API del ejemplo escucha
en `127.0.0.1:3100`; solo el proxy recibe tráfico público autorizado.

La raíz estática apunta **solo** a `frontend/dist/frontend/browser`, jamás al
repositorio, `.local`, imágenes privadas o respaldos. Las imágenes se sirven por
la API autorizada. El límite de cuerpo del proxy no sustituye la validación del
backend. Conservar prefijos API y Socket.IO, cookies y encabezados de autenticación.

Caddy soporta WebSocket y HTTPS automático; requiere DNS, red, certificados y
almacenamiento de certificados disponibles. No se instaló ni ejecutó Caddy y
la plantilla no fue validada con su binario. Tras instalarlo en el host elegido,
validar con `caddy validate --config RUTA_PRIVADA --adapter caddyfile` antes de
activar, sin publicar variables o configuración privada.

**Bloqueo antes de exponer públicamente:** revisar confianza de proxy e IP real
en NestJS/Express y Socket.IO. Hoy no se habilita `trust proxy`; detrás de un proxy
los límites pueden agrupar clientes por IP del proxy. No establecer confianza
global ni aceptar `X-Forwarded-For` arbitrario: acotar a la topología real y probar
suplantación y límites desde dos clientes. Tampoco hay rate limiting distribuido
ni coordinación de workers para múltiples instancias.

Referencias oficiales consultadas:
[SPA y API](https://caddyserver.com/docs/caddyfile/patterns#single-page-apps-spas),
[proxy y WebSocket](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Preparación de un release — no ejecuta despliegue

1. Registrar commit completo y cambios locales; no entregar solo documentación.
2. Comprobar Node/npm compatibles antes de instalar. Usar el lock; no ejecutar
   actualizaciones forzadas de dependencias ni instalar con servidores activos.
3. Ejecutar lint, tipos, pruebas, build y generación/validación Prisma.
4. Preparar secretos fuera de Git y un directorio persistente privado de imágenes,
   independiente del release. Revisar ACL y capacidad de disco.
5. Crear respaldo y comprobar restauración aislada antes de autorizar migraciones.
   Revisar migraciones pendientes; nunca `db push`, `migrate reset` ni restaurar
   la principal automáticamente.
6. Solo tras autorización, aplicar migraciones versionadas e iniciar
   `node --env-file=RUTA_PRIVADA backend/dist/main.js` desde la raíz del release.
   Todas las variables necesarias deben venir del candidato privado; no distribuir
   el `.env` de desarrollo con el release. El servicio debe tener usuario de mínimo
   privilegio, reinicio controlado, parada ordenada y logs privados.
7. Activar proxy únicamente después de verificar certificado, origen y red.
8. Verificar salud HTTPS, rutas Angular al recargar, login/renovación/logout,
   cookie Secure/HttpOnly/Strict, aislamiento de parcelas, reconexión Socket.IO,
   recepción REAL autorizada y rechazo de DEMO. No probar fixtures en la principal.

Si falla el release, detener recepción y conservar evidencia. Volver al binario
anterior solo si es compatible con el esquema actual. No revertir migraciones ni
restaurar datos vivos sin plan y autorización; una copia anterior pierde cambios
posteriores. El ESP32 mantiene control local independiente.

## Respaldos y recuperación

Neon actual, fuera de producción y con autorización de acceso:

```powershell
npm.cmd run backup:neon
npm.cmd run ops:backup -- --directory .local/backups/bundle-FECHA-ID
```

El primer comando crea un respaldo consistente DB+fotos, ensaya restauración en
una base temporal generada y la elimina; no sobrescribe la principal.
Requiere herramientas PostgreSQL compatibles y permisos para crear bases.
Consume recursos del proveedor. Detalles en
[respaldo Neon](neon-backup-and-validation.md).

`ops:backup` **solo lee** el conjunto local: verifica hashes de dump/fotos,
inventario, evidencia previa de restauración y presencia de tablas del esquema
actual. No se conecta a PostgreSQL ni restaura. Un informe previo no es firma
criptográfica ni prueba nueva de recuperación. Cobertura de tablas no comprueba
cambios de columnas, migraciones aplicadas ni frescura de datos; por eso conserva
`currentDataCoverageVerified: false`. Código 1 si falta integridad, evidencia o tablas.

Para una segunda copia usar el comando existente `backup:copy` con destino
absoluto autorizado fuera del proyecto. No se ejecuta automáticamente; conservar
originales y verificar hashes. Un destino en el mismo disco no protege ante pérdida
del equipo. Cifrado, custodia de claves y ACL deben definirse antes de trasladar datos.

**No utilizar `backup:periodic` con Neon**: conserva sus guardas Docker local.
No se instaló tarea Windows ni servicio. Antes de programar hay que acordar
frecuencia, máximo de pérdida tolerable (RPO), tiempo de recuperación (RTO),
destino externo, cifrado, retención, espacio y responsable de revisar fallos.
La restauración aislada debe repetirse después de cambios de esquema y
periódicamente según esa política. No borrar copias automáticamente.

En producción los scripts actuales rechazan operaciones de respaldo con
`NODE_ENV=production`; no falsear la variable para saltar la guarda.
Definir un procedimiento/rol de respaldo de producción específico con autorización
y probarlo aparte. El proveedor puede ofrecer snapshots/PITR: confirmar plan,
retención y ensayo real, no asumirlos incluidos.

## Vigilancia y respuesta

- Salud: revisar live y ready; no reiniciar indefinidamente ante una base caída.
- Vigilar espacio, certificados, errores de ingesta, desconexiones y edad del
  último respaldo/restauración. Sin datos nuevos no declarar sensores en línea.
- No registrar contraseñas, JWT, cookies, claves IoT, cadenas DB ni cuerpos de fotos.
  Acceso y retención de logs requieren configuración del host.
- Notificaciones, frecuencia del monitor y escalamiento aún no están activados;
  asignar responsable y canal antes de prometer vigilancia permanente.
- Incidente: detener cambios, comprobar salud, conservar logs saneados, revisar
  red/certificado/base y último release. Rotar credenciales expuestas mediante
  procedimiento autorizado, no compartirlas por chat.

## Evidencia de este incremento

Verificación del 25/11/2026:

- 30 pruebas operativas correctas: configuración, rutas privadas, secretos,
  redirecciones, respuesta lenta, límite de JSON y evidencia/cobertura de respaldo.
- `lint`, `typecheck`, `build` y formato de las herramientas/esta guía correctos.
- 384 pruebas backend y 614 Angular correctas en esta ejecución.
- `ops:check`: configuración local válida; no declara producción.
- `ops:health`: live y ready correctos sobre la API local en 3100.
- El respaldo anterior de 08:24 UTC fue rechazado correctamente por cobertura:
  faltaba `prediction_model_versions`, aunque su hash e informe fueran válidos.
- Nuevo respaldo
  `.local/backups/bundle-2026-11-25T19-19-39.754Z-e01a0fd4577eea15`:
  **21 tablas, 0 fotografías**, restauración aislada verificada y base temporal
  eliminada, sin restaurar la principal. `ops:backup` confirma integridad,
  evidencia y cobertura de tablas del esquema, sin faltantes.

La copia nueva permanece local; no se actualizó la segunda copia externa ni
se activó programación. No se repitió aquí la matriz de integración/navegador
de la revisión anterior: no cambió código de API/UI. No certifica hosting,
HTTPS público, OpenAI ni hardware conectado.
