# Fase 5.11 — Estado independiente de sensores

Implementa `sensor.status` v1.0 conforme a DERCAS §§17.8 y 18.5. Mantiene `telemetry.updated`, `device.status` e `irrigation.updated` separados. Es información derivada de monitoreo, no un nuevo tipo de alerta persistente ni diagnóstico físico de avería. No añade migraciones, dependencias, endpoints o variables de entorno.

## Contrato

`SensorStatusEvent` en `packages/contracts/src/index.d.ts`:

```typescript
interface SensorStatusEvent extends TelemetrySubscription {
  schemaVersion: '1.0';
  evaluatedAt: string;
  readingId: string | null;
  observedAt: string | null;
  sensors: ObservedSensorStatus[];
}
```

`TelemetrySubscription` conserva parcela, dispositivo y origen real/demo. Se agrupan las identidades persistentes del inventario: A/B/C (`soil_1/2/3`), temperatura, humedad ambiental y lluvia. No se inventan UUID si el inventario está incompleto. Cada estado contiene:

- `sensorId`, `code`: identidad persistente y código estable; el relé/feedback no son sensores de este evento.
- `enabled`: monitoreo habilitado tanto en dispositivo como en sensor. No afirma cableado físico correcto.
- `quality`: calidad de la última lectura persistida (`valid`, `missing`, `invalid`, `uncalibrated`) o null si nunca hubo lectura. No se recalibra a partir de rangos o metadatos.
- `freshness`: `unknown` sin lectura; `fresh` hasta dos intervalos configurados inclusive y `stale` después, usando tiempo efectivo de medición, no último contacto del dispositivo.
- `range`: `low`, `within` o `high` con rango numérico configurado; extremos inclusivos. `unconfigured` sin rango, `not_applicable` para lluvia booleana y null si no corresponde comparar (sin lectura, missing, invalid, desactualizado o monitoreo deshabilitado).
- `rangeVersion`: versión del rango actual o null. La comparación es numérica de monitoreo; `within` no significa calibración ni salud agronómica.

`readingId` y `observedAt` identifican la lectura agregada más reciente por tiempo efectivo, recepción y orden de ingesta. **No son la fecha de la última medición válida de cada sonda.** Una lectura parcial explícita conserva missing para esa sonda, no arrastra un valor anterior. `fresh` con missing significa informe reciente de ausencia, no medición válida ni conectividad física comprobada.

## Publicación y seguridad

El gateway consulta inventario, última lectura y rangos persistidos en una transacción `RepeatableRead`. Proyecta el estado después del commit de ingesta y también en el barrido existente de cinco segundos: así detecta envejecimiento o cambios de configuración sin fabricar lecturas. La primera evaluación tras suscribirse puede tardar hasta el siguiente barrido, además del tiempo de consulta.

Solo emite al cambiar el estado semántico por cliente/suscripción (calidad, habilitación, antigüedad, comparación, versión o inventario). Fechas e IDs de lectura no forman parte de esa firma: otra lectura con los mismos estados no genera un evento redundante. Duplicados, rechazos o rollback no publican evidencia no confirmada; una transición temporal/configuración legítima sí puede ocurrir independientemente de ellos. Las lecturas atrasadas no sustituyen la última en la proyección.

JWT, propietario/parcela/dispositivo/origen y `SourcePolicy` se revalidan antes de publicar, también después de consultar la evidencia. Cambiar de selección invalida el trabajo asíncrono anterior. ADMIN no tiene acceso global. No se envían credenciales, hashes, metadatos de calibración ni payload crudo.

Socket.IO sigue best-effort, sin outbox ni clustering; no garantiza orden ni replay durable. El barrido solo produce eventos para clientes suscritos; las alertas durables 5.6/5.7 siguen siendo independientes. El coste adicional de lectura por suscriptor debe medirse antes de escalar o agrupar consultas.

## Angular y efecto visible

El cliente valida versión, identidad/origen, fechas, códigos/UUID no vacíos y únicos, enumeraciones y coherencia de estados. Un evento válido es **invalidación**, no una instrucción para sobrescribir mediciones: `TelemetryFacade` reconsulta snapshot/histórico por REST y el dashboard reconsulta rangos. El mismo estado inmediato no repite invalidación; cambiar selección o salir limpia la firma y cancela solicitudes mediante las fachadas existentes.

