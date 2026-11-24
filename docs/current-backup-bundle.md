# Respaldo local actual de PostgreSQL y fotografías

## Alcance

`backup:create` crea un conjunto privado con una copia custom de PostgreSQL y las fotografías referenciadas por los diagnósticos. `backup:verify` ensaya la recuperación de ese conjunto en una base y una carpeta temporales, **sin sobrescribir la base ni las imágenes actuales**. No requiere el ESP32, OpenAI ni clima externo.

```powershell
npm run backup:create
npm run backup:verify -- --directory .local/backups/DIRECTORIO_QUE_INFORMO_EL_CREADOR
```

Requiere la configuración local existente de `.env`, cliente Prisma generado y el contenedor PostgreSQL de Compose disponible. Solo admite entorno no productivo y configuración local coincidente con Compose. No instala dependencias ni cambia configuración. No acepta destino arbitrario de base o de archivos.

## Consistencia y privacidad

- El creador usa una transacción `RepeatableRead` y `pg_export_snapshot()`. Los conteos, huellas, referencias de imágenes y `pg_dump --snapshot` corresponden a la **misma instantánea**. El dump apunta explícitamente a esa base.
- Incluye todas las tablas públicas, también `_prisma_migrations`. Los archivos privados no se guardan dentro de PostgreSQL.
- Copia exclusivamente los nombres UUID `.jpg` referenciados por `ai_diagnoses`, no fotografías huérfanas ni todo el disco. No copia `.env`, claves IoT ni archivos de simulador. El dump sí contiene información privada de aplicación, incluidos hashes de contraseña y registros de sesión: tratar todo el conjunto como secreto.
- `IMAGE_STORAGE_PATH` absoluto se respeta; si es relativo se resuelve desde `backend`, igual que al arrancar la API mediante el workspace. Sin esa variable, usa `.local/ai-images` de la raíz.
- Las imágenes actuales se escriben con identificadores nuevos sin sobrescribir. Si hay un análisis pendiente, falta una fotografía, falla la copia o el dump, no se publica el manifiesto final `before.json`. Un conjunto sin ese archivo está **incompleto y no debe usarse**. No se borran automáticamente sus restos privados; revisar el directorio antes de decidir su eliminación.
- Si una limpieza de imágenes concurre con el respaldo, este puede fallar porque falta una foto. No silenciar el error: reintentar en un momento sin actividad. Si la foto ya se copió antes de eliminarse del almacén vivo, la copia sigue perteneciendo correctamente a la instantánea respaldada.
- Guarda hashes SHA-256 y tamaños de cada imagen, SHA-256 del dump y conteos/huellas de tablas. El manifiesto versión 2 es la marca de finalización, escrita al terminar la transacción.
- Los conjuntos quedan bajo `.local/backups`, excluidos de Git. Permisos restrictivos donde el sistema los soporte; **en Windows hay que proteger también las ACL de la carpeta**. No hay cifrado incorporado, firma del manifiesto ni protección contra quien pueda modificar simultáneamente archivo y manifiesto.

## Ensayo de recuperación

El verificador mantiene compatibilidad con el respaldo antiguo sin imágenes. Para versión 2 además compara el inventario con las referencias de la base restaurada, copia las fotografías a una carpeta aislada, verifica bytes y SHA-256 y elimina esa carpeta. La base temporal también se elimina si falla la comparación. El informe privado se escribe solo tras completar la comprobación y la limpieza.

La recuperación definitiva sobre un entorno de uso **no se ejecuta** con estos comandos: requiere un procedimiento y autorización propios. Tampoco se suministra un restaurador remoto ni se debe ejecutar un dump de origen desconocido.

## Evidencia del 24/11/2026

- **8 pruebas unitarias**: entorno/destino/rutas/manifiesto/tablas; inventario de imágenes; copia aislada, foto ausente, corrupción y limpieza; no sobrescritura y escape mediante junction.
- **1 prueba integral real** con una base desechable de dos tablas y un JPEG sintético válido: crea el conjunto, lo restaura, verifica la foto, altera únicamente la copia sintética para comprobar rechazo y confirma limpieza de destinos temporales. Nunca inserta esas fixtures en la principal.
- Creado y restaurado el conjunto actual privado `bundle-2026-11-24T19-25-00.904Z-6e4f31fa96d01a38`: **20 tablas coincidentes (19 de aplicación y la de migraciones), 0 fotografías referenciadas** en ese momento. No se inventaron diagnósticos para rellenarlo. El caso con fotografía se acredita por la prueba integral aislada, no por ese respaldo vacío de fotos.
- Repetido el ensayo antiguo: las 14 tablas siguen coincidiendo con su manifiesto.
- Tipos, lint, build, formato de archivos afectados y diff correctos; salud API live/ready y web local responden 200. Confirmada la exclusión Git del conjunto y la ausencia de bases/carpetas temporales de restauración al terminar. No se volvió a ejecutar la suite global de 1.062 pruebas: aquí la evidencia nueva son las 8 unitarias, la integral aislada y los ensayos indicados.

Las pruebas integrales se ejecutan explícitamente:

```powershell
npm run test:backup
npm run test:backup:integration
```

## Pendientes operativos

Este incremento crea y ensaya conjuntos locales **a demanda**. Sigue pendiente acordar frecuencia, retención, cifrado, copia externa privada y protección de credenciales; programar tareas solo después de definirlos. Las copias conservan fotos eliminadas posteriormente hasta retirar el respaldo: la política debe contemplar esa retención. Falta probar recuperación operativa en el hosting elegido y con un volumen representativo; la transacción tiene límite de tres minutos y el dump de dos minutos, no es una solución dimensionada para producción.
