# Fase 6.1 — Fotografías privadas y diagnóstico simulado

## Alcance

Primer incremento de IA autorizado tras la revisión del usuario de 5.15–5.16. No implementa todo el módulo de DERCAS ni conecta OpenAI.

- Ruta protegida `/diagnostico-ia?plotId=<UUID>`, enlazada desde Mis parcelas y menú/tarjeta del dashboard. ADMIN/FARMER solo acceden a sus parcelas activas. No requiere sensores.
- Cámara con `capture=environment`, según navegador/dispositivo, y alternativa de subida. Vista previa local, sustitución/retirada sin envío.
- Consentimiento explícito `demo-v1`, notas opcionales de hasta 1000 caracteres y máximo de días aceptado antes del POST.
- `VisionAnalysisProvider` intercambiable, solo `mock` implementado: siempre **no concluyente**, parte desconocida, sin causas/enfermedades ni porcentajes inventados. No interpreta síntomas biológicos ni controla válvulas.
- Resultado e historial paginado por parcela; fecha local, estado pendiente/completado/fallido, DEMO e incertidumbre. Eliminación confirmada, sin devolución de cuota.
- Fotos recuperadas por HttpClient/JWT y Blob, no URL pública ni token en query. Revocación de URLs temporales al cambiar selección/parcela, salir o destruir la página.

## Privacidad y límites

Se añadió **sharp 0.35.5** para decodificar contenido, sin confiar en extensión/MIME, limitar a 25 megapíxeles y rechazar animaciones/multipágina. Acepta JPEG/PNG/WebP estático de hasta 8 MiB por defecto; guarda JPEG recodificado de hasta 2048×2048, calidad 85, sin EXIF/GPS/XMP. El nombre original no se guarda ni se usa como ruta.

Almacenamiento privado `.local/ai-images`, ignorado por Git, con nombres UUID y sin servidor estático. PostgreSQL contiene referencias/metadatos, no binarios. La API no expone ruta, clave de archivo o hash del payload. Imágenes con `Cache-Control: no-store` y `nosniff`. La privacidad local depende también de los permisos del sistema operativo; no se añade cifrado de disco o infraestructura de producción.

Retención predeterminada **7 días**, configurable 1–30. El servidor usa el menor entre su configuración y el máximo aceptado por el usuario: un cambio de configuración nunca amplía lo consentido.

Eliminar bloquea inmediatamente el acceso y retira notas/resultado; intenta borrar el archivo y reintenta eliminados cada minuto mientras el backend esté activo. Conserva tombstone privado de solicitud hasta su vencimiento para cuota/idempotencia. Vencidos inaccesibles inmediatamente y purgados en lotes de 100 al iniciar/cada minuto. Con backend apagado no hay limpieza física. No hay todavía política de backups privados ni límite global de disco.

## Cuota y errores

- **5 intentos reservados por usuario/día UTC** por defecto, incluidos fallidos/eliminados; alta HTTP limitada a 20 solicitudes/minuto/IP, además del límite global.
- Reserva transaccional con bloqueo por usuario y unicidad `(user_id, request_id)`: concurrencia no excede cuota ni duplica análisis.
- Respuesta perdida: formulario conserva archivo/notas/clave en memoria. **Reintentar misma solicitud** reutiliza la clave; historial/estado no vuelven a subir fotos.
- Otra carga con la misma clave devuelve 409; eliminados/vencidos no reutilizan claves. No hay reintentos automáticos del proveedor.
- Salida validada antes de persistir, campos ajenos descartados. Fallo/timeout/salida inválida producen `failed`, sin inventar resultados ni propagar detalles internos.
- Timeout predeterminado 10 s, máximo 30 s. Pendientes interrumpidos de más de cinco minutos se marcan fallidos en el siguiente barrido; no se eliminan mientras siguen pendientes para evitar carreras de escritura.
- El mock no usa red ni genera cargos. No se acepta proveedor/origen/rol/propietario desde cliente.

## API y configuración

Todas las rutas bajo `/api/v1/ai-diagnostics` requieren JWT:

