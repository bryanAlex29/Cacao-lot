# Registro público de agricultores

Extensión autorizada por el usuario después de la fase 2. Sustituye únicamente la restricción previa de no permitir registro público; conserva los roles, aislamiento por propietario y administración segura.

## Uso

1. Abrir <http://localhost:4200/login> y pulsar **Crear cuenta de agricultor**, o entrar en <http://localhost:4200/registro>.
2. Completar nombre, correo, contraseña y confirmación. La contraseña debe tener entre 8 y 128 caracteres, al menos una mayúscula y un símbolo. Los espacios y los números no cuentan como símbolo; no es obligatorio incluir dígitos.
3. Pulsar **Crear cuenta**. Tras guardarse, se inicia una sesión en memoria de hasta 15 minutos y se navega a `/parcelas`.

Las parcelas no se asignan ni se inventan al registrarse. Una cuenta nueva verá la lista vacía hasta que exista un flujo autorizado de provisión de sus recursos. No se amplían los permisos de FARMER para resolver esa ausencia.

## API

`POST /api/v1/auth/register` es público y acepta únicamente `name`, `email` y `password`. Devuelve `201` con la misma estructura de sesión que login: `accessToken`, `tokenType`, `expiresIn` y usuario público. `confirmPassword` es una validación de la UI y no se envía al backend.

- Nombre recortado de 1–100 caracteres; correo normalizado a minúsculas, formato válido y máximo 254 caracteres.
- Contraseña de 8–128 caracteres, al menos una mayúscula Unicode y un símbolo o signo de puntuación (por ejemplo `!`, `@`, `#`), guardada con Argon2id. La misma regla aplica al alta administrativa y bootstrap; nunca se devuelve ni registra en logs. No se modifican hashes ni se bloquea el login de cuentas existentes por esta nueva composición.
- Rol `FARMER` fijado en servidor. `role`, `ownerId` y otros campos extra se rechazan con `400`; no hay alta de ADMIN por HTTP.
- Correo duplicado: `409` genérico, sin sobrescribir la cuenta ni devolver hashes. El formulario sugiere iniciar sesión si ya se tiene cuenta. La diferencia de estado permite inferir disponibilidad del correo: no se presenta como protección completa contra enumeración.
- Límite de 3 solicitudes por minuto e IP, incluidas las inválidas/duplicadas; exceso `429`. Almacenamiento de límites en memoria, como el resto de la fase 2.
- Respuestas `Cache-Control: no-store`; no se adjunta un JWT anterior al solicitar un registro.
- El formulario bloquea envíos repetidos, muestra errores y limpia ambas contraseñas después de éxito o error y al destruirse.
- No necesita nuevas dependencias, migraciones ni cambios de firmware. Reutiliza `UsersService`, rol de servidor, índice único de correo y emisión JWT existente.

## Límites

**No hay envío ni verificación de correo, CAPTCHA ni recuperación de contraseña todavía.** Validar el formato del correo no demuestra su propiedad. Tampoco hay concesión automática de parcelas ni acceso global. Antes de exponer la plataforma públicamente deben revisarse verificación de correo, controles contra abuso y los avisos de dependencias ya registrados.

La creación del primer administrador por CLI continúa disponible solo para administración local; no es necesaria para registrarse como agricultor. El registro no modifica una cuenta existente ni la convierte en ADMIN aunque se use el mismo correo.

## Verificación

- Tests DTO: normalización y rechazo de nombre/correo/contraseña inválidos.
- PostgreSQL temporal real: registro sin autenticación, hash Argon2id, rol FARMER, JWT operativo, lista propia vacía, denegación de recursos ajenos y escrituras, rechazo de rol/propietario, duplicado sin sobrescritura y límite de solicitudes.
- Angular: confirmación coincidente, validación previa, payload sin confirmación/rol, sesión automática, rechazo de doble envío y limpieza de claves ante errores `400`, `409`, `429` o fallo de conexión.
- Suite tras actualizar la política de contraseñas: **38 pruebas backend + 27 Angular + 17 de integración PostgreSQL = 82 pruebas correctas**. Incluye aceptación de exactamente 8 caracteres en registro y bootstrap, rechazo de ausencia de mayúscula/símbolo y compatibilidad del login existente.

Las pruebas de integración crean y eliminan solo su base temporal. No se registran cuentas ficticias en la base principal. Las pruebas de componentes usan DOM simulado, no sustituyen una revisión visual en navegador real.

## Key Learnings:

1. El registro público debe fijar el rol en servidor; ocultar un selector de rol en el formulario no basta.
2. Confirmar contraseña en la UI no exige enviarla dos veces al servidor ni guardarla.
3. Crear una cuenta no debe conceder acceso automático a parcelas ajenas ni fingir verificación de correo.
