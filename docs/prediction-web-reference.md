# Predicción hídrica — primera entrega web experimental

**Cierre: 25/11/2026.** Esta entrega añade una **referencia de persistencia de
humedad**, no un sistema de recomendación de riego validado. No sustituye la
regresión múltiple offline ni completa todos los requisitos de predicción de
DERCAS.

## Cómo verla

1. Iniciar sesión y abrir una parcela propia.
2. Entrar en **Predicción hídrica** desde el menú.
3. Seleccionar el equipo y esperar la consulta de cobertura.
4. En **Referencia de humedad para un día UTC**, pulsar
   **Consultar referencia experimental**.

La consulta es explícita, privada y de solo lectura. No crea equipos, lecturas,
modelos ni predicciones persistidas. Al cambiar equipo/parcela o cerrar sesión,
se cancelan las peticiones y se limpian los resultados anteriores.

## Qué calcula exactamente

- Método: `persistence`, versión `1.0.0`, **sin ajuste de parámetros**.
- Objetivo: humedad (%) por sonda A/B/C al cierre del **día UTC en curso**.
  El intervalo objetivo es `[medianoche UTC, siguiente medianoche UTC)`.
  No equivale a las próximas 24 horas desde el clic.
- Corte de información: medianoche UTC al comenzar el día objetivo.
  `generatedAt` conserva la hora real de la consulta; no se finge que el
  cálculo se ejecutó a medianoche.
- Referencia: último valor del día UTC anterior **recibido antes del corte o
  exactamente en él**. El registro se selecciona primero por tiempo efectivo,
  recepción y orden de ingesta; después se valida su calidad.
- Solo se acepta calidad `valid`, valor finito de 0 a 100. Cero es un dato
  utilizable; `null`, `missing`, `invalid` y `uncalibrated` no lo son.
- Si el último registro es inutilizable, no se retrocede a otro válido. Tampoco
  se rellena un día ausente con un día más antiguo.
- Equipo/sensor deshabilitado o sensor ausente no generan referencia actual.
  La evaluación histórica permanece separada, sin reinterpretar la calidad
  pasada a partir de la habilitación actual.

Siempre se informa `fieldValidated: false`, `fitted: false`,
`uncertainty: not_calibrated` y `waterDemand: null`. Calidad de entrada válida no
certifica calibración física, representatividad ni suficiencia agronómica.
DEMO permanece separado de REAL y nunca lo sustituye.

### Evaluación retrospectiva y gráfico

Se comparan las referencias retrospectivas con las últimas observaciones de
**30 días completos UTC**, conocidas al consultar. Cada referencia usa únicamente
información que había llegado al corte de su propio día objetivo; una recepción
tardía puede incorporarse a la etiqueta observada, pero no a una referencia
anterior a su llegada.

Solo cuentan pares utilizables por sonda:

- MAE: media del error absoluto.
- RMSE: raíz de la media del error cuadrático.
- Sesgo: media de `referencia − observado`.

La unidad es **puntos porcentuales de humedad**, no porcentaje de precisión.
Sin pares, las métricas son `null` y la pantalla muestra **No evaluable**, no
cero. No se hace selección de modelos ni entrenamiento con esos pares; esta
evaluación no equivale a una validación independiente de un modelo ajustado.

El gráfico y la tabla muestran los últimos siete días completos y el objetivo
actual. Azul continuo: observado; verde discontinuo: referencia. Los huecos no
se interpolan ni se unen. La tabla permite consultar los valores y las fechas
sin depender del color.

## Contrato y seguridad

```text
GET /api/v1/plots/:id/predictions/experimental
    ?deviceId=UUID_PROPIO&source=real|demo&horizonDays=1
```

- Sesión y propiedad de parcela/equipo revalidadas en servidor, incluso para ADMIN.
- `deviceId` obligatorio; no mezcla dispositivos ni acepta propietario del cliente.
- `source` respeta la política del entorno; horizonte distinto de 1 se rechaza.
- Parcela archivada o propietario inactivo no tienen acceso.
- Respuesta `Cache-Control: no-store`; contrato
  `ExperimentalMoistureForecast`, versión `persistence-forecast-v1`.
