# Exportación privada de lecturas para evaluación offline

## Alcance

Nuevo endpoint de solo lectura:

`GET /api/v1/plots/:id/predictions/offline-input.json`

Requiere JWT de usuario activo y parcela propia no archivada, también para ADMIN.
FARMER puede exportar sus datos sin adquirir permisos administrativos.
El origen DEMO exige estar habilitado en el servidor. No existe acceso global,
selección por propietario del cliente ni sustitución de REAL por DEMO.

La API se entregó primero como incremento backend. La
[descarga desde Angular](prediction-offline-export-ui.md) está disponible en
Predicción hídrica. No añade migraciones, dependencias ni tareas de entrenamiento
al servidor. La pantalla continúa sin ofrecer pronósticos operativos.

## Parámetros obligatorios

- `deviceId`: UUID de un único dispositivo asociado a la parcela.
- `source`: `real` o `demo`, explícito y coincidente con el dispositivo.
- `from`: primer día objetivo UTC inclusivo, `YYYY-MM-DD`.
- `toExclusive`: primer día excluido UTC, `YYYY-MM-DD`.
- `trainUntil`: fin exclusivo del entrenamiento UTC.
- `validationUntil`: fin exclusivo de la validación UTC.

Exige fechas civiles reales y
`from < trainUntil < validationUntil < toExclusive`.
Solo admite días completos anteriores al día UTC actual, hasta 366 días objetivo.
No acepta `ownerId`, `asOf`, paginación ni opciones de modelo del cliente.

Ejemplo de consulta para un cliente API autenticado; sustituir los dos UUID por
recursos propios y no publicar tokens ni pegarlos en comandos compartidos:

```text
/api/v1/plots/UUID_PARCELA/predictions/offline-input.json?source=demo&deviceId=UUID_EQUIPO&from=2026-10-01&trainUntil=2026-10-16&validationUntil=2026-10-23&toExclusive=2026-10-31
```

OpenAPI documenta los parámetros y respuestas. Un enlace directo en el navegador
no sustituye el encabezado Bearer: el JWT de la aplicación vive en memoria y una
cookie de renovación no autoriza por sí sola esta descarga.

## Contrato y límites

Devuelve un adjunto JSON `PersistenceInput` v1.0, con `Cache-Control: no-store`,
compatible con ambos evaluadores existentes. Incluye:

- Identidad de parcela, dispositivo, origen y sondas persistentes A/B/C.
- Ventana y cortes solicitados; `asOf` UTC fijado por el servidor al comenzar.
- Eventos de suelo con hora observada, recepción y orden de ingesta decimal.
- Cero, null y calidad explícitos; ninguna interpolación ni relleno.

Se incluyen hasta **dos días UTC anteriores a `from`** para los retardos. No
forman parte del periodo objetivo. Se excluyen eventos recibidos después de
`asOf`; los evaluadores aplican además disponibilidad al emitir y al cerrar
cada partición, para no usar datos futuros.

Las filas de calidad `invalid` conservan esa calidad con valor `null`, aunque
la base contenga un número inválido. No se convierte a lectura válida. Se
conservan valores de calidad `uncalibrated` sin certificarlos ni usarlos como
datos válidos en la evaluación. No se exportan secretos, contraseñas, correos,
coordenadas, metadatos de calibración ni hashes privados de ingesta/dispositivo.

Dispositivos y sondas deshabilitados conservan acceso a su histórico: su
configuración actual no modifica retroactivamente la calidad persistida.
El inventario puede estar incompleto y el periodo vacío; no se inventan sondas
ni observaciones. No se afirma suficiencia de entrenamiento por tener muchas filas.

La autorización, inventario y serie se leen en una transacción RepeatableRead,
con tiempo máximo de 30 segundos. Máximo **100000 filas de suelo en total y
16 MB de JSON**; no son 100000 eventos de tres sondas.
Si se excede cualquiera de los límites, devuelve 413 sin archivo truncado ni
submuestreo silencioso. Series densas, como el simulador cada cinco segundos,
pueden superar estos límites antes de reunir varios días. Este incremento no
resuelve exportaciones masivas ni fusiona periodos automáticamente.

Errores: 400 selección/fechas/cortes inválidos, 401 sesión no autorizada,
403 DEMO deshabilitado, 404 recurso ajeno/archivado u origen incorrecto,
413 volumen excesivo.

## Evaluación local

Guardar la descarga privada en un archivo nuevo bajo `.local`, por ejemplo
`.local/offline-input.json`, sin versionarla ni sobrescribir otra entrada.
Después:

```powershell
npm.cmd run prediction:baseline -- --input .local/offline-input.json
npm.cmd run prediction:regression -- --input .local/offline-input.json
```

Para regresión preparar antes el [entorno Python privado](prediction-offline-regression.md).
Los comandos escriben artefactos nuevos dentro de `.local`; no modifican la
base ni entrenan en cada petición HTTP. Usar los diagnósticos de cobertura:
sin días o muestras suficientes habrá particiones vacías/modelos no entrenados,
no precisión inventada. Una exportación REAL conserva su procedencia pero no
acredita calibración o fiabilidad agrícola por sí sola.

## Verificación

- 16 pruebas unitarias nuevas: selección, fechas, cortes, dos días de retardo,
  periodo vacío, SourcePolicy, límite de filas y límite de bytes.
- Integración ampliada: JWT, propiedad incluso ADMIN, REAL/DEMO, campos extra,
  fechas, adjunto privado, cero/null/calidad, recepción futura, tiempo de
  servidor, archivo vacío, cuentas inactivas, histórico deshabilitado y parcela
  archivada. Fixture cronológica alimenta ambos preparadores con 18 muestras
  cada uno, sin datos futuros y con retardos verificables.
- Backend completo: 354 pruebas correctas; frontend: 551 correctas.
- Tipos, lint y compilaciones backend/frontend correctos.
- Integración global: 210 pruebas correctas en 10 suites. Después se añadieron
  dos comprobaciones HTTP (ADMIN propietario y 413 sin adjunto parcial) y se
  repitió la suite de predicción en otra base temporal: **26/26 correctas**.
  No sumar la repetición a la cifra global como si fueran casos distintos.
- Herramientas offline: 2 pruebas CLI de persistencia, 12 Python y 2 CLI de
  regresión correctas. Smoke correcto y ruta nueva presente en OpenAPI.
- Formato de archivos afectados y `git diff --check` correctos. El formato
  global conserva el pendiente anterior de finales de línea/estilo.

Las bases temporales de las ejecuciones se eliminaron al terminar. Persiste
la advertencia conocida de consultas concurrentes de `pg`; no se cambió la
dependencia ni se ocultó el aviso.

No se ejecutó una descarga con la contraseña/sesión del usuario ni se crearon
datos sintéticos en su base principal. La acción Angular se añadió en el
[incremento siguiente](prediction-offline-export-ui.md); la revisión manual
desde la cuenta del usuario sigue pendiente.
