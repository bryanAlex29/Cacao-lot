# Segunda copia verificada fuera del proyecto

## Estado de esta entrega

Se implementó el comando **opcional** `backup:copy`, con destino explícito y
sin sobrescribir conjuntos existentes.

Se copió el respaldo local reciente, ya recuperado en una base temporal, a:

`F:\CacaoSmart-Respaldos\bundle-2026-11-25T03-15-39.801Z-3e779ebb55537a83`

**Tres archivos idénticos** al origen: dump, manifiesto e informe de recuperación.
Se escribió `copy-check.json` al terminar de comprobarlos. No había fotografías
referenciadas en esta copia; el caso con JPEG se probó por separado.

La copia anterior de F: se conserva. F: es una unidad del mismo equipo, no una
copia en la nube ni una garantía frente a pérdida de todo el equipo. No se
programó la copia externa automáticamente ni se integró como tarea de Windows.

## Uso y comprobación manual

Crear y verificar una copia local:

```powershell
npm.cmd run backup:periodic -- --once
```

Después usar el directorio exacto anunciado por ese comando:

```powershell
npm.cmd run backup:copy -- --directory .local/backups/bundle-FECHA-IDENTIFICADOR --destination F:\CacaoSmart-Respaldos
```

`bundle-FECHA-IDENTIFICADOR` es un marcador de ejemplo: sustituirlo por un
directorio real, no escribirlo literalmente. Si se usa la copia ya entregada,
la ruta de origen es:

`.local/backups/bundle-2026-11-25T03-15-39.801Z-3e779ebb55537a83`

**Repetir la copia al mismo destino debe fallar sin sobrescribirlo.** Para
comprobar un recorrido nuevo, crear otro conjunto fechado con el primer comando.
No borrar un respaldo bueno para hacer pasar una prueba.

## Guardas

- Solo admite conjuntos versión 2, fechados y ubicados bajo `.local/backups`.
  Necesitan `before.json` y al menos un informe de recuperación compatible,
  con tablas/fotografías coincidentes y limpieza temporal confirmada.
- Revalida hash del dump e inventario de fotos; rechaza metadatos cambiados,
  corrupción y archivos adicionales inesperados. No copia `.env`, claves IoT
  de texto ni archivos arbitrarios ajenos al conjunto.
- El destino debe ser absoluto, fuera del proyecto y de sus antecesores.
  Rechaza URLs y rutas UNC. En Windows comprueba con CIM una unidad local
  fija o extraíble, no óptica ni de red mapeada.
- No sigue enlaces/junctions de origen, imágenes o antecesores del destino.
  Cada conjunto de destino se crea nuevo; `COPYFILE_EXCL` protege los archivos.
- Copia por archivo y compara tamaño/SHA-256 con el origen antes y después,
  además de las huellas del manifiesto. El marcador final solo se escribe
  tras completar todas las comprobaciones.
- Una copia fallida no lleva `copy-check.json` nuevo. Los archivos parciales
  se conservan para revisión: no se eliminan automáticamente ni se reutiliza
  ese directorio en un reintento.
- No abre PostgreSQL, no restaura la base y no altera el origen. El informe
  copiado corresponde a la recuperación previa del respaldo local; no se
  afirma haber restaurado nuevamente la copia de F:.
- Los hashes detectan discrepancias accidentales, no prueban autenticidad
  contra quien pueda modificar todos los archivos y sus manifiestos.
  `copy-check.json` documenta ese instante, no monitoriza cambios posteriores.

Los respaldos contienen datos privados y hashes de autenticación. No están
cifrados; proteger permisos y dispositivos. No incluye configuración completa
del equipo ni sustituye una política de retención, almacenamiento desconectado
o copia fuera del sitio.

## Archivos y pruebas

- `scripts/copy-backup.mjs`: CLI con comprobación de unidad y errores sin
  volcar datos sensibles.
- `scripts/backup-copy-core.mjs`: validación, copia y marcador de integridad.
- `scripts/backup-copy.test.mjs`: **14 pruebas correctas**, con fixtures
  privadas, corrupción, sobrescritura, rutas y junctions.
- `test:backup:integration`: **1 prueba integral correcta**, ampliada con
  PostgreSQL/JPEG aislados → creación → recuperación temporal → ciclo único →
  segunda copia en un directorio temporal externo → hashes → rechazo de
  repetición. Elimina solo los artefactos sintéticos registrados por el test.
- También pasan **9 pruebas periódicas y 8 de respaldo existentes**, lint
  y tipos. Backend 354 y Angular 601 correctas; build correcto en este cierre.
- Ejecución real en F: correcta, 3 archivos coincidentes, sin reemplazar la
  copia anterior ni restaurar datos sobre la principal.

Guía complementaria: [respaldo periódico opcional](periodic-backups.md).