Las tarjetas existentes muestran «Sin datos», «Desactualizado», «Sin calibrar», «Sin rango configurado» o comparación Bajo/En rango/Alto. No se añade una pantalla ni contador de alertas artificial. Una configuración cambiada en otra sesión puede reflejarse tras el barrido sin esperar al polling de rangos de 60 segundos. Reconexión y polling REST mantienen recuperación aunque se pierda un evento; mensajes atrasados nunca aplican directamente sus estados.

## Prueba manual

1. Entrar en una parcela propia → Panel → **Datos simulados · DEMO** y elegir el dispositivo existente.
2. Pulsar **Monitoreo**: permanece en el panel y se desplaza hacia las tres tarjetas. Sin simulador activo, la antigüedad y la desconexión del equipo son esperables; el histórico sigue disponible.
3. Con un lote DEMO **autorizado por separado**, comprobar que cada sonda conserva su identidad. Si el emisor informa null para una de ellas, esa tarjeta muestra «Sin datos» sin ocultar las otras. Este incremento no inicia ningún lote automáticamente.
4. En una parcela de prueba propia con rol ADMIN, cambiar un rango desde otra sesión autorizada: la sesión que observa debe recuperar el rango y reclasificar la medición reciente sin generar una lectura nueva. FARMER no adquiere edición ni se debe cambiar su rol para probarlo.
5. Al detener el emisor, una medición con más de dos intervalos queda desactualizada; un mensaje nuevo con medición antigua no la rejuvenece. El estado del dispositivo continúa calculándose por contacto en su propio canal.

No se modifican firmware, política local multizona, umbrales físicos, calibración, márgenes de alertas, roles ni métricas hídricas. Sin registros o rangos no se inventan valores.

## Archivos y verificación

- `backend/src/realtime/sensor-status.ts` y `.spec.ts`: selección de evidencia, proyección y firma semántica.
- `backend/src/realtime/realtime.service.ts`: consulta consistente, reautorización y publicación por ingesta/barrido.
- `packages/contracts/src/index.d.ts`: contrato compartido v1.0.
- `frontend/src/app/core/telemetry/sensor-status-event*`, stream, fuente Socket.IO y facade: validación e invalidación REST.
- `frontend/src/app/features/dashboard/dashboard.component*`: refresco de rangos al invalidar sensores.
- `backend/test/realtime.integration.ts`: inventario sin lecturas, parcial, rangos, deduplicación, origen/propiedad y envejecimiento/recuperación.
- `backend/test/dashboard.integration.ts`: recepción del evento real Socket.IO y refresco de un rango cambiado fuera del navegador, sin otra lectura.

Validación confirmada: **742 pruebas correctas: 207 backend, 353 Angular, 145 integración PostgreSQL/Socket.IO, 27 navegador Edge y 10 simulador**; lint, tipos, build, formato global, diff y smoke correctos. API liveness/readiness y Angular localhost:4200 responden 200. Angular se ejecutó con configuración temporal externa en serie, sin cambiar timeouts ni configuración del proyecto. La primera comprobación de tipos agotó 120 s; se repitió con margen suficiente y terminó correctamente. Las bases temporales de integración y navegador se eliminaron; principal sin fixtures nuevos. Persiste el aviso previo de consultas concurrentes de `pg`, sin cambiar dependencias para ocultarlo.

Primer navegador: 26/27 correctas; la prueba nueva buscaba texto exacto «Bajo» sin considerar su icono. Se sustituyó por el selector semántico existente `data-comparison`. La segunda ejecución agotó el tiempo del primer login, con fallos posteriores en cascada; además, el test nuevo podía revisar el registro de eventos antes de la recepción. Se corrigió para escuchar antes de cambiar el rango y esperar tanto el frame esperado como REST. La ejecución completa final sin otras suites en paralelo pasó **27/27 en unos 152 s**, sin aumentar timeouts ni omitir aserciones. Verifica versión y estado de `sensor.status` real y actualización Angular sin lectura nueva; captura sintética `sensor-status-mobile.png` revisada. Resultados y contexto de entrega en [HANDOFF](HANDOFF.md).

Comandos ejecutados: `npm run typecheck`, `npm run lint`, pruebas backend y Angular (esta última con `--runner-config` temporal en serie), `npm run test:integration`, `npm run test:browser` usando Edge, `npm run build`, `npm run test:simulator`, `npm run format:check`, `git diff --check` y `npm run smoke`. Tras ajustar la espera del test se repitieron los tipos backend y la suite completa de navegador. Sin cambios a datos principales, roles, entorno, firmware o proceso del simulador; cambios locales sin commit/push. Esperar revisión del usuario antes de otro incremento.
