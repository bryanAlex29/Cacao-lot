# Predicción hídrica — primer incremento: disponibilidad y cobertura

**Ampliación offline posterior:** ya existe un preparador reproducible de dataset y referencia de persistencia evaluada con particiones cronológicas; ver [alcance y comandos](prediction-offline-persistence.md). Es una herramienta local experimental, no un modelo integrado a este endpoint. La pantalla y el contrato de disponibilidad descritos aquí no cambian.

## Alcance funcional

La ruta Angular `/parcelas/:id/prediccion` añade un acceso «Predicción hídrica · No disponible» al menú compartido de una parcela. Permite seleccionar explícitamente un equipo del inventario paginado y consultar las tres sondas sin mezclar equipos ni orígenes REAL/DEMO.

**No es un modelo predictivo.** No hay entrenamiento, inferencia, regresión, balance hídrico, gráfico pronosticado ni métricas de exactitud. La pantalla declara «modelo no implementado» incluso cuando hay muchas observaciones. No controla la electroválvula ni estima déficit, litros o fecha de riego.

Este incremento prepara el contrato y permite inspeccionar la cobertura almacenada mientras se reúnen datos auténticos. No duplica el clima histórico ya implementado ni requiere el sensor físico para probar software con fixtures aisladas.

## Contrato de solo lectura

```text
GET /api/v1/plots/:id/predictions?source=real&deviceId=UUID&horizonDays=1
```

- JWT y propiedad de la parcela; ADMIN no tiene acceso global. Propietario activo y parcela no archivada. FARMER puede consultar recursos propios.
- `source` es `real` por defecto. `demo` exige que la política existente de demostración lo permita; nunca se usa como fallback silencioso.
- `deviceId` debe pertenecer a esa parcela y origen. Sin equipos devuelve tres zonas vacías; con varios equipos y sin selección devuelve 409. La UI exige selección expresa y pagina el inventario en grupos de diez.
- El objetivo previsto se define como **humedad del suelo en % por zona a un día**. `horizonDays` solo admite 1 en este incremento. Es una definición de alcance, no un resultado disponible.
- La respuesta versionada siempre contiene `status: unavailable`, `reason: model_not_implemented`, `model: null`, `predictions: []` y `waterDemand: null`.
- Para cada código `soil_1`, `soil_2`, `soil_3` conserva ID persistente, habilitación, número de registros, muestras válidas de entrada, fechas UTC distintas con al menos una muestra válida y primera/última fecha válida. Sensor no registrado: ID null y conteos cero; esto no representa humedad cero.
- No devuelve credenciales, propietarios, fotografías, metadatos de calibración ni series completas. OpenAPI documenta consulta y estructura de salida.

## Ventana y significado de los datos

Se inspeccionan **30 días completos UTC**: desde medianoche UTC de hace 30 días inclusive hasta medianoche UTC de hoy **exclusiva**. El día UTC en curso se excluye para no mezclarlo con días completos. Es una ventana técnica de inspección, **no un mínimo agronómico ni una garantía de suficiencia para entrenar**.

La consulta agrega datos en PostgreSQL, con el índice temporal existente, sin cargar todas las lecturas en Node o Angular. Una transacción `RepeatableRead` mantiene coherencia entre propiedad, selección y conteos. Se filtran origen y dispositivo, tiempo efectivo dentro de la ventana y recepción no posterior a la consulta.

Una muestra cuenta como válida aquí solo con calidad de entrada `valid` y humedad entre 0 y 100; cero es válido, null no lo es. `missing`, `invalid` y `uncalibrated` no cuentan como muestras válidas. **Esta clasificación no acredita calibración física**, continuidad de muestreo ni validez agrícola. Un día con una única lectura cuenta como día con observación, no como día completamente cubierto. No se calculan porcentajes de cobertura que sugieran lo contrario.

Un equipo o sensor deshabilitado puede conservar registros históricos: se muestra su habilitación por separado, sin inferir conexión actual ni disponibilidad del pronóstico. Las fechas primera/última corresponden al periodo inspeccionado; la pantalla no se actualiza por Socket.IO.

