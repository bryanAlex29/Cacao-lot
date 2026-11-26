# Ejemplo local de consumo y ahorro

En el dashboard, **Agua y consumo → Ver ejemplo** abre una presentación
**dentro de la misma tarjeta**, sin otra página, modal ni sustitución del dashboard.
Se muestran cantidades ficticias:

- Consumo habitual del ejemplo: **100 L**.
- Consumo hipotético del ejemplo: **80 L**.
- Diferencia del ejemplo: **20 L**, equivalente a **20 %** de los 100 L.

Etiqueta permanente **DEMO · Ejemplo ficticio** y aviso de que no representa
consumo ni ahorro real de la parcela. No son metas ni resultados comprobados.
Los litros y el porcentaje se comparan únicamente entre esos dos supuestos;
no proceden del relé, tiempos de riego, sensores o una referencia agrícola real.
No hay caudal, superficie o instalación física inventados.

**Cerrar ejemplo** elimina los números y restituye Consumo **No disponible** /
Ahorro **No calculable**. Un cambio de parcela, equipo u origen, la salida del
dashboard o la recarga descartan el estado. Refrescar los datos de la misma selección
no cierra el ejemplo.

## Aislamiento

- Componente de presentación con estado local; sin HTTP, navegación, timers,
  almacenamiento del navegador ni acceso a credenciales.
- No escribe en base de datos, ThingSpeak, reportes, histórico, alertas o dispositivos.
- Las demás tarjetas conservan las mediciones reales y su actualización habitual.
- No modifica `TelemetryFacade`, selección REAL/DEMO, ingesta, cadencia de 20 s,
  estimaciones del backend ni control del relé/válvula.
- La simulación de lluvia independiente sigue funcionando como antes.
- Para estimaciones reales siguen haciendo falta caudal documentado y referencia
  comparable. Este ejemplo no elimina esa limitación.

## Archivos y pruebas

`frontend/src/app/features/dashboard/water-consumption-example.model.ts`,
`water-consumption-example.component.{ts,html,css,spec.ts}` y
`dashboard-insights.component.ts`. Prueba de aislamiento en `dashboard.component.spec.ts`.

Verificar abrir/cerrar dentro de la tarjeta, etiqueta DEMO, ausencia de navegación,
no solicitudes ni escrituras de storage del ejemplo y conservación de lecturas/reportes.