| Método | Sufijo                    | Uso                                                                                           |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/config`                 | Proveedor, límites, retención y consentimiento                                                |
| POST   | vacío                     | Multipart `image`, `plotId`, `requestId`, `consentVersion=demo-v1`, `retentionDays`, `notes?` |
| GET    | `?plotId=&limit=&offset=` | Historial propio sin eliminados/vencidos                                                      |
| GET    | `/:id`                    | Estado/resultado propio                                                                       |
| GET    | `/:id/image`              | JPEG privado autorizado                                                                       |
| DELETE | `/:id`                    | Elimina, responde 204                                                                         |

Registro público: ID, parcela, requestId, estado, `source=demo`, `provider=mock`, notas, resultado, error seguro, fechas y `hasImage`. Textos renderizados como texto Angular, nunca HTML/comandos.

Variables documentadas en `.env.example`: `AI_PROVIDER` (mock en desarrollo/test, disabled en producción), `AI_MAX_IMAGE_MB=8` (1–8), `AI_DAILY_LIMIT_PER_USER=5` (1–100), `AI_REQUEST_TIMEOUT_MS=10000` (1–30000), `IMAGE_RETENTION_DAYS=7` (1–30), `IMAGE_STORAGE_PATH` opcional (directorio privado). El mock se rechaza en producción y OpenAI no es un valor permitido. No se modifica `.env` local ni se necesitan claves externas.

Para otra copia: `npx --yes npm@11.6.2 ci`, `npm run db:generate`, PostgreSQL iniciado y `npm run db:migrate`. Nunca reset/db push. Reiniciar API/Angular.

Migración aditiva `20261124010000_ai_diagnoses`: una tabla, claves foráneas/índices/restricciones. **Aplicada localmente tras validación aislada**; conteos/huellas de las 14 tablas anteriores idénticos antes/después, `.env` idéntico y cero diagnósticos de prueba en la principal.

## Archivos y pruebas

- `backend/src/ai-diagnostics/`: DTO/controller, servicio, repositorio, almacenamiento, proveedor y pruebas.
- Prisma schema/migración, `app.module.ts`, exportación de `PlotsService`, entorno y pruebas.
- `frontend/src/app/core/ai-diagnosis/`, `features/ai-diagnosis/`, rutas y enlaces desde parcelas/dashboard; resto del monitoreo conservado.
- `backend/test/ai-diagnosis.integration.ts` y regresión Edge en `dashboard.integration.ts`.
- `backend/package.json` y lockfile: sharp y binarios opcionales multiplataforma. Instalación con npm 11.6.2 sin cambiar npm global.

**900 pruebas correctas:** 459 Angular, 233 backend, 163 integración PostgreSQL/Socket.IO, 35 Edge y 10 simulador; build/tipos/lint/Prisma correctos. Pruebas en bases y directorios temporales, imágenes sintéticas, nunca fotos del usuario. Captura Edge móvil 390 px revisada, sin desbordamiento. Cámara física requiere prueba manual; automatización acredita selección/subida.

Auditoría: 3 avisos altos en cadena existente `prisma → @prisma/config → effect`; no se ejecutó `audit fix --force` ni downgrade. Persisten aviso previo de consultas concurrentes de `pg` y finales CRLF anteriores. No declarar listo para producción.

## Revisión manual

1. Abrir http://localhost:4200/parcelas → **Diagnóstico IA · DEMO** en una parcela propia, incluso sin sensores.
2. Elegir foto autorizada: solo debe aparecer vista previa. Sin consentimiento no se permite enviar.
3. Leer límites/retención, consentir y pulsar **Confirmar análisis simulado**.
4. Resultado **DEMO, no concluyente**, sin nombres de enfermedades ni precisión inventados.
5. Actualizar/recargar y abrirlo desde historial. Quitar foto antes de enviar no crea registros.
6. Probar Cancelar eliminación; eliminar solo un diagnóstico de prueba, que debe desaparecer y no recuperarse.

Pendientes: revisión del usuario; filtros adicionales por fecha/estado y comparación de dos fotos (RF-19/20); proveedor OpenAI real con presupuesto, credenciales backend, consentimiento externo nuevo, contrato/modelo vigente, cancelación y evaluación; operación/backups/almacenamiento de producción. El esquema actual restringe proveedor a mock: no basta cambiar una variable para conectar OpenAI.

Rama `feature/agricultural-management`, conservando trabajo de gestión; sin commit/push ni despliegue.