- Tres zonas ordenadas y motivo explícito por zona: `available`, `sensor_missing`,
  `sensor_disabled`, `device_disabled`, `missing_previous_day` o
  `unusable_previous_day`.
- OpenAPI documenta identidad, objetivo, evidencia, histórico, métricas, límites
  y campos `null`. Angular valida la respuesta antes de mostrarla, incluyendo
  identidad, origen, fechas, valores y métricas frente a los pares recibidos.
- La consulta SQL devuelve como máximo 31 días × 3 sensores. Usa una instantánea
  `RepeatableRead` y periodos de 24 horas UTC, sin depender del huso horario de
  la sesión PostgreSQL.

Los endpoints anteriores de cobertura y exportación JSON siguen disponibles y
mantienen su contrato. No se modificaron Prisma, migraciones ni datos existentes.
No hay dependencias nuevas, entrenamiento HTTP, Python ejecutado desde la
petición, consultas a clima/OpenAI ni órdenes de válvula.

## Comprobación con la cuenta actual

Consulta de solo lectura realizada el **25/11/2026 a las 08:11:51 UTC**:

- El equipo existente es DEMO.
- A/B/C devolvieron `missing_previous_day`, referencia `null`, cero pares
  evaluables. La pantalla debe mostrar **No disponible**: falta una lectura del
  día anterior recibida antes del corte, no es un fallo de la instalación.
- Antes/después: 1 cuenta, 1 parcela, 1 dispositivo, 1.712 lecturas y
  5.136 lecturas de suelo, sin cambios.
- Cero bases temporales de pruebas/restauración restantes en esa comprobación.
- Evidencia privada sin credenciales: `.local/prediction-first-delivery-check.json`.
- Informe de cierre: `.local/prediction-first-delivery-close.json`, con resultados
  de pruebas, contrato OpenAPI publicado y limpieza de bases temporales.

No se creó una simulación para rellenar esa ausencia ni se cambió la contraseña
real. Los valores numéricos de las capturas provienen exclusivamente de fixtures
en la base temporal del navegador.

## Validación de la entrega

- **377 pruebas backend y 609 Angular aprobadas** en el cierre; incluyen las 15
  pruebas nuevas del núcleo y 8 de contrato/panel Angular.
- **6 pruebas PostgreSQL Neon** del endpoint experimental y **26 de regresión**
  del contrato de cobertura/exportación aprobadas, con bases temporales eliminadas.
  “Regresión” aquí significa comprobación de funcionalidades anteriores, no
  entrenamiento estadístico.
- **45 pruebas Edge aprobadas** en la matriz de esta entrega. El caso nuevo
  verifica cero, gráficos/tabla, error/reintento, corte UTC, limpieza de selección,
  ausencia de escrituras y anchos 320/390/768/1440.
- Revisadas visualmente las capturas sintéticas de 390 y 1440 px en
  `Temp/opencode/cacaosmart-browser-VZb8T6/experimental-forecast-*.png`.
- Tipos, lint, compilación, formato de archivos afectados y salud local comprobados.
  No se afirma que se haya repetido toda la matriz de integración ajena a esta
  entrega: las ejecuciones nuevas de API son las dos suites indicadas arriba.

## Archivos principales y siguiente incremento

- `packages/contracts/src/index.d.ts`: contrato compartido.
- `backend/src/prediction/experimental-forecast.*.ts`: selección diaria, método,
  métricas y pruebas; controlador/DTO/módulo conectan la ruta protegida.
- `backend/test/experimental-forecast.integration.ts`: autorización, ausencia,
  recepción tardía, desempate, no escritura y OpenAPI.
- `frontend/src/app/features/water-forecast/experimental-forecast*`: validación,
  panel, gráfico, tabla, estados y pruebas; incorporado en la pantalla existente.
- `backend/test/dashboard.integration.ts`: recorrido real de navegador ampliado.

Siguiente incremento: registro/versionado e inferencia controlada de la
**regresión múltiple ya entrenada offline**, comparada sobre las mismas fechas
con esta referencia. Después: variables meteorológicas con procedencia,
evaluación de campo, balance hídrico, incertidumbre calibrada y persistencia
operativa de modelos/predicciones. Litros y fecha de riego siguen pendientes
de parámetros y evidencia suficientes; nada de ello se declara completo aquí.
