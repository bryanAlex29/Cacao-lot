# Renovación visual — incremento 5

## Alcance

Continuación autorizada con «Sigue haciendo»: presentación de captura, resultados
e historial IA y coherencia visual de login/registro. Sin conexión a OpenAI ni
cambios en consentimiento, cuotas, retención, permisos o autenticación.

## Cambios y archivos

- `frontend/src/app/features/ai-diagnosis/ai-diagnosis.component.{html,css}`:
  captura con guía, acciones reales de cámara/galería y revisión separada en
  escritorio, apilada en móvil. Estado vacío sin fotografía inventada; etiqueta
  «Aún no enviada», consentimiento y límites visibles al seleccionar.
- Resultado con fotografía privada y bloques de observaciones, causas y próximos
  pasos; incertidumbre y advertencia DEMO explícitas. Ausencia/error de imagen no
  oculta el resultado. Sin cambios en lógica ni peticiones del componente.
- Historial con fechas locales y estados textuales diferenciados, comparación
  seleccionada mediante `aria-pressed`, filtros y paginación conservados.
  Eliminación sigue siendo confirmación en línea, no modal.
- `frontend/src/app/features/login/login.component.{html,css,ts}` y
  `frontend/src/app/features/register/register.component.{html,ts}`:
  tarjeta de acceso coherente, icono local compartido, foco visible y ayuda
  enlazada solo cuando existe su elemento. Login añade explicación de contraseña
  requerida; registro mantiene íntegra su política de contraseña y rol FARMER.
- Login corrige la nota antigua de cierre a 15 minutos: ahora explica la sesión
  renovable de hasta 8 horas y recuperación mediante cookie protegida. La lógica
  de sesión no cambia. Instrucciones de instalación pasan a `details` nativo.
- Pruebas de los tres componentes y `backend/test/dashboard.integration.ts`:
  selección sin envío, consentimiento reiniciado al sustituir foto, avisos y
  resultado sin imagen, ayuda accesible, enlaces de acceso, adaptación de
  320/390/768/1440 px y capturas sintéticas.

No se añadieron dependencias, imágenes externas, datos de ejemplo en producción,
endpoints, esquema ni reglas de negocio. Sin firmware, commit, push o despliegue.

## Verificación

- `npm.cmd run test --workspace=@cacaosmart/frontend`: **530/530**, 33 archivos.
- `npm.cmd run test:browser` con Edge: **41/41**. Conserva los recorridos de
  telemetría, permisos, renovación, clave única, historial IA y reintento idempotente.
- `npm.cmd run build`, `npm.cmd run lint`,
  `npm.cmd run typecheck --workspace=@cacaosmart/frontend`: correctos.
- Prettier de archivos afectados y `git diff --check`: correctos.
- `npm.cmd run smoke`: live/ready 200 y rutas OpenAPI presentes.
  `http://localhost:4200`: HTTP 200.
- Capturas revisadas en
  `C:\Users\Hp\AppData\Local\Temp\opencode\cacaosmart-browser-GDmX3n`:
  `ai-capture-desktop.png`, `ai-result-mobile.png`, `auth-login-1440.png`,
  `auth-registro-390.png`. Las fotos verdes son fixtures sintéticos de prueba,
  no fotografías del cultivo ni resultados agronómicos.
- Base temporal eliminada por el runner; principal sin fixtures nuevos.
- La primera ejecución Angular detectó iteración de `NodeList` incompatible con
  las librerías TS configuradas en pruebas; corregida con `Array.from`, sin
  ampliar `tsconfig`. La ejecución posterior pasó completa.

La suite global backend no se volvió a ejecutar: sigue pendiente el TS2322
ajeno de `backend/src/weather/open-meteo.spec.ts:37`. La advertencia concurrente
de `pg` persiste en el navegador; no impidió aprobar sus pruebas.

## Revisión y límites

Abrir IA desde una parcela; elegir una foto sin enviarla y comprobar vista previa,
avisos y consentimiento. El envío crea una demostración almacenada y cuenta
contra la cuota: **no hace falta enviarla para revisar el diseño**. Login y
registro pueden revisarse sin crear cuentas. No se certifica fidelidad exacta
sin la captura original, ni funcionamiento de cámara en hardware móvil real.

Pendiente revisión del usuario. Próximo incremento sugerido: pulir Clima y la
pantalla de estado del sistema, sin presentar predicciones no implementadas.
Fotografías, referencia original e integración OpenAI continúan pendientes.
