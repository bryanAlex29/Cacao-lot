# Traspaso de trabajo — CacaoSmart IoT

## Punto de partida

**Estado: fase 4 conservada; rangos (5.1–5.5), desconexión (5.6) y baja humedad por sonda (5.7) implementados. Migración 5.7 aplicada localmente con autorización tras verificación temporal; datos anteriores preservados.** Monorepositorio Angular + NestJS + PostgreSQL/Prisma. Leer primero [AGENTS.md](../AGENTS.md), sus documentos enlazados y [README](../README.md). DERCAS es la fuente funcional; este archivo resume el estado, no reemplaza requisitos.

## Qué funciona

- Registro público solo FARMER e inicio de sesión JWT de 15 minutos; contraseñas Argon2id. Nuevas contraseñas: 8–128 caracteres, mayúscula y símbolo, sin requisito adicional de dígitos. Login existente conserva acceso.
- Parcelas, dispositivos y seis identidades de sensor con permisos por propietario. ADMIN no tiene acceso global a parcelas ajenas. No hay asignación automática de parcelas al registrarse.
- Ingesta IoT v1.2 con `X-Device-Id` UUID y `X-Device-Key` independiente del JWT. Credenciales almacenadas como hash, origen real/demo fijado al provisionar.
- Persistencia atómica de evento y tres filas de suelo. Unicidad dispositivo/evento, reintento idéntico sin efectos, conflicto 409 al cambiar datos con el mismo ID. Lecturas parciales mantienen null; las antiguas no desplazan la última.
- Snapshot e histórico REST autorizados, paginación y filtros. Orden determinista por tiempo efectivo, recepción y secuencia interna.
- Socket.IO autenticado y revalidado por parcela/origen/dispositivo. Solo publica tras persistir eventos únicos. Reconexión, recuperación REST y estado de conexión.
- Dashboard en `/parcelas/:id/dashboard`, accesible desde Mis parcelas: tres zonas, ambiente, lluvia, orden del relé, gráfico de tres series y tabla. Datos DEMO explícitos, sin fallback inventado.
- Simulador local determinista, provisión DEMO explícita para un propietario existente. Credenciales privadas en `.local`; nunca se crean automáticamente en una base nueva.
- Corrección posterior a 5.3: modo continuo del simulador sobrevive a cortes de red/reinicios de API mediante `sendUntilAvailable` y espera acotada entre lotes, preservando evento y fecha. Lotes `--count` y rechazos permanentes siguen acotados. Ver [fase 3](phase-3.md#recuperación-de-cortes-temporales-corrección-posterior).
- `GET/PUT /api/v1/sensors/:sensorId/thresholds`: rangos numéricos por UUID/variable, sin defaults agronómicos. Lectura por propietario, escritura solo ADMIN propietario; DEMO sujeto a `SourcePolicy`.
- Auditoría anterior/nuevo y rango en una transacción; versión optimista (`expectedVersion=0` para crear), bloqueo por sensor y revalidación de permisos. Ver [fase 5.1](phase-5.md).
- Dashboard muestra rangos de las tres sondas y sensores ambientales por UUID con cliente GET y fachada propia; no consulta lluvia booleana. Distingue carga, sin configuración y error; un fallo no bloquea telemetría. Recarga manual/reconexión/cada 60 s, limpia al cambiar selección o salir, sin fallback real/DEMO. Ver [fase 5.2](phase-5-2.md).
- «Configurar rango» y diálogo para ADMIN propietario: validación, PUT con versión original, conflicto sin perder borrador y consulta/elección explícita del rango actual. Nunca reintenta automáticamente una escritura incierta. Un éxito refresca tarjetas cancelando GET anteriores al commit; FARMER sigue sin edición. Ver [fase 5.3](phase-5-3.md).
- Opción A (5.4): tarjetas de suelo/ambiente muestran Bajo/En rango/Alto según sus rangos actuales, extremos inclusivos, con calidad y antigüedad separadas. Datos inválidos/ausentes no muestran cifra válida; antiguos no reciben comparación vigente. DEMO explícito; reales sin calibrar conservan advertencia ámbar incluso dentro del rango. Función pura `assessSensor`, sin solicitudes nuevas ni cambios al histórico/alertas/firmware. Ver [fase 5.4](phase-5-4.md).
- Fase 5.5: `GET /sensors/:sensorId/thresholds/history?from=&to=` devuelve intervalos [inicio, fin) con permisos y origen por dispositivo. Reconstruye auditoría en lectura `RepeatableRead`, ancla previa y límite posterior, máximo 31 días/1000 cambios; inconsistencias no se inventan ni truncan. El gráfico A/B/C añade segmentos mín./máx. por vigencia y tabla accesible; cambiar hoy un rango no cambia los límites de ayer. Fachada nueva independiente, cancelación por selección/página/logout y reconsulta tras guardar; clasificación actual, telemetría y firmware conservados. Sin migraciones ni dependencias nuevas. Ver [fase 5.5](phase-5-5.md).
- Fase 5.6: detector backend al arrancar/cada 5 s sin depender de clientes Socket.IO. Abre un episodio tras más de cinco intervalos sin mensajes, nunca sin contacto previo. Persiste evidencia, cierre/motivo y reconocimiento independiente; nuevo mensaje aceptado restablece contacto, duplicado no lo hace. Bloqueos e índice único parcial impiden duplicados. GET `/plots/:plotId/alerts` por dispositivo/origen y POST `.../:alertId/acknowledge` idempotente para ADMIN/FARMER propietario. Panel independiente con paginación, error/reintento y DEMO explícito. Migración aditiva `20261121080000_offline_alerts` aplicada localmente después de pruebas temporales; cuentas/telemetría/rangos preservados. Sin alertas de humedad. Ver [fase 5.6](phase-5-6.md).
- Estado del sistema ofrece «Volver a mis parcelas» mediante RouterLink con sesión activa, sin recargar ni perder la sesión; acceso a login para visitantes.

Detalles de implementación: [fase 2](phase-2.md), [registro](registration.md), [fase 3](phase-3.md) y [fase 4](phase-4.md).

## Verificación funcional

Fase 5.7: **178 backend, 295 Angular, 124 integración PostgreSQL/Socket.IO, 20 navegador y 10 simulador correctas (627 total)**. Tipos/lint/build/Prisma/formato correctos; revisión móvil 390 px sin desbordamiento. Reglas aprobadas: tres bajas consecutivas activan; tres ≥ mínimo + margen recuperan. Margen explícito por sonda, sin defaults. Inválidos/ausentes/antiguos rompen confirmaciones; reales sin calibrar excluidos, DEMO etiquetado. Estado/cursor/episodios durables y auditoría; cambios de rango/margen cierran por configuración y reinician atómicamente. Reconocer no cierra. Prueba Edge detectó formulario sin directiva de submit: corregido con FormGroup y regresión DOM/navegador. **Tras autorización se aplicó `20261121200000_moisture_alerts` a la principal local; conteos anteriores conservados en nueve tablas y cuatro tablas nuevas vacías.** Smoke/salud y rutas OpenAPI correctos; Angular 200 en localhost:4200 (IPv6 ::1). Se repitieron las 20 pruebas Edge, incluido Guardar margen; sin guardar valores en la principal ni reiniciar simulador. Ver [fase 5.7](phase-5-7.md).

Corrección posterior a 5.6: el enlace «Alertas» ahora usa RouterLink relativo con fragmento y conserva parámetros, en lugar de `href="#alerts"` que, por el base href raíz, recargaba la app y perdía el JWT en memoria. Desplazamiento/foco por ViewportScroller, también al repetir clic; destino con tabindex -1. **250 Angular y 19 navegador correctas**, más tipos/lint/build/formato. La regresión de navegador verifica ruta, parcela/dispositivo/origen, sesión autenticada y ausencia de navegación de documento. Sin cambiar auth, backend, datos o simulador. Otros enlaces nativos no se modificaron en este arreglo.

Fase 5.6: **535 pruebas correctas — 249 Angular, 151 backend, 107 integración PostgreSQL/Socket.IO, 18 navegador Edge Chromium y 10 simulador**. Lint, tipos, build, validación Prisma, formato de archivos afectados, diff y smoke correctos. Navegador verifica reconocimiento FARMER sin cerrar condición, nuevo contacto conservando historial, errores aislados y cambio de origen; capturas 1440/390 px revisadas sin desbordamiento. Migración aditiva aplicada localmente tras verificarla en bases temporales; esquema al día y conteos de negocio anteriores conservados. El detector generó una alerta DEMO legítima mientras el simulador sigue detenido. Se corrigió el override de presupuesto HTTP **solo en la matriz de navegador** usando el token de opciones de Throttler; seguridad en producción y suite de seguridad intactas. Detalles en [fase 5.6](phase-5-6.md).

Resultados anteriores:

Fase 5.5: **445 pruebas correctas — 206 Angular, 128 backend, 86 integración PostgreSQL/Socket.IO, 15 navegador Edge Chromium y 10 simulador**. Lint, tipos, build, smoke, formato de archivos afectados y diff correctos. Navegador verifica vigencias anterior/nueva, filtros, error/reintento sin ocultar mediciones y paginación de 103 lecturas sin arrastrar límites a periodos previos a la configuración. Capturas de 1440/390 px revisadas con tabla abierta, sin desbordamiento de página. Sin cambios de schema/migraciones, cuentas, configuración, datos principales, firmware ni procesos del simulador. Resultados y limitaciones en [fase 5.5](phase-5-5.md).

Fase 5.4: **360 pruebas correctas — 168 Angular, 97 backend, 73 integración PostgreSQL/Socket.IO, 12 navegador Edge Chromium y 10 simulador**. Lint, tipos, build, formato de archivos del incremento y smoke correctos. Nuevas pruebas de límites inclusivos, unidades, cero, calidad inválida/ausente, antigüedad, error/ausencia de rango, separación de calibración/DEMO y actualización de cinco tarjetas. Navegador verifica cambio por telemetría y por edición de rango sin otra lectura; capturas 1440/390 px revisadas sin desbordamiento móvil. Sin cambios al backend de negocio, datos principales, cuentas, configuración o procesos locales.

Corrección posterior del simulador: **10 pruebas del simulador y 73 de integración**, lint, build, formato de archivos afectados y smoke correctos. Recuperación HTTP local real tras cuatro 503 sin duplicar identidad. Se confirmaron lecturas DEMO y actividad reciente del continuo reiniciado con autorización. El usuario también autorizó promover su cuenta local a ADMIN; se actualizó solo su rol conservando parcelas y contraseña. No guardar identificadores/correos/credenciales de esa cuenta en documentación. La UI requiere volver a iniciar sesión porque conserva el rol de la sesión anterior.

Fase 5.3: **294 pruebas correctas — 109 Angular, 97 backend, 73 integración PostgreSQL/Socket.IO, 10 navegador Edge Chromium y 5 simulador**. Lint, tipos, build y smoke aprobados; formato de archivos del incremento correcto. Nuevas pruebas de formulario, versión, conflicto, guardado incierto, permisos FARMER y auditoría desde navegador ADMIN; diálogo móvil y capturas revisadas. Sin cambios al backend de negocio, schema, migraciones, roles locales o `.env`. La matriz de navegador desactiva solo su rate limit de prueba; seguridad/integración mantiene sus pruebas reales de limitación. Detalles en [fase 5.3](phase-5-3.md).

Verificación histórica de fase 5.2:

Fase 5.2: **260 pruebas correctas — 97 backend, 78 Angular, 73 integración PostgreSQL/Socket.IO, 7 navegador Edge Chromium y 5 simulador**. Lint, tipos, build y smoke correctos. Nuevas pruebas de identidad, unidades, errores parciales, timeout, cancelación, polling, reconexión y GET sin formularios; navegador FARMER/DEMO, fallo y reintento de rangos, móvil 390 px sin desbordamiento. Sin cambios a schema/migraciones ni fixtures en la base principal. Archivos del incremento pasan Prettier; persisten avisos globales CRLF anteriores.

Verificación histórica de fase 5.1:

Fase 5.1: **225 pruebas correctas — 97 backend, 45 Angular, 73 integración PostgreSQL/Socket.IO, 5 navegador Edge Chromium y 5 simulador**. De ellas, 33 unitarias y 26 de integración son nuevas de rangos. Lint, tipos, build, validación Prisma y smoke aprobados. Migración aditiva aplicada a la base local después de verificarla en bases temporales; sin fixtures en la principal ni cambios a `.env`. OpenAPI local 0.5.0 expone rangos. Chrome no está en la ruta predeterminada: la prueba de navegador pasó al indicar Edge mediante `BROWSER_EXECUTABLE_PATH`. Detalles en [fase 5.1](phase-5.md).

Formato: archivos del incremento correctos; el chequeo global señala 125 archivos anteriores únicamente por CRLF. Verificado sin modificarlos; no confundir ese resultado con la verificación histórica de fase 4 en otro entorno.

Verificación histórica de fase 4:

**164 pruebas correctas**: 64 backend, 43 Angular, 47 integración PostgreSQL/Socket.IO, 5 navegador Chrome y 5 simulador. Lint, typecheck, build, formato, validación Prisma y smoke de salud aprobados. Ver comandos y condiciones en `docs/phase-4.md`.

El navegador real verificó login FARMER → simulador Node → NestJS → PostgreSQL → Socket.IO → Angular, lecturas parciales/antiguas, corte de red y recuperación; escritorio 1440 px y móvil 390 px sin desbordamiento. Estas pruebas usan cuentas, bases y puertos temporales, no los recursos de un desarrollador.

La auditoría de dependencias registrada mantiene 19 avisos: 16 moderados y 3 altos, ninguno crítico. No se ha aplicado `audit fix --force` ni se declara preparación para producción.

## Siguiente incremento recomendado

Continuar **fase 5 en incrementos pequeños, instrucción por instrucción**, sin implementar todo simultáneamente:

1. Revisar DERCAS §§20–23 y el esquema actual de sensores.
2. El modelo, migración, DTO, API, permisos y auditoría de rangos ya existen; no recrearlos.
3. La lectura/presentación de rangos en Angular ya existe (5.2); no recrearla ni unirla al refresco de cada evento de telemetría.
4. Edición ADMIN (5.3), clasificación de tarjetas (5.4) y líneas del histórico por vigencia (5.5) ya existen. No recrearlas ni extender el rango actual hacia el pasado. No afirmar «Normal» o salud del cultivo por una comparación numérica.
5. Desconexión (5.6) y baja humedad (5.7) ya existen. El usuario aprobó la propuesta de tres lecturas y margen positivo por sonda, incluida exclusión de reales sin calibrar, y luego autorizó aplicar la migración 5.7 localmente (realizado). Falta configurar márgenes manualmente; no inventarlos ni reiniciar simulador. Sin acciones de válvula.
6. Mantener pruebas de cambio de sensor/dispositivo/origen, datos faltantes, reconexión y errores sin fallback. Esperar autorización antes de eventos de riego, reportes u otro incremento.

No avanzar simultáneamente con todo el alcance. Diagnóstico IA, clima y predicción siguen en fases posteriores.

## Restricciones y decisiones que deben conservarse

- **El usuario exige preguntar antes de cualquier cambio adicional al alcance autorizado.** No avanzar automáticamente a otra parte de fase 5 ni cambiar roles, configuración o procesos ajenos al encargo. Tras fase 5.3 autorizó expresamente corregir/reiniciar el simulador y promover su cuenta local a ADMIN; ambas operaciones se realizaron sin ampliar acceso a parcelas ajenas. Esa autorización no habilita cambios adicionales.
- El ESP32 controla localmente el riego. No hay órdenes remotas de apertura ni política de promedio/mínimo/mayoría autorizada para las tres sondas.
- Orden del relé no demuestra apertura física ni flujo. No inventar duración, litros, ahorro o resultados agronómicos.
- Falta confirmar protocolo real, modelos y calibración del hardware y contrato del servidor receptor externo. `ExternalTelemetryAdapter` sigue como interfaz; no afirmar que está conectado.
- No elevar números a calidad calibrada por encontrar un JSON de metadatos sin semántica verificada. La UI muestra «Sin calibrar» y «Sin rango configurado» donde corresponde.
- La tarjeta IA permanece pendiente, sin resultados ficticios ni botones de cámara funcionales. El banner utiliza SVG local, no la fotografía original de referencia que no está disponible como archivo.
- Socket.IO es best-effort, sin outbox durable ni clustering; REST recupera estado. La fachada usa eventos como invalidación y consulta el último dato al servidor para conservar su desempate.
- El selector DEMO solo aparece en desarrollo y el backend también exige habilitación. No mezclar reales y simulados.
- Tras un reinicio de OpenCode se cancelaron los servidores y el simulador. El usuario pidió levantar la web/API: Docker/PostgreSQL y ambos servidores de desarrollo se iniciaron de nuevo. El simulador permanece detenido; no reiniciarlo silenciosamente. Una alerta DEMO activa en ese estado es legítima y no implica fallo físico.
- Falta un flujo administrativo completo de asignación de parcelas a agricultores. No resolverlo concediendo acceso global.

## Orientación en el código

| Ruta                                                | Responsabilidad                              |
| --------------------------------------------------- | -------------------------------------------- |
| `backend/src/auth/`, `users/`, `plots/`, `devices/` | Seguridad, propiedad y provisión             |
| `backend/src/iot-ingestion/`, `telemetry/`          | DTO, normalización, persistencia y REST      |
| `backend/src/realtime/`                             | Socket.IO, autorización y estado             |
| `backend/prisma/`                                   | Esquema y migraciones versionadas            |
| `frontend/src/app/core/telemetry/`                  | Fuentes API/demo y fachada reactiva          |
| `frontend/src/app/core/sensor-thresholds/`          | Consulta GET y ciclo independiente de rangos |
| `frontend/src/app/features/dashboard/`              | Vista y componentes agrícolas                |
| `packages/contracts/`                               | Tipos compartidos, no validación HTTP        |
| `scripts/` y `backend/test/`                        | Entorno, simulador y verificación aislada    |

## Qué no viaja por GitHub

`.env`, secretos de dispositivos, memoria local de asistentes, usuarios, lecturas y volumen PostgreSQL. Cada compañero configura su equipo según README. Consultar [CONTRIBUTING.md](../CONTRIBUTING.md) para clonar, trabajar en ramas y abrir Pull Requests.

## Instrucción sugerida para el siguiente asistente

> Lee AGENTS.md y sus documentos obligatorios; después README.md, docs/HANDOFF.md y documentación de fases 4 y 5.1–5.6. Inspecciona código y Git sin sobrescribir trabajo existente. Ya funcionan telemetría/dashboard, API/consulta/edición ADMIN, clasificación, límites históricos y alertas de desconexión: no recrearlos. El usuario exige consultar dudas/bloqueos y autorizar cambios adicionales; no continuar automáticamente con alertas de humedad, roles, configuración o reinicios del simulador. Conservar cambios previos y aislamiento por propietario/origen. No publicar, desplegar, modificar firmware ni borrar datos sin autorización. Verificar y documentar resultados reales y límites.

Actualizar este archivo al entregar la siguiente tarea; no incluir credenciales ni depender del historial privado del chat.
