# Diagnóstico fotográfico con OpenAI

La pantalla `/diagnostico-ia?plotId=...` conserva captura, vista previa, permisos
por propietario, cuota diaria, idempotencia, historial y eliminación privada.
Con `AI_PROVIDER=openai`, el backend usa el SDK oficial y Responses API para enviar
la copia JPEG sanitizada (sin EXIF) y las notas autorizadas. Angular nunca recibe
la clave ni llama directamente a OpenAI. La foto no se envía al seleccionarla:
requiere marcar el consentimiento `openai-v1` y confirmar el análisis.

## Configuración privada

**Revocar cualquier clave compartida en chats o publicada. No reutilizarla.**
Crear otra en el panel de OpenAI, con permisos y presupuesto restringidos.
No pegarla en código, capturas, Git, comandos de terminal ni conversaciones.
Configurar con un editor el `.env` privado de la raíz, leído solo por el backend:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=<clave-nueva-solo-en-el-archivo-privado>
OPENAI_VISION_MODEL=gpt-5.4-mini
AI_MAX_IMAGE_MB=8
AI_DAILY_LIMIT_PER_USER=5
AI_REQUEST_TIMEOUT_MS=30000
IMAGE_RETENTION_DAYS=7
```

El modelo es configurable; el proyecto de OpenAI debe tener acceso, facturación
y saldo. La suscripción de ChatGPT no incluye automáticamente la API.
Antes de activar, crear/verificar respaldo y aplicar `npm run db:migrate`:
`20261126150000_openai_vision_provider` amplía el CHECK de proveedores y vincula
proveedor con consentimiento; no cambia resultados anteriores. Reiniciar el
backend después de editar `.env`, sin iniciar otra copia sobre el mismo puerto.
`mock` y `disabled` siguen disponibles; no hay fallback silencioso a simulación.

## Resultado y límites

### Excepción temporal de cuota para una cuenta

`AI_DAILY_LIMIT_PER_USER=5` sigue siendo el límite diario general. Para eximir
únicamente una cuenta autorizada, configurar su UUID v4 exacto en el `.env`
privado como `AI_UNLIMITED_USER_ID`. No utilizar nombres ni permitir que el
navegador elija la excepción. El endpoint autenticado `/ai-diagnostics/config`
devuelve `dailyLimit: null` solo para esa cuenta; la interfaz indica que no tiene
cuota diaria. Las otras cuentas siguen limitadas. No se cambian roles ni datos.

Para revocar la excepción, dejar `AI_UNLIMITED_USER_ID=` vacío y reiniciar el
backend. Los intentos anteriores siguen contándose en el día UTC; no se borra
historial ni se devuelve cuota. Se conservan JWT, propiedad, consentimiento,
idempotencia, límites de imagen y protección de frecuencia (20 solicitudes por
minuto en la subida). Sin cuota diaria **no significa saldo OpenAI ilimitado**.

### Alcance de las recomendaciones

- Síntomas visibles y posibles causas/enfermedades con motivos e incertidumbre.
- Pasos de observación, cuidados prudentes, agua, nutrición y seguimiento.
- Foto borrosa, planta no evaluable o evidencia insuficiente: no concluyente.
- No confirma enfermedad, estado óptimo, deficiencia nutricional ni eficacia.
- No prescribe químicos, dosis de abono, litros ni frecuencia de riego desde una
  foto. Solicita análisis de suelo/foliar, edad, humedad calibrada, lluvia, área,
  drenaje y eficiencia. La recomendación no acciona válvulas.
- Los registros mock siguen como DEMO, incluso con OpenAI activo. Los de OpenAI
  se identifican como análisis externo orientativo, no como validación de campo.

La salida JSON se solicita con esquema estricto y se valida de nuevo antes de
persistir. Texto del usuario y de la imagen se trata como no confiable; no se
habilitan herramientas ni ejecución de instrucciones. Las limitaciones del
modelo siguen existiendo: revisar sus recomendaciones con un técnico.

Se usa `store:false`, límite de salida de 2200 tokens, timeout con cancelación y
cero reintentos automáticos del SDK. Un reintento de la misma solicitud devuelve
el registro existente; uno fallido no vuelve a llamar a OpenAI. Una nueva
solicitud puede consumir cuota/costo. Cancelar localmente no garantiza evitar
cargos si el proveedor ya procesó la foto. Los fallos no producen resultados
inventados y se elimina la foto local del intento fallido.

Eliminar aquí retira foto/resultado locales; no garantiza eliminación inmediata
en OpenAI. `store:false` no equivale a retención cero: revisar las políticas de
datos y retención de la API del proveedor. No incluir personas ni datos privados
en fotos o notas. Los errores del SDK no se registran ni se devuelven al cliente.

## Verificación

Pruebas automatizadas con transporte HTTP simulado: no usan claves reales ni
consumen tokens. Para una prueba real, configurar una **clave nueva**, abrir una
parcela propia y subir una fotografía de cacao autorizada. Verificar aviso
OpenAI, consentimiento, resultado, historial y eliminación. Esta prueba real
queda pendiente mientras no exista una clave segura y una foto autorizada.

Referencias consultadas: SDK oficial https://github.com/openai/openai-node,
modelo https://developers.openai.com/api/docs/models/gpt-5.4-mini y políticas
https://developers.openai.com/api/docs/guides/your-data.

## Estado local de esta entrega

SDK `openai@7.65.0` instalado. Migración de proveedor/consentimiento aplicada
después de respaldar y verificar por restauración las 21 tablas existentes.
Las 19 tablas de aplicación distintas de sesiones conservaron sus huellas;
`auth_sessions` mantuvo cuatro registros y rotó credenciales durante la sesión
activa del navegador. La migración solo modifica restricciones de `ai_diagnoses`.
No se sobrescribió ni restauró la base principal.

El `.env` privado no se modificó: **continúa `AI_PROVIDER=mock`**. No se utilizó la
clave compartida ni se enviaron imágenes a OpenAI. La activación requiere una
clave nueva configurada de forma privada y reiniciar el backend.

Validación del flujo: 529 pruebas backend, 682 Angular y 237 de integración
aprobadas (1.448 en total), con llamadas OpenAI simuladas. Incluye consentimiento
por proveedor, aislamiento por propietario, idempotencia, fallos y JSON inválido.
Tipos, lint y compilación backend/frontend aprobados. La suite de navegador real
no se repitió para esta entrega; la evaluación agronómica real sigue pendiente.
