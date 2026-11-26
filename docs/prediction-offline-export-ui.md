# Descarga offline desde Predicción hídrica

## Uso

1. Iniciar sesión y abrir **Predicción hídrica** desde la parcela.
2. Elegir el equipo; tras consultar su cobertura se habilita
   **Exportar para evaluación offline**.
3. Introducir cuatro fechas civiles **UTC**, no horas locales:
   Desde, Fin de entrenamiento, Fin de validación y Hasta exclusivo.
4. Comprobar que `Desde < Fin de entrenamiento < Fin de validación < Hasta`.
   El intervalo es de máximo 366 días completos; no incluye el día UTC en curso.
5. Pulsar **Descargar JSON para evaluación offline** y revisar las descargas
   del navegador. Se informa el número de filas y se advierte si son cero.

El equipo determina REAL/DEMO; el formulario no permite reclasificarlo. Se exporta
únicamente la parcela/equipo/origen seleccionados, sin secretos. La sesión de
Angular autoriza la petición HTTP: no hace falta copiar tokens ni contraseñas.

La descarga conserva el [contrato y límites del endpoint](prediction-offline-export.md):
incluye hasta dos días previos para retardos, cero/null/calidad y fechas de
recepción. Máximo 100000 filas de suelo o 16 MB; un exceso devuelve error sin
archivo parcial. Una serie densa puede superar esos límites antes de reunir
historial suficiente. No se inventan ni submuestrean datos para evitarlo.

Guardar una copia con nombre nuevo dentro de `.local` antes de ejecutar los
evaluadores, siguiendo las guías de
[persistencia](prediction-offline-persistence.md) y
[regresión](prediction-offline-regression.md). Las descargas del navegador no
se mueven automáticamente al proyecto y pueden quedar fuera de una carpeta
privada: no compartirlas ni subirlas a GitHub.

## Comportamiento y seguridad

- La petición es GET por HttpClient, sin persistir tokens en JavaScript.
- El panel valida fechas y cortes antes de consultar; el backend vuelve a
  validarlos y comprueba propiedad y actividad de la cuenta.
- La respuesta se verifica antes de crear el adjunto: tipo JSON, bytes,
  versión, identidad, fechas/cortes, inventario y filas acotados, calidad,
  valores, duplicados y límites temporales. Una respuesta de otro equipo u
  origen no se descarga.
- Durante la petición se bloquea el formulario y se evita el doble clic.
  Los errores conservan las fechas para un reintento manual, sin reenvíos
  automáticos del panel. La renovación de sesión existente no se modifica.
- Cambiar parcela, equipo, origen, actualizar cobertura/equipos o salir limpia
  el panel y cancela la descarga anterior. Destruir la vista también cancela.
- El nombre de archivo incorpora origen, equipo y periodo, no un nombre
  arbitrario devuelto por el servidor. La URL de objeto y el enlace temporal
  se liberan después del clic, también si el navegador falla.
- Sin selección/cobertura válida no aparece un formulario activo. Un fallo de
  exportación no oculta la cobertura ya consultada.

No se entrena dentro de Angular ni de una petición HTTP, no se generan
pronósticos y no se controla riego. Descargar REAL no certifica calibración
ni precisión agrícola. La pantalla conserva la indisponibilidad del modelo
operativo, distinguiéndolo de las herramientas experimentales offline.

## Archivos y verificación

Nuevo panel `offline-export.component.{ts,html,css,spec.ts}`, servicio HTTP
`offline-export-api.service.{ts,spec.ts}` y descarga local
`offline-json-download.service.{ts,spec.ts}`, bajo
`frontend/src/app/features/water-forecast/`. Se integra mediante una selección
computada estable en `water-forecast.component.ts` y su plantilla.

- **601 pruebas Angular correctas**, 38 archivos; 50 pruebas nuevas del panel,
  contrato/API y liberación del enlace/URL.
- Tipos de todos los workspaces, lint y build backend/frontend correctos.
- La primera ejecución aislada identificó que el Blob de jsdom no implementa
  `text()`: las fixtures suministran solo ese método estándar conservando los
  bytes y tipo del Blob. Se repitió la suite completa y pasó. No se desactivó
  la validación productiva.
- **44 recorridos Edge correctos**, con PostgreSQL temporal. La prueba existente
  de predicción en `backend/test/dashboard.integration.ts` ahora descarga el
  JSON real, verifica su contrato, rechaza cortes inválidos/413/respuesta de
  otro equipo, reintenta explícitamente y comprueba que no hubo nuevas lecturas.
- Prueba responsive a 320/390/768/1440 px sin desbordamiento general.
  Capturas sintéticas locales en
  `C:\Users\Hp\AppData\Local\Temp\opencode\cacaosmart-browser-M6L8l0`.
- La base temporal se eliminó al terminar. Persiste la advertencia conocida
  de consultas concurrentes de `pg`; no se ocultó ni se cambió una dependencia.

No se requieren nuevas dependencias ni migraciones. Las pruebas de navegador
usan cuentas y PostgreSQL temporales, no la contraseña ni los datos de la cuenta
principal. No se ha validado cámara física, hardware real ni un pronóstico.