## Seguridad de la interfaz

- Valida versión, parcela, equipo, origen, objetivo, ventana, códigos únicos, conteos y fechas antes de mostrar la respuesta.
- Rechaza respuestas que introduzcan modelos, agua o predicciones no soportados; no muestra resultados parciales como válidos.
- Cambiar equipo, página, parcela o cerrar sesión cancela solicitudes y limpia la cobertura anterior. Errores permiten reintentar sin escrituras ni datos inventados.
- Reutiliza sidebar estable, encabezado, menú móvil, foco visible y enlace para saltar al contenido. El encabezado no muestra un estado de conexión de sensor sin evidencia.

## Verificación

Ejecutadas **300 pruebas backend y 551 Angular**, incluidas 13 y 17 nuevas respectivamente. Tipos correctos. Se añadieron pruebas de integración PostgreSQL para permisos, separación de fuentes/equipos, fronteras temporales, cero/null/calidad, no escrituras y casos no soportados; y un recorrido Edge con selección, origen DEMO, ausencia de llamadas externas y anchos de 320/390/768/1440 px.

La integración PostgreSQL terminó correctamente: **199 pruebas**, incluidas 13 nuevas del módulo. Las bases temporales se eliminaron. Salud live/ready y frontend local responden 200; OpenAPI publica la ruta nueva. Persiste la advertencia heredada de consultas concurrentes de `pg`; no se modificaron dependencias para ocultarla.

La validación en segundo plano terminó: **lint, build backend/frontend y las 44 pruebas Edge correctos**. Incluye el recorrido nuevo de predicción y el encabezado compartido en cinco pantallas. La base temporal de navegador fue eliminada. En conjunto, esta ejecución acredita **1.094 pruebas** (300 backend, 551 Angular, 199 integración y 44 navegador); no suma suites de simulador, seguridad o respaldo que no se repitieron aquí. Formato de archivos afectados y diff correctos. Capturas sintéticas privadas en `Temp/opencode/cacaosmart-browser-w0vjK1` del equipo local.

### Revisión manual

1. Entrar y abrir una parcela propia; desde el menú elegir «Predicción hídrica».
2. Comprobar el aviso de indisponibilidad antes de seleccionar equipo. Una parcela vacía no debe mostrar dispositivos o muestras ficticias.
3. Seleccionar un equipo existente. Verificar origen REAL/DEMO, identidad, tres zonas, fechas UTC y conteos. Una base sin lecturas puede mostrar ceros en los conteos, nunca una humedad inventada.
4. Cambiar selección/página/parcela y confirmar que no se conserva cobertura del equipo anterior.
5. Comprobar reintento, salida y menú móvil. No debe aparecer una acción de válvula ni un número de litros/precisión.

## Archivos

- `packages/contracts/src/index.d.ts`: contrato compartido `PredictionAvailability`.
- `backend/src/prediction/`: consulta validada/OpenAPI, repositorio agregado, servicio y módulo; registro en `app.module.ts`.
- `frontend/src/app/features/water-forecast/`: cliente validado y pantalla; ruta y enlace en sidebar compartido.
- Pruebas en esos módulos y `backend/test/prediction.integration.ts`, `backend/test/dashboard.integration.ts`.

Sin migraciones, dependencias nuevas, cambios de `.env`, dispositivos reales, registros de negocio en la principal, proveedores externos, commit/push/merge o despliegue.

## Siguiente incremento, aún pendiente

Definir un conjunto de características y cortes temporales reproducibles; implementar persistencia como referencia, regresión múltiple y balance hídrico con parámetros justificados; entrenar fuera de requests y evaluar MAE/RMSE por horizonte sin fuga temporal. Persistencia de modelos/predicciones y un gráfico observado/pronosticado vendrán después. No convertir el conteo de esta pantalla en una aprobación automática de suficiencia o exactitud.
