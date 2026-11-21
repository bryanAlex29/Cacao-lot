# Fase 5.6 — Alertas persistentes de desconexión

## Alcance autorizado

Solo desconexión del dispositivo: detección en backend, registro persistente, visualización y reconocimiento por el propietario. Se conservan tarjetas, clasificación numérica, rangos, histórico, eventos de telemetría y firmware. No se implementan baja humedad, histéresis agronómica, avisos por sonda, correo/push, riego remoto ni predicciones.

## Regla y evidencia

- Se reutiliza `connectionStatus`: hay desconexión cuando el tiempo desde `lastSeenAt` supera **estrictamente cinco intervalos de envío**. El límite exacto todavía no abre alerta. No se altera el criterio actual de conexión/desactualización.
- `lastSeenAt` es recepción autenticada y persistida en el servidor, no el reloj de medición del ESP32. Un evento nuevo aceptado acredita contacto, incluso si su medición es antigua o parcial; no acredita datos actuales, calibración ni salud del cultivo.
- Un equipo sin mensajes anteriores permanece sin contacto registrado; no se inventa un episodio de desconexión.
- Reintentos idénticos no renuevan `lastSeenAt` en la ingesta existente y no recuperan una alerta. Payloads rechazados tampoco recuperan contacto.
- `detectedAt` es la fecha en que el detector observó la condición, **no** el instante físico exacto en que se perdió la conexión.
- Hay una sola alerta activa por dispositivo. Reconocerla no cierra la condición ni genera otra. Un nuevo contacto la cierra conservando fechas y reconocimiento; otra desconexión posterior abre otro episodio.
- Deshabilitar dispositivo, archivar parcela o desactivar propietario cierra el episodio por `MONITORING_STOPPED`, no como contacto recuperado. Cambiar el intervalo de envío cierra por `INTERVAL_CHANGED` y reevalúa con el nuevo intervalo. La evidencia anterior no se reescribe.
- Si se vuelve a habilitar monitoreo y el equipo sigue desconectado, puede abrirse un nuevo episodio. No se reconstruyen todas las desconexiones anteriores a la instalación ni ciclos no observados mientras la API estuvo detenida.

## Detector y persistencia

`OfflineAlertDetector` evalúa al arrancar y cada cinco segundos, independientemente de usuarios o clientes Socket.IO. Recorre dispositivos por UUID en lotes de 100, sin cargar todo el inventario. No solapa sus barridos; al cerrar cancela el temporizador y espera el trabajo en curso.

El módulo `alerts` utiliza el mismo orden de bloqueos que la ingesta: **dispositivo → parcela/usuario → alerta**. Se reconsulta el estado bajo bloqueo antes de crear o cerrar. Así no se declara desconexión sobre una recepción que ya fue confirmada en la base antes de la evaluación. La ingesta no cambia ni depende del módulo de alertas.

La migración aditiva `20261121080000_offline_alerts` crea únicamente `offline_alerts`, índices, claves foráneas y restricciones. No borra ni modifica tablas anteriores. Un índice único parcial impide dos episodios activos por equipo, incluso con varios detectores. Ese índice está declarado en SQL, porque Prisma no representa índices únicos parciales en el modelo.

Después de verificar la migración en bases temporales se aplicó a PostgreSQL local con `npm run db:migrate` (`migrate deploy`), sin resetear ni sembrar datos. Se compararon los conteos de usuarios, parcelas, dispositivos, sensores, lecturas, filas de suelo, rangos y auditorías antes/después: se conservaron. El detector registró una alerta DEMO basada en el dispositivo existente sin nuevos mensajes; no se insertaron fixtures ni se reconoció esa alerta automáticamente.

La tabla conserva dispositivo, parcela, origen, última recepción de ese episodio, intervalo aplicado, detección, cierre/motivo y reconocimiento/actor. Los motivos de cierre son:

| Motivo               | Significado                                            |
| -------------------- | ------------------------------------------------------ |
| `CONTACT_RESTORED`   | El servidor recibió un evento nuevo aceptado           |
| `MONITORING_STOPPED` | El recurso dejó de estar habilitado para monitoreo     |
| `INTERVAL_CHANGED`   | Se cambió el intervalo usado para evaluar la condición |

