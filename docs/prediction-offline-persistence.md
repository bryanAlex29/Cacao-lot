# Predicción — dataset offline y referencia de persistencia

**Ampliación posterior:** se añade una [comparación offline con regresión múltiple](prediction-offline-regression.md) usando un dataset nuevo de dos retardos. No modifica el dataset v1 ni convierte sus resultados en pronósticos operativos. Consultar allí el estado de validación del incremento nuevo.

## Qué implementa este incremento

Preparación reproducible de un conjunto diario de humedad por sonda, particiones cronológicas y evaluación retrospectiva de **persistencia**: pronosticar el valor de referencia usando la última observación disponible del día anterior. Es un método sin parámetros ajustados, **no una regresión ni un balance hídrico**.

El motor es TypeScript puro, separado de NestJS/HTTP. No entrena al abrir una pantalla, no lee PostgreSQL ni consulta proveedores. No modifica el contrato web de disponibilidad: el pronóstico operativo continúa **no disponible**. No calcula litros, déficit, ahorro, fecha de riego o acciones de válvula.

## Ejecutar y reproducir

Desde la raíz, con las dependencias existentes instaladas:

```powershell
npm run prediction:demo
npm run prediction:baseline -- --input .local/prediction-runs/DIRECTORIO_GENERADO/input.json
npm run test:prediction-cli
npm run test --workspace=@cacaosmart/backend -- --runTestsByPath src/prediction/offline/persistence.spec.ts
```

El primer comando genera una fixture determinista **DEMO**, sin crear cuentas, parcelas, dispositivos o lecturas en la base. El segundo procesa únicamente un JSON local privado de esquema conocido. No exporta automáticamente datos de una cuenta: un exportador autenticado y autorizado queda para otro incremento.

Cada ejecución genera un directorio nuevo `.local/prediction-runs/run-*` con:

- `input.json`: entrada normalizada y ordenada, para repetir el experimento.
- `dataset.json`: muestras, procedencia de feature/target, particiones, diagnóstico de exclusiones, versiones y SHA-256 de la entrada canónica.
- `report.json`: versión del método, hash del dataset, identidad, cortes y métricas separadas por zona en validación/prueba.
- `complete.json`: marcador escrito **al final**, tras guardar todos los archivos. Si falta, no considerar completa la ejecución.

Las mismas entradas normalizadas y configuración producen los mismos hashes, dataset e informe. El nombre del directorio cambia; no forma parte del resultado científico. Reordenar filas o propiedades JSON no altera el resultado. No se sobrescriben ejecuciones previas ni se borran automáticamente restos de ejecuciones fallidas.

## Definición temporal exacta

- **Objetivo:** humedad del suelo (%) de la última observación del día UTC pronosticado que esté disponible en el corte de evaluación correspondiente. Es un objetivo de cierre diario con muestreo irregular, **no una medición garantizada exactamente 24 horas después**.
- **Emisión simulada:** medianoche UTC al comenzar ese día. Horizonte: un día UTC completo, no pronóstico mensual.
- **Feature `lastMoisturePct`:** última observación del día UTC anterior recibida como máximo al emitir. No se usa una lectura anterior de hace varios días para completar un hueco.
- Si la última observación disponible es `missing`, `invalid`, `uncalibrated` o tiene valor null, se excluye esa muestra: **no se retrocede silenciosamente a otra lectura válida**. Cero válido sí se conserva.
- Orden estable de selección: tiempo efectivo (`recordedAt`, o `receivedAt` si falta), recepción y finalmente orden de ingesta `BigInt`. Cada evento mantiene los mismos metadatos temporales entre sondas.
- Las filas retrospectivas recibidas tarde **no** entran en features de emisiones anteriores a su recepción.
- Las etiquetas de entrenamiento deben haberse recibido como máximo en `trainUntil`; las de validación, en `validationUntil`; las de prueba, en `asOf`. Se descartan observaciones no disponibles en esos cortes, aunque se conozcan al ejecutar el experimento.
- Los intervalos de días son `[from, trainUntil)`, `[trainUntil, validationUntil)` y `[validationUntil, toExclusive)`. No se mezclan aleatoriamente ni se comparten días objetivo entre particiones. La referencia no ajusta parámetros con ninguna partición; se preserva el conjunto de entrenamiento para la siguiente fase.
- Se requiere que el periodo objetivo haya terminado al llegar a `asOf`, con tres intervalos no vacíos. Son validaciones técnicas, **no un criterio de suficiencia agronómica**.

El dataset permite inspeccionar qué evento y fecha sustentan cada feature y cada etiqueta. Puede usar la observación del último día de una partición como feature del primer día de la siguiente si ya estaba disponible al emitir; eso reproduce disponibilidad temporal, no usar etiquetas futuras para ajustar el modelo.

## Esquema de entrada

`schemaVersion: "1.0"`; identidad única `plotId`, `deviceId`, `source` (`real` o `demo`); `asOf` UTC ISO con milisegundos; fechas `from`, `toExclusive`, `trainUntil`, `validationUntil` en `YYYY-MM-DD`.

