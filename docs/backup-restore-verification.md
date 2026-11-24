# Verificación de restauración del respaldo local

**Ampliación posterior:** ya existe creación y ensayo de conjuntos actuales de base + imágenes mediante `backup:create` y el mismo `backup:verify`. Ver [respaldo conjunto, evidencia y límites](current-backup-bundle.md). El ensayo de 14 tablas descrito a continuación sigue siendo evidencia del archivo antiguo, no del conjunto actual.

## Resultado del 24 de noviembre de 2026

Se restauró realmente el respaldo creado antes de las migraciones IA/clima en una **base temporal nueva**, no en la principal. Las **14 tablas de ese respaldo** coinciden con sus conteos y huellas guardados; el SHA-256 del archivo coincide antes/después. La base temporal se eliminó al finalizar.

Esto amplía la comprobación inicial de `pg_restore --list`: ahora hay evidencia de una restauración real de ese archivo. **No** significa que se haya restaurado producción, que exista recuperación automatizada ni que el respaldo anterior cubra las cinco tablas IA/clima y las fotos creadas posteriormente. Las imágenes privadas requieren un respaldo separado y coherente con sus registros.

## Comandos

Con Docker/PostgreSQL locales y dependencias ya instaladas, desde la raíz:

```powershell
npm run test:backup
npm run backup:verify -- --directory .local/backups/DIRECTORIO_DEL_RESPALDO
```

El directorio debe contener el archivo custom `database.dump` y `before.json` generado al respaldar, con `dumpHash` SHA-256 y `data` por tabla (`count` y `fingerprint`). El comando **verifica un respaldo existente**; no crea uno ni permite seleccionar una base de destino.

## Protecciones implementadas

- Solo entorno no productivo, URL PostgreSQL local y base/usuario/puerto coincidentes con la configuración de Compose. Parámetros de URL limitados a `schema` y `connect_timeout` de 1–120 segundos; no se admite redirección de host mediante parámetros.
- Rutas reales dentro de `.local/backups`, rechazando escapes/junctions hacia fuera. El archivo debe estar excluido de Git.
- Integridad SHA-256 validada **antes** de crear una base. Cálculo por streaming para no cargar todo el respaldo en memoria.
- Nombre de destino aleatorio generado internamente: `cacaosmart_restore_` más 16 caracteres hexadecimales. Se valida antes de crear o eliminar y no puede ser la base fuente.
- `pg_restore` sin `--create`, sin destino aportado por el usuario, sin mostrar contraseñas ni contenido de filas. Solo se usan las credenciales locales existentes; no se edita `.env`.
- Comparación exacta del conjunto de tablas, conteos y huellas del archivo; no se compara contra datos vivos que puedan haber cambiado legítimamente después del respaldo.
- Desconexión y eliminación del destino temporal dentro de `finally`, también si falla la restauración o comparación. Si falla la limpieza, la ejecución termina con error y no informa éxito.
- Informe fechado `restore-check-*.json` en el mismo directorio privado. No se exportan filas ni se agrega el respaldo a Git.

Se necesita permiso local para crear/eliminar bases y acceso a Docker. El comando ejecuta el `pg_restore` instalado en el contenedor PostgreSQL del proyecto. No es un restaurador remoto, un mecanismo de recuperación en producción ni una herramienta para ejecutar respaldos de origen desconocido.

## Archivos y validación

- `scripts/verify-backup.mjs`: verificación de integridad, restauración temporal, comparación y limpieza.
- `scripts/backup-restore-core.mjs`: guardas de entorno/rutas/nombres/manifiesto y comparación.
- `scripts/backup-restore.test.mjs`: cinco pruebas de guardas y detección de pérdida/cambio de datos.
- `package.json`: comandos `backup:verify` y `test:backup`, sin nuevas dependencias ni cambios de lockfile.

Las cinco pruebas pasan y el ensayo real sobre el respaldo local anterior recuperó las 14 tablas esperadas, también tras el cambio final a SHA-256 por streaming. Se conservan el esquema vigente y los datos de la principal. Pasaron `npm run lint`, `npm run typecheck`, `npm run build`, formato de archivos afectados y `git diff --check`. `npm run smoke` comprobó salud live/ready y OpenAPI; la web respondió 200. Una consulta de solo lectura confirmó cero bases `cacaosmart_restore_*` restantes y `git check-ignore` confirmó la exclusión del respaldo y los informes. Las 1.062 pruebas globales del parche Effect anterior son evidencia histórica, no se suman como una ejecución nueva aquí.

## Alertas moderadas revisadas, sin reparación forzada

La auditoría sigue en **16 moderadas, 0 altas y 0 críticas**. Se inspeccionaron las cadenas de desarrollo Angular CLI → pacote → glob/minimatch y herramientas relacionadas. La reparación automática propone degradar Angular a 17; el aviso [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) indica parche de glob en 14.0.2, mientras existen copias 13.0.7 en este árbol. El registro no ofrece `pacote@21.5.4` consultado como posible parche del padre. No se instalaron versiones supuestas ni se aplicaron saltos mayores transitivos sin revisar compatibilidad.

No se afirma que todas las moderadas sean explotables desde las rutas de esta aplicación ni que desaparezcan por ser tooling. Quedan documentadas para un incremento específico, sin `audit fix --force`, exclusiones de auditoría ni cambios del override Effect ya validado.

## Pendientes siguientes

Definir creación periódica de respaldos actuales, almacenamiento privado/cifrado, retención y recuperación conjunta de base e imágenes; luego ensayar ese conjunto completo. No activar servicios externos, alterar roles/hardware o sobrescribir la base principal para una demostración. Revisar el siguiente incremento con el usuario.
