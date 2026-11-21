# Traspaso de trabajo — CacaoSmart IoT

## Punto de partida

**Estado: fase 4 implementada y verificada.** Monorepositorio Angular + NestJS + PostgreSQL/Prisma. Leer primero [AGENTS.md](../AGENTS.md), sus documentos enlazados y [README](../README.md). DERCAS es la fuente funcional; este archivo resume el estado, no reemplaza requisitos.

## Qué funciona

- Registro público solo FARMER e inicio de sesión JWT de 15 minutos; contraseñas Argon2id. Nuevas contraseñas: 8–128 caracteres, mayúscula y símbolo, sin requisito adicional de dígitos. Login existente conserva acceso.
- Parcelas, dispositivos y seis identidades de sensor con permisos por propietario. ADMIN no tiene acceso global a parcelas ajenas. No hay asignación automática de parcelas al registrarse.
- Ingesta IoT v1.2 con `X-Device-Id` UUID y `X-Device-Key` independiente del JWT. Credenciales almacenadas como hash, origen real/demo fijado al provisionar.
- Persistencia atómica de evento y tres filas de suelo. Unicidad dispositivo/evento, reintento idéntico sin efectos, conflicto 409 al cambiar datos con el mismo ID. Lecturas parciales mantienen null; las antiguas no desplazan la última.
- Snapshot e histórico REST autorizados, paginación y filtros. Orden determinista por tiempo efectivo, recepción y secuencia interna.
- Socket.IO autenticado y revalidado por parcela/origen/dispositivo. Solo publica tras persistir eventos únicos. Reconexión, recuperación REST y estado de conexión.
- Dashboard en `/parcelas/:id/dashboard`, accesible desde Mis parcelas: tres zonas, ambiente, lluvia, orden del relé, gráfico de tres series y tabla. Datos DEMO explícitos, sin fallback inventado.
- Simulador local determinista, provisión DEMO explícita para un propietario existente. Credenciales privadas en `.local`; nunca se crean automáticamente en una base nueva.

Detalles de implementación: [fase 2](phase-2.md), [registro](registration.md), [fase 3](phase-3.md) y [fase 4](phase-4.md).

## Última verificación funcional registrada

**164 pruebas correctas**: 64 backend, 43 Angular, 47 integración PostgreSQL/Socket.IO, 5 navegador Chrome y 5 simulador. Lint, typecheck, build, formato, validación Prisma y smoke de salud aprobados. Ver comandos y condiciones en `docs/phase-4.md`.

El navegador real verificó login FARMER → simulador Node → NestJS → PostgreSQL → Socket.IO → Angular, lecturas parciales/antiguas, corte de red y recuperación; escritorio 1440 px y móvil 390 px sin desbordamiento. Estas pruebas usan cuentas, bases y puertos temporales, no los recursos de un desarrollador.

La auditoría de dependencias registrada mantiene 19 avisos: 16 moderados y 3 altos, ninguno crítico. No se ha aplicado `audit fix --force` ni se declara preparación para producción.

## Siguiente incremento recomendado

Empezar **fase 5 por rangos min/max por sensor y variable**, antes de abordar todas las alertas y reportes:

1. Revisar DERCAS §§20–23 y el esquema actual de sensores.
2. Acordar un incremento pequeño con modelo/migración aditiva, DTO, permisos por propietario y auditoría.
3. Validar `min < max` y unidades compatibles; distinguir rango agronómico de calibración física.
4. Incorporar clasificación y líneas de umbral al dashboard solamente cuando exista configuración.
5. Probar permisos, rangos inválidos, datos faltantes y actualización de UI. Documentar antes de pasar a alertas/eventos de riego/reportes.

No avanzar simultáneamente con todo el alcance. Diagnóstico IA, clima y predicción siguen en fases posteriores.

## Restricciones y decisiones que deben conservarse

- El ESP32 controla localmente el riego. No hay órdenes remotas de apertura ni política de promedio/mínimo/mayoría autorizada para las tres sondas.
- Orden del relé no demuestra apertura física ni flujo. No inventar duración, litros, ahorro o resultados agronómicos.
- Falta confirmar protocolo real, modelos y calibración del hardware y contrato del servidor receptor externo. `ExternalTelemetryAdapter` sigue como interfaz; no afirmar que está conectado.
- No elevar números a calidad calibrada por encontrar un JSON de metadatos sin semántica verificada. La UI muestra «Sin calibrar» y «Sin rango configurado» donde corresponde.
- La tarjeta IA permanece pendiente, sin resultados ficticios ni botones de cámara funcionales. El banner utiliza SVG local, no la fotografía original de referencia que no está disponible como archivo.
- Socket.IO es best-effort, sin outbox durable ni clustering; REST recupera estado. La fachada usa eventos como invalidación y consulta el último dato al servidor para conservar su desempate.
- El selector DEMO solo aparece en desarrollo y el backend también exige habilitación. No mezclar reales y simulados.
- Falta un flujo administrativo completo de asignación de parcelas a agricultores. No resolverlo concediendo acceso global.

## Orientación en el código

| Ruta                                                | Responsabilidad                           |
| --------------------------------------------------- | ----------------------------------------- |
| `backend/src/auth/`, `users/`, `plots/`, `devices/` | Seguridad, propiedad y provisión          |
| `backend/src/iot-ingestion/`, `telemetry/`          | DTO, normalización, persistencia y REST   |
| `backend/src/realtime/`                             | Socket.IO, autorización y estado          |
| `backend/prisma/`                                   | Esquema y migraciones versionadas         |
| `frontend/src/app/core/telemetry/`                  | Fuentes API/demo y fachada reactiva       |
| `frontend/src/app/features/dashboard/`              | Vista y componentes agrícolas             |
| `packages/contracts/`                               | Tipos compartidos, no validación HTTP     |
| `scripts/` y `backend/test/`                        | Entorno, simulador y verificación aislada |

## Qué no viaja por GitHub

`.env`, secretos de dispositivos, memoria local de asistentes, usuarios, lecturas y volumen PostgreSQL. Cada compañero configura su equipo según README. Consultar [CONTRIBUTING.md](../CONTRIBUTING.md) para clonar, trabajar en ramas y abrir Pull Requests.

## Instrucción sugerida para el siguiente asistente

> Lee AGENTS.md y los documentos que exige; después README.md, docs/HANDOFF.md y docs/phase-4.md. Inspecciona el código y Git sin sobrescribir trabajo existente. La fase 4 está implementada; propón un incremento verificable de fase 5, comenzando por rangos min/max por sensor con permisos y auditoría. No implementes todo el alcance a la vez. No publiques, despliegues, modifiques firmware ni borres datos sin autorización. Verifica herramientas y ejecuta las pruebas pertinentes; documenta resultados reales y pendientes.

Actualizar este archivo al entregar la siguiente tarea; no incluir credenciales ni depender del historial privado del chat.