Las fallas se registran con mensajes genéricos sin datos privados ni errores crudos de PostgreSQL. Una falla individual no bloquea el resto del barrido; un error general permite reintentar el siguiente ciclo sin inventar alertas. No hay garantía de aviso inmediato o de entrega externa; si la API/base no están disponibles, tampoco está disponible la detección.

## API y permisos

| Método | Ruta                                                                        | Acceso                     |
| ------ | --------------------------------------------------------------------------- | -------------------------- |
| GET    | `/api/v1/plots/:plotId/alerts?deviceId=<UUID>&source=real&limit=5&offset=0` | ADMIN o FARMER propietario |
| POST   | `/api/v1/plots/:plotId/alerts/:alertId/acknowledge`                         | ADMIN o FARMER propietario |

- JWT vigente, usuario activo, parcela propia no archivada. ADMIN no tiene acceso global.
- `deviceId` persistente obligatorio al consultar. Se comprueba parcela/dispositivo/origen; los otros orígenes no se mezclan. DEMO requiere habilitación de `SourcePolicy` también para lectura/reconocimiento.
- El historial de un dispositivo deshabilitado sigue consultable por su propietario; eso no vuelve a habilitar monitoreo.
- GET es solo lectura: **consultar no crea ni cierra alertas**. Página de 1–100 filas, offset validado, orden estable por detección e ID descendentes.
- POST admite cuerpo vacío o `{}`; rechaza campos de actor, fechas, origen o cierre del cliente. El servidor fija actor y hora. Repetir un reconocimiento devuelve el primero, sin cambiar su fecha.
- Reconocimiento y cierre de la condición son dimensiones independientes. Una alerta recuperada también puede reconocerse posteriormente.
- La respuesta incluye evidencia y fechas, pero no el ID del usuario que reconoció ni credenciales. Swagger documenta las dos operaciones; no hay cierre manual ni borrado de alertas.

## Panel Angular

El panel sustituye únicamente el aviso pendiente de alertas dentro de `DashboardInsightsComponent`. Consumo y ODS no se alteran; el enlace lateral lleva al panel. La selección usa el mismo dispositivo/parcela/origen del dashboard, sin mezclar equipos.

`OfflineAlertsFacade` tiene un ciclo independiente: consulta al seleccionar y cada 15 segundos, paginación de cinco alertas y botón **Actualizar alertas**. Fallos del panel no bloquean lecturas, rangos o gráfico. La latencia visible puede incluir el barrido de cinco segundos y la siguiente consulta del panel; no se promete aviso instantáneo.

El cliente valida identidad, origen, tipo, evidencia temporal, paginación y coherencia de cierre/reconocimiento antes de presentar datos. Estados de carga, error, ausencia y sin selección son distintos. Una lista vacía no afirma conexión ni condiciones normales. DEMO lleva una etiqueta explícita.

El reconocimiento requiere pulsación explícita y nunca se reenvía automáticamente. Mientras se guarda se evita el doble envío. Un error/timeout conserva el resultado como incierto hasta consultar de nuevo. Después del éxito se cancelan GET anteriores al commit para no volver a mostrar un reconocimiento obsoleto. Cambiar selección o destruir el componente cancela GET/POST pendientes y limpia el estado del cliente; una escritura ya confirmada en servidor no se revierte al salir.

Se muestran detección, última recepción, cierre y reconocimiento en hora local. Texto/iconos acompañan el color. «Reconocida» no reemplaza «condición activa», y cierre por deshabilitación/configuración no se etiqueta como recuperación de contacto.

### Corrección posterior — enlace «Alertas» sin perder la sesión

Se detectó que el enlace nativo `href="#alerts"` se resolvía contra `<base href="/">`, por lo que navegaba a la raíz y recargaba el documento. Al perderse la sesión intencionalmente almacenada en memoria, el guard enviaba al login; después del login se abría Mis parcelas.

El enlace de Alertas ahora usa `RouterLink` relativo con `fragment="alerts"` y conserva los parámetros de consulta. `ViewportScroller.scrollToAnchor` desplaza y enfoca el panel, incluso si se vuelve a pulsar con el mismo fragmento. El destino tiene `tabindex="-1"` para admitir foco accesible sin añadir un elemento al orden de tabulación. No se modificaron almacenamiento de sesión, JWT, guardias, backend o datos.

