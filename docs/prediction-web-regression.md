# Regresión múltiple experimental en la web

## Alcance y uso

En **Predicción hídrica**, selecciona tu equipo, consulta su cobertura y pulsa
**Consultar regresión experimental**. Cada zona conserva su identidad, resultado
o motivo de ausencia, referencia de persistencia, versión y métricas de
validación/prueba. La referencia anterior sigue disponible por separado.

Es una integración de inferencia del modelo offline, **no una recomendación de
riego validada**. No entrena al consultar, no utiliza OpenAI ni clima, no calcula
déficit, litros o fecha de riego y no controla válvulas. `fieldValidated=false`,
`uncertainty=not_calibrated` y `waterDemand=null` permanecen explícitos.

## Contrato y semántica temporal

`GET /api/v1/plots/:id/predictions/regression?deviceId=UUID&source=demo&horizonDays=1`

- Sesión y propiedad obligatorias, incluso para ADMIN; parcela no archivada y
  propietario activo. Origen autorizado y selección de equipo explícita.
- Objetivo: última humedad del día UTC en curso, intervalo
  `[medianoche, medianoche siguiente)`, no las próximas 24 horas desde el clic.
- Dos entradas: últimas lecturas de los días UTC anteriores 1 y 2, recibidas
  antes o exactamente en la medianoche objetivo. Ambas usan **el mismo corte**;
  una lectura del día -2 recibida el día -1 sí puede ser utilizable.
- Selecciona la última lectura antes de comprobar calidad. Solo `valid`, finita
  y entre 0–100; cero es válido. Sin rellenar días ni retroceder a otra lectura
  válida si la última no lo es.
- Usa la última versión habilitada registrada para esa sonda/parcela/equipo/origen.
  El entrenamiento y toda la evaluación deben preceder al objetivo. Una versión
  puede registrarse después de medianoche si sus datos ya eran conocidos al
  corte: esto es una consulta experimental actual, **no una emisión histórica
  archivada a medianoche**. No hay fallback silencioso a versiones anteriores.
- Fórmula idéntica al artefacto sklearn:
  `intercepto + Σ ((entrada − media_train) / escala_train) × coeficiente`.
  NestJS reconstruye esa función numérica desde JSON; no ejecuta Python ni
  deserializa pickle durante las solicitudes.
- Una salida no finita o fuera de 0–100 se bloquea, no se recorta. La
  persistencia usa la misma primera entrada; las métricas de ambos métodos se
  comparan sobre las mismas filas offline, nunca con conjuntos distintos.

La respuesta incluye tres zonas y motivos como `model_not_registered`,
`missing_features`, `unusable_features` o `output_out_of_range`. No expone
coeficientes, hashes privados ni credenciales. OpenAPI documenta el esquema
completo; `Cache-Control: no-store`.

## Preparar y registrar un experimento propio

1. Exportar explícitamente lecturas propias desde el
   [formulario offline](prediction-offline-export-ui.md). Guardar el JSON
   privado en `.local`; no copiarlo al repositorio público.
2. Revisar cobertura, calidad, fechas y particiones cronológicas. Ejecutar con el
   [entorno Python privado preparado](prediction-offline-regression.md):

   ```powershell
   npm.cmd run prediction:regression -- --input .local/ENTRADA.json
   ```

3. Revisar `report.json`: muestras, MAE/RMSE/sesgo, salidas fuera de rango y
   límites de la evaluación. No se selecciona automáticamente un ganador.
4. Registrar únicamente el directorio completo revisado y su propietario:

   ```powershell
   npm.cmd run prediction:publish -- --run .local/prediction-regression-runs/run-... --owner UUID
   ```

`prediction:publish` significa **registro privado en PostgreSQL**, no despliegue
ni publicación en Internet. Utiliza `DATABASE_URL` y las guardas existentes de
Neon/local, `NODE_ENV=development|test` y, para DEMO, `TELEMETRY_MODE=demo`.
No requiere dependencias o variables nuevas.

Acepta solo archivos regulares privados de hasta 16 MB en el directorio de
experimentos, con `complete.json`, hashes coherentes y dataset reproducible.
Reconstruye el dataset y recalcula las métricas desde las mismas filas; exige
modelo de dos retardos compatible, al menos cuatro muestras de entrenamiento
de rango completo y evaluación no vacía en validación y prueba. Cuatro muestras
son un mínimo técnico, **no suficiencia agronómica**.

Comprueba propietario y asociación de las sondas dentro de una transacción.
Reimportar el mismo informe no sobrescribe ni reactiva una versión deshabilitada.
Las zonas `not_trained` no se registran; se rechaza si ninguna es registrable.
Los hashes detectan alteraciones, pero no son firmas ni prueban autenticidad
de campo frente a quien pueda reescribir todo el conjunto. Solo importar
experimentos de procedencia confiable y revisados.

## Persistencia y protección de datos

Migración aditiva `20261125083000_prediction_model_versions`: tabla privada
`prediction_model_versions` con identidad, artefacto JSON, evaluación, hashes,
fechas y habilitación. No cambia lecturas ni crea pronósticos archivados.

Antes de aplicarla se creó y restauró en base aislada el respaldo privado
`.local/backups/bundle-2026-11-25T08-24-48.607Z-d1ce9c66e1406fb5`.
Después, las **19 tablas anteriores de aplicación conservaron sus conteos y
huellas**, diez migraciones aplicadas y cero modelos en la cuenta principal.
Evidencia: `.local/regression-models-migration-check.json`.
No se registran los modelos sintéticos de pruebas en la cuenta del usuario.

## Verificación y límites

Pruebas de artefactos e inferencia, registro/API PostgreSQL aislado y Angular
cubren ceros, identidad/origen, cortes, ausencias, corrupción, rango, cancelación,
reintento y ausencia de escrituras durante las consultas. El recorrido integral
incluye entrenamiento real con Python, registro CLI, reimportación y rechazo de
archivos alterados y entorno productivo. Las fixtures numéricas no son datos de
campo.

Verificación de cuenta de solo lectura: un usuario, una parcela, un equipo,
1.712 lecturas y 5.136 valores de suelo, sin cambios antes/después de consultar.
Las tres zonas devuelven correctamente `model_not_registered`, valores null y
cero versiones registradas. Contrato publicado también comprobado en la API
local. Evidencia privada: `.local/regression-web-account-check.json`.

Resultados: **384 pruebas backend, 614 Angular, 7 de integración de regresión,
6 de referencia y 26 de cobertura/exportación correctas**; tipos, lint,
compilación y salud correctos. Capturas del panel revisadas a 390 y 1440 px;
su prueba verifica también 320 y 768 px, reintento y ausencia de escrituras.
Primera matriz de navegador: 45/46 correctas, incluido el nuevo panel; un
timeout en la prueba preexistente de reclasificación tras editar un rango.
La repetición completa queda pendiente de resultado; no se declara toda la
matriz aprobada con ese fallo.

Quedan fuera de este incremento: validación con cultivo y calibración, variables
ambientales/climáticas, balance hídrico, incertidumbre calibrada, persistencia de
emisiones, déficit y recomendaciones de riego. Sin modelo propio registrado la
web debe mostrar **No disponible**, no usar el modelo sintético.
