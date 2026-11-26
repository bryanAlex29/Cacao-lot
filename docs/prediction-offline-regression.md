# Regresión lineal múltiple offline — comparación experimental

## Alcance

Entrenamiento offline por sonda con **scikit-learn `StandardScaler` + `LinearRegression`**, dos retardos de humedad y comparación con persistencia en las **mismas filas** de validación y prueba. Conserva el dataset y la herramienta de persistencia anteriores sin alterar sus hashes/versiones.

No es un pronóstico operativo. No modifica Angular ni el endpoint de disponibilidad, no lee PostgreSQL, no obtiene clima, no envía imágenes ni controla la válvula. Sigue sin calcular déficit, litros, ahorro o fecha de riego. No es un balance hídrico ni acredita calibración o fiabilidad agrícola.

## Preparación local de Python

Se comprobó Python 3.11.0 y se creó un entorno **privado** `.local/prediction-python`. No se instalaron paquetes en Python global. El lock `analytics/prediction/requirements-win-py311.txt` fija las siete dependencias de ejecución con hashes SHA-256 de ruedas binarias para **CPython 3.11 / Windows x64**:

`scikit-learn 1.9.1`, `numpy 2.4.6`, `scipy 1.17.1`, `joblib 1.6.0`, `narwhals 2.29.0`, `threadpoolctl 3.8.0`, `cloudpickle 3.1.3`.

En otro equipo compatible, comprobar primero herramientas y versiones. Crear el entorno solo si no existe y no sobrescribir uno desconocido:

```powershell
py -3.11 --version
py -3.11 -m venv .local/prediction-python
.local/prediction-python/Scripts/python.exe -m pip install --require-hashes --only-binary=:all: -r analytics/prediction/requirements-win-py311.txt
.local/prediction-python/Scripts/python.exe -m pip check
```

El lock se obtuvo tras resolución binaria sin instalar y posterior instalación con comprobación de hashes. La instalación y `pip check` se verificaron localmente. No reutilizar este lock en otras plataformas/versiones de Python esperando que los hashes sean universales: necesitan resolución y revisión propias. Los comandos de evaluación **no instalan nada automáticamente** ni cambian dependencias npm. La biblioteca `cloudpickle` es transitiva; el proyecto **no carga ni guarda modelos pickle/joblib**.

## Ejecutar

```powershell
npm run prediction:regression:demo
npm run prediction:regression -- --input .local/ENTRADA.json
npm run test:regression-python
npm run test:regression-cli
```

La entrada es el mismo contrato privado `PersistenceInput` descrito en [persistencia](prediction-offline-persistence.md). Puede usarse el `input.json` de una ejecución previa. Se mantiene la identidad única de parcela/equipo/origen y las sondas persistentes separadas. `source` en un archivo sigue siendo procedencia declarada, no autenticidad verificada de campo.

No hay exportación automática de registros de una cuenta. La demo es una fixture matemática explícita, sin crear lecturas ni recursos en la base principal.

## Dataset nuevo y ausencia de fuga temporal

Versión `soil-two-lag-asof-v1`, objetivo heredado: última humedad observada del día UTC objetivo disponible antes del corte de su partición; horizonte de un día UTC, no un punto exacto garantizado a 24 horas.

- `lastMoisturePct`: última observación del día anterior **recibida al emitir**.
- `lag2MoisturePct`: última observación de dos días antes, también conocida al emitir.
- Si la última observación disponible del día correspondiente no es utilizable, se excluye la muestra: sin relleno, interpolación, sustitución por días más antiguos o uso de datos recibidos después de la emisión.
- Conserva las fronteras y límites de disponibilidad de etiquetas del preparador anterior. Las features y sus dos evidencias temporales se validan de nuevo en Python.
- El nuevo diagnóstico informa elegibles de persistencia, exclusiones por segundo retardo y muestras comunes por zona/partición. **No comparar directamente métricas con el informe v1**, que puede tener otras fechas elegibles.
- Las mismas filas del dataset nuevo se usan para persistencia y regresión; la diferencia de MAE se calcula en puntos porcentuales sobre ese conjunto común.

La demo anterior no contiene el día -2 del primer objetivo; se excluye ese primer día por zona en lugar de inventarlo. Se espera que queden 177 muestras comunes (59 por zona): 30 de entrenamiento, 14 de validación y 15 de prueba en esa fixture concreta. Estos conteos no son mínimos agronómicos.

## Ajuste y evaluación

Cada sonda tiene su propio ajuste. El escalador y los coeficientes se calculan **solo con train**, sin mezclar aleatoriamente ni ajustar con validation/test. Se fija un solo procedimiento, sin búsqueda de hiperparámetros ni selección automática del ganador. El informe conserva `preferredModel: null`.

Se requiere técnicamente al menos cuatro muestras de entrenamiento para dos variables más intercepto y rango completo de la matriz centrada. Si faltan muestras o las variables son constantes/linealmente dependientes, la zona queda `not_trained`, con motivo y artefacto null; persistencia puede seguir evaluándose sobre las filas disponibles. Esto no demuestra suficiencia de datos reales.

Para validation y test, por zona: número de filas, MAE, RMSE y sesgo (`pronosticado − observado`) en **puntos porcentuales de humedad**, no porcentaje de precisión. Sin filas evaluables, métricas null. No se promedian sensores para representar una humedad única.

Las salidas lineales pueden quedar fuera de 0–100. No se recortan para mejorar las métricas: se conservan para inspección y se cuentan en `outOfRangePredictions`. Una salida así no es físicamente aceptable ni se publica como pronóstico de campo.

## Artefactos y reproducibilidad