Se añadió una unitaria del clic interceptado y una regresión de navegador: abrir Alertas debe conservar ruta de parcela, dispositivo y origen, no generar solicitudes de navegación de documento, permitir una consulta autenticada y funcionar al repetir el clic. La corrección se limita al enlace de Alertas; no reescribe las otras opciones del dashboard.

Verificación de la corrección: **250 pruebas Angular y 19 de navegador Edge correctas**, incluidas las dos regresiones nuevas. Tipos, lint, build y formato de los archivos afectados correctos. No se ejecutan migraciones nuevas ni se reinicia el simulador por este arreglo.

## Archivos

- `backend/prisma/schema.prisma` y `backend/prisma/migrations/20261121080000_offline_alerts/migration.sql`.
- `backend/src/alerts/`: reglas, detector, repositorio, servicio, DTO, controlador, módulo y unitarias.
- `backend/src/app.module.ts`: registro aditivo del módulo.
- `backend/test/offline-alerts.integration.ts`: PostgreSQL, migración, concurrencia, permisos y recuperación.
- `backend/test/dashboard.integration.ts`: casos adicionales de panel, reconocimiento, contacto, errores y cambio de origen.
- `packages/contracts/src/index.d.ts`: contratos adicionales de desconexión, sin modificar telemetría.
- `frontend/src/app/core/alerts/`: cliente, fachada y pruebas.
- `frontend/src/app/features/dashboard/offline-alerts-panel.component.ts`, `.spec.ts`: presentación y pruebas.
- `frontend/src/app/features/dashboard/dashboard-insights.component.ts`, `dashboard.component.ts`, `.html`, `.spec.ts`: integración y aislamiento de pruebas.
- `README.md`, `docs/HANDOFF.md`, este documento: estado y límites.

## Verificación

```powershell
npm run db:generate
npm run db:validate
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run test:simulator
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

Resultado final: **535 pruebas correctas — 151 backend, 249 Angular, 107 integración PostgreSQL/Socket.IO, 18 navegador Edge Chromium y 10 simulador**. Se añadieron 23 unitarias backend, 43 Angular, 21 de integración y 3 de navegador. Tipos, lint, build, validación Prisma, formato de archivos afectados, `git diff --check` y smoke correctos.

El navegador comprueba reconocimiento por FARMER sin cerrar la condición, ausencia de episodios duplicados, recuperación tras un mensaje nuevo conservando el reconocimiento, error sin ocultar mediciones y limpieza por origen. Se revisaron capturas sintéticas de escritorio (1440 px) y móvil (390 px): condición y reconocimiento visibles, histórico disponible y sin desbordamiento de página. No equivale a una auditoría completa de accesibilidad ni integración con hardware real.

La migración se verificó en las bases temporales y después se aplicó localmente con autorización. `migrate status` confirma el esquema al día; salud/readiness responden correctamente. Se verificó creación automática de la alerta DEMO existente sin cambiar datos previos de negocio.

Las pruebas alteran únicamente sus fixtures y bases temporales; no detienen el simulador del usuario ni insertan telemetría o cuentas de prueba en la base principal. El simulador local permanece detenido por decisión de alcance; no se reinicia para demostrar una alerta.

El navegador tiene un presupuesto de solicitudes mayor **solo en su aplicación de prueba**. Se corrigió el override anterior: `APP_GUARD` con `useClass` no era reemplazado por `overrideGuard(ThrottlerGuard)`; se utiliza `overrideProvider(getOptionsToken())` para las opciones del módulo. La ráfaga de esta matriz podía producir 429 y capturas con errores de histórico ajenos a su objetivo. Se comprueba que no haya 429 inesperados y que el histórico esté listo en la captura. Los límites de producción y las comprobaciones reales de `security.integration.ts` no se modifican; JWT, autorización y validaciones permanecen activos en navegador.

No se instalaron dependencias, no se cambió `.env`, no se publicaron cambios ni se modificó firmware. Continúan pendientes las reglas agronómicas y aprobación específica para alertas de baja humedad.
