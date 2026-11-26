# Simular lluvia · DEMO visual sin persistencia

> Documentación histórica: el usuario pidió sustituir la tarjeta Lluvia por
> [Clima actual](current-weather-card.md), sin simulación. El acceso y la vista
> de simulación se retiraron del dashboard; el código aislado se conserva.
> Las instrucciones siguientes describen la versión anterior.

## Uso

1. Abrir el dashboard de una parcela en **Mediciones reales**.
2. En la tarjeta **Lluvia**, pulsar **Simular lluvia**.
3. Se abre una vista separada, con cabecera **DEMO · Simulación local**.
   **Avanzar escenario** cambia tres escenas ficticias y **Reiniciar simulación**
   vuelve a la primera. No hay reloj de simulación ni interpolación física.
4. **Volver a datos reales** descarta la vista DEMO y refresca las consultas reales.

Solo se simulan presencia de lluvia, temperatura, humedad ambiental y suelo A.
Las zonas B/C no se muestran, por la indicación posterior de usar solo el sensor 1;
el relé y la válvula no se simulan porque no
se conoce una política de firmware para esos escenarios.

## Separación y seguridad

- Valores ficticios explícitos en un modelo de presentación, no en la fuente
  `TelemetryFacade` ni en un payload de ingesta.
- No HTTP, Socket.IO de escritura, timers, cookies, localStorage ni sessionStorage
  en el componente de simulación. No se llama a ThingSpeak ni a la API desde la demo.
- No persistencia en PostgreSQL ni cambios de `.env`, vínculo, firmware o hardware.
- La ingesta y lectura habitual REAL siguen funcionando independientemente.
  «Sin guardar» se refiere a los valores DEMO, no a detener la recepción real.
- Durante la demo se ocultan lecturas, gráfico histórico, alertas, informes,
  configuración de rangos y diagnóstico de la vista real; no se exportan datos ficticios
  ni se mezclan lecturas reales con los valores de presentación.
- Se conserva la selección REAL de parcela/dispositivo en memoria; al cerrar se
  muestra el estado REAL vigente, no se repone un snapshot antiguo.
- La demo desaparece al cambiar de equipo/origen/parcela, cerrar sesión o recargar.
  La navegación lateral a secciones del dashboard cierra primero la demo.
- No se calculan precipitación en mm, umbrales agronómicos, caudal, litros,
  ahorro, diagnósticos ni una respuesta automática de la válvula.

**Las escenas no representan una predicción ni el tiempo físico de infiltración.**
La lluvia no se traduce en un aumento instantáneo acreditado de humedad del suelo.

## Archivos

- `frontend/src/app/features/dashboard/rain-simulation.model.ts`: escenas ficticias.
- `rain-simulation.component.{ts,html,css,spec.ts}`: presentación y pruebas locales.
- `dashboard.component.{ts,html,spec.ts}`: entrada/salida y aislamiento de vistas.

## Aceptación y revisión manual

- Etiqueta DEMO visible en cabecera y en cada medición ficticia.
- Botones operables por teclado, foco en título al abrir y retorno al botón al cerrar.
- Comprobar en móvil que las tarjetas se apilan y solo la tabla tiene scroll horizontal.
- Comprobar que Avanzar cambia los tres valores y se deshabilita al final.
- Salir muestra los valores reales con su fecha, incluida antigüedad o ausencia de datos.
- En DevTools, la demo no genera POST/PUT/PATCH/DELETE ni escrituras de almacenamiento.
  Las consultas normales a lecturas REAL pueden seguir apareciendo.

Pruebas:

```powershell
npm.cmd run test --workspace=@cacaosmart/frontend
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Resultados de esta entrega: 650 pruebas frontend correctas, lint y typecheck
del monorepo y build Angular/NestJS correctos. Las pruebas cubren cambios de escena,
ausencia de solicitudes/escrituras de almacenamiento en la demo, salida/restauración
y aislamiento de las vistas reales. La inspección visual en navegador y móvil
con la sesión real del usuario queda pendiente; no se usaron sus credenciales.