En `.local/prediction-regression-runs/run-*`, excluido de Git:

- `input.json`: entrada canónica reproducible.
- `dataset.json`: JSON compacto versionado con ambas evidencias; su SHA-256 corresponde exactamente a los bytes que lee Python.
- `report.json`: identidad, hash, cortes, versiones Python/scikit-learn/NumPy/SciPy, diagnóstico, evaluación de los dos métodos y coeficientes por zona en JSON.
- `complete.json`: escrito al final, con hashes de entrada, dataset e informe. Un directorio sin este marcador está incompleto.

El artefacto por zona conserva variables ordenadas, medias/escalas de train, coeficientes/intercepto escalados, rango y fechas de entrenamiento. Para reconstruir la salida: `intercepto + Σ ((feature − media) / escala) × coeficiente`. No es un archivo ejecutable ni se deserializan objetos Python.

Los hilos numéricos se limitan a uno en el proceso hijo y el informe registra versiones. La reproducibilidad se comprueba en el mismo entorno; no se promete igualdad bit a bit entre distintas versiones de BLAS, Python, scikit-learn o arquitecturas.

Solo se aceptan archivos privados, hasta 16 MB; datasets acotados y entorno no productivo. Python valida identidad de sonda, unidades, cortes, valores, evidencias, unicidad de días y consistencia de conteos. No sobrescribe informes existentes. El CLI no permite seleccionar un destino arbitrario.

Los archivos contienen información privada y no se cifran automáticamente. Los permisos restrictivos no sustituyen ACL de Windows. Los hashes detectan discrepancias, **no** sustituyen una firma contra quien pueda modificar el conjunto completo. No hay borrado automático de experimentos fallidos ni de respaldos.

## Verificación del incremento

Se añadieron pruebas TypeScript del nuevo dataset, pruebas Python de ajuste/escala solo con train, invariancia del artefacto al cambiar holdout, métricas manuales, rangos degenerados, insuficiencia, ausencia, predicciones fuera de rango y guardas temporales. También una prueba CLI de recorrido TypeScript → Python y reproducción desde entrada privada.

La primera validación pasó: **6 pruebas TS y 12 Python**, tipos/lint y demo correctos. La demo produjo tres modelos experimentales con **30 muestras de entrenamiento, 14 de validación y 15 de prueba por zona**, siempre comparados sobre las mismas fechas. Entorno y artefactos están excluidos de Git; Python global sigue sin scikit-learn.

El cierre original dejó la validación final pendiente. La revisión posterior
de backend, frontend, integración, navegador, build y salud se documenta en
[validación local](validation-2026-11-24.md). Los resultados de la fixture no
validan el cultivo.

### Preparación y verificación en el equipo actual — 24 de noviembre de 2026

Este equipo tenía únicamente Python global 3.14.6, incompatible con el lock
binario CPython 3.11. Se descargó Python oficial **3.11.9 / Windows x64**
mediante el administrador de Python, que verificó la firma del índice de
python.org. Se extrajo exclusivamente en `.local/prediction-runtime`, sin
registrarlo como Python global ni modificar sus alias.

Se creó un entorno nuevo `.local/prediction-python`; no se sobrescribió ningún
entorno anterior. Comandos ejecutados desde la raíz:

```powershell
py install --dry-run --target=.local/prediction-runtime 3.11
py install --target=.local/prediction-runtime 3.11
.local/prediction-runtime/python.exe -m venv .local/prediction-python
.local/prediction-python/Scripts/python.exe -m pip install --require-hashes --only-binary=:all: -r analytics/prediction/requirements-win-py311.txt
.local/prediction-python/Scripts/python.exe -m pip check
npm.cmd run test:regression-python
npm.cmd run test:regression-cli
npm.cmd run prediction:regression:demo
```

Antes de reutilizar esos comandos, comprobar que los destinos no existan y no
sobrescribirlos. Ambos directorios están excluidos de Git. Python global sigue
en 3.14.6 y el administrador continúa listando solo esa instalación global.
No se cambiaron dependencias fijadas, scripts ni código productivo.

Resultados de esta ejecución:

- Siete dependencias del lock instaladas con verificación de hashes y sin
  compilaciones desde fuentes; `pip check` correcto.
- **12 pruebas Python y 2 pruebas CLI correctas**, incluida reproducción del
  experimento y rechazo de entradas/entornos no admitidos.
- Demo completa en
  `.local/prediction-regression-runs/run-2026-11-25T02-07-29.712Z-2721f3177f796820`.
- Tres zonas con estado `fitted_experimental`; informe `experimental` y
  `fieldValidated: false`. Hashes de dataset e informe coinciden con
  `complete.json`.

No se consultó ni modificó PostgreSQL, no se conectó una fuente meteorológica
y no se publicaron pronósticos web ni órdenes de riego. La instalación descargó
el runtime y las dependencias; la evaluación utilizó la fixture sintética local.

## Pendientes

La integración posterior ya permite [registrar versiones privadas y consultar
la regresión en Angular](prediction-web-regression.md), sin entrenar por HTTP.
Las descripciones anteriores corresponden al incremento offline original.

El [exportador autorizado por API](prediction-offline-export.md) permite descargar
el contrato de entrada desde lecturas propias, con
[descarga explícita desde Angular](prediction-offline-export-ui.md). No se
exportan datos automáticamente. Siguen pendientes variables ambientales/climáticas
con procedencia y disponibilidad temporal verificadas, evaluación con muestras de
campo y calibración, balance hídrico justificado y persistencia de emisiones.
La pantalla ofrece inferencia experimental controlada, no un modelo hídrico
operativo validado.
