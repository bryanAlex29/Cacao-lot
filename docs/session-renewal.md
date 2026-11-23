# Corrección — la sesión se cerraba a los 15 minutos

El usuario confirmó que el cierre ocurría después de unos minutos sin recargar. La causa era el vencimiento de JWT a los 900 segundos y un temporizador Angular que hacía logout sin renovación. No se amplió la vida del JWT ni se guardó la contraseña para volver a iniciar sesión.

## Comportamiento vigente

- JWT de **hasta 15 minutos**, solo en memoria. Angular lo renueva normalmente un minuto antes de vencer. Tras una suspensión del navegador, una solicitud protegida espera una renovación compartida si el JWT ya venció; nunca envía ese JWT como válido.
- Cookie opaca `cacaosmart_session`, **HttpOnly**, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` en producción y vencimiento absoluto de **8 horas desde el login**. Renovar no desplaza ese límite. La cookie permite recuperar la sesión al recargar, sin almacenar JWT ni secretos en localStorage/sessionStorage.
- Login/registro crean `AuthSession`; PostgreSQL conserva solo hashes SHA-256 de secretos aleatorios de 256 bits. La respuesta JSON continúa siendo `LoginResponse`, sin secreto de renovación ni metadatos privados.
- Cada renovación valida la cuenta activa, obtiene el rol actual y rota el secreto bajo bloqueo de fila. Un token de renovación anterior tiene cinco segundos de gracia para solicitudes simultáneas entre pestañas; en ese caso no sobrescribe la cookie. Fuera de esa ventana se rechaza. No se afirma detección completa de robo/reuso ni administración avanzada de sesiones.
- JWT nuevos llevan `sid`; API y Socket.IO comprueban sesión no revocada/no vencida, usuario activo, rol y propiedad. Los JWT antiguos sin `sid` conservan únicamente su validez original máxima de 15 minutos, sin facultad de renovar por sí solos. Para activar la corrección, iniciar sesión una vez después de actualizar.
- Al renovar, Angular reconecta Socket.IO con el JWT nuevo y recupera REST. Así no se interrumpe el canal cuando vence el token original. El cierre explícito revoca esta sesión en el servidor y limpia la cookie; no cierra otras sesiones de otros navegadores.

## Endpoints y protección

Con el frontend y API bajo el mismo origen mediante proxy:

- `POST /api/v1/auth/refresh`: cookie, cuerpo `{}`, `Origin` igual al `CORS_ORIGIN` configurado y header `X-CacaoSmart-Session: 1`. Devuelve JWT/usuario actuales; no acepta un Bearer como sustituto de la cookie. Límite 30 solicitudes/minuto e IP.
- `POST /api/v1/auth/logout`: mismo origen/header/cuerpo; revoca por prueba de posesión de cookie y devuelve 204 limpiándola. Idempotente sin cookie válida.
- Login/registro rechazan un Origin ajeno si está presente; los clientes servidor-servidor sin Origin conservan su uso anterior. Ninguna ruta nueva acepta propietario o rol del cliente.

`refresh` y `logout` no usan el guard de JWT porque deben funcionar cuando ese token ya venció; **sí autentican la cookie y verifican origen/header**. Swagger documenta cookie y header. Su prueba interactiva desde un origen de Swagger distinto del frontend puede ser rechazada: no ampliar CORS/orígenes para evitarlo. En producción exige HTTPS y un proxy del mismo origen; no se ha desplegado.

Fallos temporales de red/5xx se reintentan con espera, sin marcar JWT vencidos como válidos. Una cookie rechazada, cuenta desactivada, revocación o límite absoluto requiere login. Salir sin conexión no puede garantizar revocación en el servidor: se limpia la memoria y se conserva solo una marca no secreta de salida en sessionStorage para impedir restauración automática en esa pestaña; volver a iniciar sesión la elimina. No se almacenan tokens allí. Cerrar el navegador no sustituye pulsar **Salir**, porque la cookie puede durar hasta ocho horas. Compartir equipo exige cerrar sesión explícitamente.

No hay todavía listado administrativo de sesiones, revocación global de todos los dispositivos, recuperación de contraseña, verificación de correo ni política automatizada de limpieza/retención de filas vencidas. Deben definirse antes de producción. La cookie es inaccesible desde JavaScript, pero no sustituye prevenir XSS.

## Migración y prueba manual

1. Cliente Prisma regenerado; migración aditiva `20261123020000_auth_sessions` probada en bases temporales y aplicada a la principal local con `migrate deploy`, sin reset.
2. Comparación antes/después: conteos y huellas de las **13 tablas de negocio anteriores idénticos**, `.env` intacto. No se crearon cuentas o lecturas de prueba en la principal ni se modificaron roles, parcelas, rangos o hardware.
3. Abrir **http://localhost:4200/login** e iniciar sesión una vez. Las sesiones antiguas no tenían cookie de renovación.
4. Mantener el panel abierto más de 15 minutos: debe conservar acceso y recuperar el canal en vivo tras renovar. Recargar también recupera la sesión válida, pero puede volver a los selectores predeterminados: no se implementó persistencia de esos filtros.
5. Pulsar **Salir**; después recargar. Debe permanecer en login. Tras ocho horas absolutas se exige autenticarse nuevamente.

## Archivos y validación

- `backend/prisma/schema.prisma` y migración: `AuthSession`, hashes, expiración, revocación e índices.
- `backend/src/auth/browser-session.service.ts`, `auth.service.ts`, `auth.controller.ts`, `auth.module.ts`: cookie, rotación, revocación, JWT vinculado y endpoints.
- `backend/src/configure-app.ts`: OpenAPI de cookie.
- `frontend/src/app/core/auth/`: renovación compartida, reintentos, cancelación de respuestas anteriores, guard/interceptor y salida explícita.
- `frontend/src/app/app.config.ts`: restauración autenticada antes de la navegación inicial.
- `frontend/src/app/core/telemetry/api-telemetry-data-source.ts`: reautenticación del socket al cambiar JWT.
- Tests de cookie de producción, integración de sesiones y navegador con reloj controlado.

Resultados: **779 pruebas correctas: 209 backend, 379 Angular, 151 integración PostgreSQL/Socket.IO, 30 navegador Edge y 10 simulador**. El navegador avanza un reloj de prueba más allá de 15 minutos: verifica renovación, reconexión Socket.IO, recarga y logout, no una espera real de ocho horas. El vencimiento absoluto se prueba con evidencia temporal en base aislada. Las bases temporales se eliminaron. Tipos, lint, Prisma y build correctos. El primer navegador falló solo por un selector de prueba que omitía la flecha del enlace; corregido y suite completa 30/30. Ajustes iniciales de tipado Express/Swagger se resolvieron sin instalar dependencias. Persiste el aviso previo de consultas concurrentes de `pg`.

Chequeos finales: formato global y diff correctos; API local liveness/readiness 200, OpenAPI incluye refresh/logout y renovación sin cookie responde 401, no 500. Frontend localhost:4200 responde 200. Migración aplicada y servicios locales operativos; no quedan pruebas en segundo plano pendientes. Sin cambios de firmware, simulador, roles ni publicación Git.