`sensors` contiene como máximo tres identidades únicas `{ id, code }`, con códigos `soil_1`, `soil_2`, `soil_3`. `observations` contiene filas con todos estos campos:

```text
eventId, ingestionOrder, plotId, deviceId, source, sensorId, code,
recordedAt, receivedAt, moisturePct, quality
```

`ingestionOrder` es una cadena decimal positiva hasta el límite de `bigint` PostgreSQL; no convertir a `Number`. Los timestamps no nulos deben ser UTC ISO canónico, por ejemplo `2026-10-01T12:00:00.000Z`. `recordedAt` y `moisturePct` pueden ser null. Calidad: `valid`, `missing`, `invalid`, `uncalibrated`. Los valores numéricos deben ser finitos y estar en 0–100, sin convertir cadenas.

Se rechazan campos desconocidos, duplicados de evento/sonda, reutilización incoherente de orden de ingesta, sondas ambiguas y mezcla de parcela/equipo/origen. La procedencia es **declarada por el archivo**, no una verificación de autenticidad o calibración de campo. Etiquetar un archivo REAL no lo convierte en evidencia auténtica.

Límites técnicos: 16 MB por archivo, 100.000 observaciones y 366 días de objetivos; solo ejecución no productiva. Las rutas reales de entrada y salida deben permanecer bajo `.local` y estar excluidas de Git. No se permite un destino de salida arbitrario.

## Métricas y estados

Para validación y prueba se calculan por separado, **por zona**, con `error = pronosticado − observado`:

- `maePp = media(|error|)`.
- `rmsePp = raíz(media(error²))`.
- `biasPp = media(error)`; positivo indica sobreestimación en ese conjunto.

La unidad es **puntos porcentuales de humedad**, no un porcentaje de precisión. Sin pares evaluables, métricas null y estado `no_evaluable_samples`, nunca error cero inventado. Los contadores de exclusión distinguen ausencia de feature utilizable y ausencia de target utilizable; no inventan datos para completar series.

Los informes siempre declaran `status: experimental`, `fieldValidated: false`, calibración no verificada e incertidumbre no calibrada. No se crean bandas de confianza. Los tres sensores no se promedian para simular humedad única ni riego por zonas independientes.

## Evidencia y límites actuales

- **32 pruebas del núcleo aprobadas**: reproducibilidad, hashes, particiones, fronteras, recepción tardía, procedencia, desempate sin pérdida de precisión, calidad/null/cero y métricas contrastadas a mano.
- **2 pruebas CLI aprobadas por separado**, con los límites originales: DEMO y reproducción exacta desde `input.json`, archivos privados y rechazo de producción/argumentos/rutas no permitidos.
- Primer intento CLI concurrente agotó su límite; una prueba del núcleo también registró una demora excepcional en esa ejecución. No se ha demostrado su causa. Se repitió CLI aislado y pasó en unos 18 segundos, **sin ampliar timeouts ni eliminar aserciones**.
- La demo produjo 180 muestras: 60 días objetivo por cada una de las tres zonas; 31 entrenamiento, 14 validación y 15 prueba por zona. Es una fixture matemática fija, no una simulación calibrada del cacao. Sus fechas son parte del escenario sintético, no un registro de campo.
- Tras «vuelve hacerlo», la repetición secuencial terminó correctamente: **332 pruebas backend** (incluidas las 32 del pipeline) y **2 de CLI**, tipos de los tres workspaces, lint, build backend/frontend y salud live/ready HTTP 200. La reproducción por CLI volvió a pasar en unos 18 segundos con los límites originales. Formato de archivos afectados y diff correctos; artefactos privados excluidos de Git.

No se presentan las métricas numéricas de la fixture como resultados del cultivo. No se repitieron las suites Angular, PostgreSQL o Edge del incremento anterior para este motor offline; no se suman sus resultados históricos a estas 334 pruebas.

## Seguridad y siguiente fase

Los artefactos pueden contener datos privados, IDs y fechas. No copiarlos a Git, chat o rutas públicas. Los modos restrictivos de creación no sustituyen las ACL en Windows. No hay cifrado, firma ni política automática de retención; `complete.json` confirma escritura, no autenticidad criptográfica contra un atacante con acceso a toda la carpeta.

La persistencia es la **referencia** para comparar una futura regresión múltiple, no un reemplazo de ella. Siguen pendientes: exportación autorizada desde datos reales, preparación de más variables sin fuga, entrenamiento offline Python/scikit-learn, evaluación fuera de muestra, balance hídrico con parámetros justificados, persistencia de modelos/predicciones y exposición web controlada. Ningún resultado de este script habilita el riego automático.

## Archivos

- `backend/src/prediction/offline/persistence-input.ts`: contrato y validación estricta.
- `persistence-dataset.ts`: selección as-of, particiones, diagnósticos y hashes.
- `persistence-baseline.ts`: interfaz de método, persistencia y métricas.
- `persistence-demo.ts` / `persistence.spec.ts`: fixture explícita y pruebas.
- `scripts/prediction-baseline.mjs` / `.test.mjs`: ejecución privada y prueba de reproducción.
- `package.json`: comandos, sin nuevas dependencias.
