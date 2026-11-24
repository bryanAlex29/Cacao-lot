# Renovación visual — incremento 2

## Alcance

El usuario autorizó continuar con el siguiente paso. Se compactaron alertas y se
unificaron filtros/tablas de histórico, riego observado y CSV, manteniendo el
dashboard verde/blanco y su distribución general de referencia.

No es el cierre del rediseño: siguen pendientes la captura original,
fotografías, encabezados comunes y otros ajustes documentados en
[incremento 1](visual-refresh-1.md).

## Cambios visibles

- Alertas de desconexión y humedad con encabezados e iconos coherentes.
  Condición, fechas, cierre, reconocimiento y acción correspondiente permanecen
  fuera de los desplegables.
- Evidencia de cada episodio (último contacto, umbral, margen, versiones) en
  desplegables nativos; reglas y limitaciones en ayudas separadas. La advertencia
  «reconocer no significa recuperación» permanece visible.
- Se conservan todos los episodios de la página, paginación, reintento, errores,
  origen DEMO y configuración de márgenes. No se recorta la lista ni se ocultan
  alertas activas; una página con varios episodios puede seguir siendo larga.
- Franja inferior alineada al inicio: el gráfico y la tarjeta de agua no se
  estiran para igualar la altura del bloque de alertas. ODS permanece debajo de
  agua/alertas y no se inventan cifras de consumo o ahorro.
- Una misma superficie de filtros, campos de fecha, botones y acción principal
  para histórico de humedad, riego observado y reportes CSV.
- Presets activos conservan `aria-pressed` en histórico/riego. CSV no muestra un
  preset activo ficticio: sus fechas pueden editarse de forma independiente.
- Estado de periodo aplicado y zona horaria visibles. Se mantienen UTC, máximo
  31 días, paginación y filtros independientes sin cambiar código de consultas.
- Tabla de riego y tablas del histórico con estilo común, encabezados suaves,
  filas alternas y desplazamiento contenido. Las tablas del gráfico tienen
  regiones enfocables para teclado.
- Ayudas de interpretación de riego y formato CSV desplegables, sin esconder
  errores o estados de envío.

## Archivos afectados

- `frontend/src/app/shared/ui/{alert-panel.css,data-panel.css}` (nuevos).
- `frontend/src/app/features/dashboard/{offline-alerts-panel.component.ts,moisture-alerts-panel.component.ts,dashboard-insights.component.ts,dashboard.component.css}`.
- `frontend/src/app/features/dashboard/{history-period.component.ts,irrigation-history.component.ts,reports-panel.component.ts,soil-history-chart.component.ts}`.
- Pruebas de paneles, fechas y reportes; nuevo
  `moisture-alerts-panel.component.spec.ts`.
- `backend/test/dashboard.integration.ts`: evidencia abierta/cerrada con Enter y
  selector explícito para la configuración de alertas.
- `docs/CONTINUAR.md` y este documento.

Sin modificaciones en API, contratos, servicios de consulta, permisos,
antirrebote, histéresis, cuotas, firmware, base principal ni OpenAI. Sin nuevas
dependencias, commit, push o despliegue. Se conservó el trabajo anterior sin commit.

## Verificación

- `npm.cmd run test --workspace=@cacaosmart/frontend`: **506/506**, 31 archivos.
- `npm.cmd run test:browser` con Edge: **38/38**, incluida apertura/cierre de
  evidencia con teclado, reconocimiento sin resolver condición, fechas, CSV,
  fallos/reintentos, aislamiento de origen y revisión móvil sin desbordamiento.
- `npm.cmd run build`, tipado frontend y lint: correctos.
- Smoke de API y disponibilidad de PostgreSQL correctos durante el trabajo.
- Formato de archivos afectados y revisión de diferencias al cerrar.
- Capturas sintéticas revisadas en
  `C:\Users\Hp\AppData\Local\Temp\opencode\cacaosmart-browser-B46sCF`
  (`dashboard-desktop.png`, `offline-alert-desktop.png` y
  `moisture-alert-mobile.png`). No contienen fotografías reales del usuario.
- El runner eliminó la base temporal. La principal no recibió fixtures ni
  migraciones. No se inició el simulador del usuario.

La suite global de backend no se volvió a ejecutar: continúa pendiente el
TS2322 documentado en `backend/src/weather/open-meteo.spec.ts:37`, ajeno al
incremento visual. La advertencia de consultas concurrentes de `pg` sigue
apareciendo en el runner sin impedir los 38 recorridos correctos.

## Revisión manual y siguiente paso

1. En http://localhost:4200, abrir el dashboard y comprobar la franja de
   gráfico/agua/alertas/ODS.
2. Abrir evidencia con Tab + Enter; comprobar fechas y que Reconocer continúa
   accesible sin expandirla. Reconocer no resuelve una condición activa.
3. Probar fechas y presets en histórico y riego; confirmar que CSV conserva sus
   propios campos y no descarga hasta pulsar una acción.
4. Revisar en móvil los filtros apilados y las tablas desplazables.

Siguiente incremento propuesto: encabezado de parcela/cuenta compartido y
coherencia de las pantallas secundarias, preservando estados de conexión reales.
Las fotografías y la fidelidad exacta requieren volver a adjuntar la imagen
original; no se incorporaron recursos externos en este incremento.
