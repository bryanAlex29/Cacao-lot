# Resumen para continuar CacaoSmart IoT

## Entrega a Bryan — probar antes de desarrollar

**Preparación para publicación autorizada:** código completo, migraciones,
Word y guías incluidos en el commit local de entrega de
`feature/agricultural-management`; comprobar hash con `git log -1 --oneline`.
Falta solo `git push -u origin feature/agricultural-management`.
Build/lint y 534 pruebas Angular revalidados; backend: 15 suites y 251 pruebas
correctas, 1 suite bloqueada por el TS2322 conocido de clima. No se corrigió
funcionalidad ni se hizo push. La inspección siguiente es anterior al commit.

Guía actual de preparación, pruebas manuales/automáticas, límites y publicación:
[ENTREGA_BRYAN.md](ENTREGA_BRYAN.md). Prompt copiable:
[PROMPT_BRYAN.md](PROMPT_BRYAN.md). Versión Word en la raíz:
`CacaoSmart_Avance_y_Traspaso_Bryan.docx`.

Al redactarla, los avances recientes seguían sin commit en
`feature/agricultural-management` sobre `9fe2dc1`; subir solo el documento no
transfiere el código. No se hizo commit/push. Bryan debe recibir el commit
publicado completo, probar primero en localhost y reportar antes de desarrollar.
Las instrucciones inferiores sobre actualizar solo main y no requerir nuevas
migraciones corresponden a 5.13/5.14: **no son suficientes para IA/clima**.
El acceso/login por LAN quedó pendiente por decisión del usuario; no desactivar
la protección de origen para solucionarlo.

## Estado de la entrega

**Renovación visual, incremento 6 + revisión transversal (2026-11-24):** usuario
autorizó Clima/estado y adaptar el conjunto al objetivo visual. Clima con filtro
local sin peticiones, procedencia y estados de calidad; estado técnico diferencia
API/PostgreSQL y corrige textos de fases antiguas. Estructura compartida
`shared/ui/workspace.css`: sidebar 240 px y corte móvil 900 px, márgenes comunes
en Dashboard/Parcelas/IA/Clima; encabezados y tarjetas armonizados, salto a
contenido en IA/Clima. **534 Angular + 43 Edge correctas**; build/lint/tipos
frontend/formato/diff/smoke y web HTTP 200 correctos.
Ver [archivos, alcance y revisión](visual-refresh-6.md). Capturas sintéticas
revisadas en `Temp/opencode/cacaosmart-browser-ayRRoi`. Sin cambios API,
permisos, reglas físicas, datos principal, dependencias, commit/push o despliegue.
Pendiente revisión del usuario y aportar imagen original/fotografías para
fidelidad exacta. OpenAI continúa pospuesto; no hay predicción hídrica validada.

**Renovación visual, incremento 5 (2026-11-24):** autorizado con «Sigue haciendo».
IA con guía de captura/vista previa, resultado estructurado y estados del
historial; login/registro con tarjeta coherente, foco/ayuda y nota de sesión
corregida (renovable hasta 8 horas, sin tocar autenticación).
**530 Angular + 41 Edge correctas**; build/lint/tipos frontend/smoke/HTTP 200
correctos. Ver [alcance, archivos y revisión](visual-refresh-5.md).
Sin cambios de contratos, cuotas, privacidad, permisos, dependencias o datos
principal; sin commit/push. Próximo sugerido: Clima/estado del sistema.
OpenAI, captura original y fotografías siguen pendientes.

**Renovación visual, incremento 4 (2026-11-24):** usuario autorizó formularios e
inventario de Parcelas/dispositivos. Alta/edición/archivo y habilitación con
acciones coherentes, confirmaciones en línea, foco y Escape seguro. Equipos antes
de administración; alta plegada, clave nueva visible por separado y conservada
al refrescar inventario hasta ocultarla. **526 Angular + 40 Edge correctas**;
build/lint/tipos frontend correctos. Ver [alcance y revisión](visual-refresh-4.md).
Sin API/dependencias/permisos ni datos nuevos en principal; cambios sin commit.
Pendiente revisión manual; siguiente paso propuesto: presentación de IA y
login/registro. OpenAI, captura original y fotografías siguen pendientes.

**Renovación visual, incremento 3 (2026-11-24):** usuario aprobó el incremento 2.
Encabezado compartido de parcela/cuenta en Dashboard, Parcelas, IA y Clima;
enlace real para cambiar parcela, rol y salida comunes. Solo Dashboard recibe
conexión/fecha de telemetría; sin estados decorativos en las otras pantallas.
Salida desde IA/Clima limpia estado mediante los servicios de sesión existentes.
**518 Angular + 40 Edge correctas**, build/lint/tipos frontend correctos.
Ver [alcance, pruebas y revisión](visual-refresh-3.md). Sin datos de prueba en
principal, cambios de API, dependencias, commit o push. Pendiente revisión manual;
siguiente incremento sugerido: formularios/diálogos/inventario de Parcelas y
dispositivos. Captura original y fotografías siguen pendientes.

**Renovación visual, incremento 2 (2026-11-24):** compactados los paneles de
alertas sin esconder condición, fechas o reconocimiento; evidencia y reglas
desplegables con teclado. Filtros, acciones y tablas de histórico/riego/CSV
unificados mediante estilos compartidos. **506 Angular + 38 Edge correctas**;
build/lint/tipos frontend correctos. Sin cambios en API, consultas, permisos,
reglas físicas ni base principal. Ver [alcance y revisión](visual-refresh-2.md).
Pendiente revisión manual; siguiente paso: encabezado común de parcela/cuenta.
Captura original y fotografías siguen pendientes. Los resultados inferiores
corresponden a entregas anteriores; no sumar sus pruebas.

**Renovación visual, incremento 1 (2026-11-24):** usuario autorizó iniciar el
rediseño y abrir servicios/web. Navegación compartida entre dashboard, Parcelas,
IA y Clima; iconos SVG, menú móvil, ajustes de tarjetas/formularios/comparación y
rangos con detalles desplegables. No es el rediseño completo: falta la captura
original y las fotografías, además de compactar alertas y pulir los demás
paneles. Ver [alcance, revisión y pendientes](visual-refresh-1.md). Conservar todo
el trabajo previo sin commit; OpenAI continúa pospuesto.
Verificación: 499 Angular + 38 Edge correctas, build/lint/tipos frontend/smoke
correctos. La suite global sigue bloqueada por TS2322 en una prueba de clima no
modificada (`backend/src/weather/open-meteo.spec.ts:37`); no confundir con una
regresión visual ni declarar todas las pruebas aprobadas.

**Actualización local 6.3:** comparación privada de dos fotografías de la misma parcela autorizada e implementada. Selección entre páginas/filtros, fotos/fechas/notas/resultados DEMO, intercambio A/B y limpieza; permisos y vigencia revalidados por tarjeta. Sin análisis nuevo, migraciones o dependencias. **960 pruebas aprobadas** (492 Angular, 250 backend, 171 integración, 37 Edge, 10 simulador); build/tipos/lint correctos. Ver [guía y revisión manual](phase-6-3.md). OpenAI explícitamente en espera. Pendiente revisión manual del usuario; cambios sin commit/push.

**Actualización local 6.2:** usuario pidió posponer OpenAI y autorizó filtros. Historial de diagnósticos con fechas Desde/Hasta inclusivas por creación y estado, periodo fijo UTC, paginación/actualización conservadas y limpieza. Sin migraciones/dependencias ni fixtures en principal. **OpenAI a la espera de autorización futura**, sin claves/costos externos. Ver [guía y revisión](phase-6-2.md). 935 pruebas correctas; pendiente revisión manual 6.2.

**Actualización local 6.1:** usuario aprobó 5.15–5.16 y autorizó diagnóstico fotográfico. Implementados captura/subida, consentimiento, sanitización, almacenamiento privado, resultado simulado no concluyente, historial/eliminación, cuota e idempotencia por parcela propia ADMIN/FARMER. **No conecta OpenAI ni genera costos.** Ver [guía y límites](phase-6-1.md). Migración aplicada preservando 14 tablas anteriores y `.env`; sin diagnósticos de prueba en principal. Pendiente revisión manual 6.1; entregas inferiores son históricas.

**Actualización local 5.15–5.16:** usuario revisó y aprobó 5.13/5.14 y autorizó avanzar en gestión. Implementados formularios ADMIN propietario para alta de dispositivos con clave de una sola visualización, habilitación confirmada, edición y archivo lógico de parcelas. FARMER mantiene permisos anteriores. Sin migraciones, dependencias, provisión en la principal ni cambios de rol. Ver [alcance, límites y revisión manual](phase-5-15-16.md). Cambios en `feature/agricultural-management`, aún sin commit/push. Las cifras/estados de publicación siguientes son históricos de 5.14.

**Entrega vigente: fases 5.13 y 5.14 incluidas en este código.** El usuario autorizó publicarlas en GitHub para que continúe su compañero. No hay nuevas migraciones ni dependencias respecto a `3ba7bf4`. Los documentos de fase registran su estado de validación previo a esta publicación; consultar Git para el commit y la sincronización remota.

**Fase 5.14:** inventario de dispositivos/sensores en Mis parcelas, solo lectura por propietario, paginado y con REAL/DEMO y último contacto. Ver [alcance y prueba manual](phase-5-14.md). Validación ejecutada: **420 Angular + 33 Edge**; tipos/lint/build/smoke correctos. Sin cambios de permisos/provisión. La publicación no acredita revisión manual del usuario: confirmar el siguiente incremento antes de implementarlo.

**Fase 5.13:** fechas personalizadas para riego observado, con periodo fijo, validación y reset a 24 h al cambiar selección. Validado entonces con **791 pruebas correctas**; ver [prueba manual y detalles](phase-5-13.md). Usuario autorizó continuar después de esta entrega; no se confirmó una prueba manual específica. La descripción de 5.12/779 pruebas de abajo corresponde a la entrega anterior `3ba7bf4`.

Base anterior: **fase 5.12 y corrección de renovación de sesión**. Stack: Angular + NestJS + PostgreSQL/Prisma, con Socket.IO. Validación histórica de esa entrega: **779 pruebas correctas** (209 backend, 379 Angular, 151 integración, 30 navegador Edge y 10 simulador); tipos, lint, build, Prisma, formato y smoke correctos. Detalles y resultados históricos en [HANDOFF](HANDOFF.md).

## Lo implementado

- Registro FARMER, login, permisos por propietario y rol, Argon2id y límites de solicitudes. ADMIN no tiene acceso global a parcelas ajenas.
- JWT de 15 minutos renovables automáticamente mediante cookie HttpOnly/Strict, sesión absoluta de 8 horas y revocación al salir. Recuperación tras recarga y reautenticación de Socket.IO al renovar. Ver [sesiones](session-renewal.md).
- Listado y creación de parcelas propias desde Angular para ADMIN y FARMER, con ubicación escrita y superficie opcional. No hay Google Maps.
- API de dispositivos y seis sensores; credencial IoT independiente, ingesta transaccional/idempotente y separación real/DEMO.
- Inventario Angular por parcela (5.14), con sensores, habilitación y conexión al consultar; sin claves, creación o reasignación.
- Simulador determinista, REST y Socket.IO autenticados, reconexión/resincronización y estados de conexión/calidad. Prototipo software probado con simulador, no con hardware auténtico.
- Dashboard responsive con tres zonas independientes, ambiente, lluvia, orden del relé, gráfico y tabla. Sidebar estable en escritorio y navegación Monitoreo/Historial/Riego/Alertas/Reportes sin perder sesión.
- Rangos min/max por sensor/variable, edición ADMIN propietario, control de concurrencia, auditoría y límites históricos por vigencia.
- Alertas persistentes de desconexión y baja humedad por sonda con reconocimiento, antirrebote e histéresis explícita. Sin calibración/rango/margen no se inventa configuración.
- Historial paginado de riego **observado** a partir de lecturas, incluyendo primera observación, cambios y null; no son sesiones físicas de riego.
- Eventos separados `telemetry.updated`, `device.status`, `irrigation.updated` y `sensor.status`; REST sigue siendo la autoridad tras pérdidas o mensajes atrasados.
- CSV de lecturas y riego observado con filtros, permisos, máximo 31 días/10000 filas y protección de fórmulas.
- Fechas Desde/Hasta para gráfico/tabla de humedad: hora local → UTC, máximo 31 días y periodo fijo al paginar/actualizar/reconectar. Presets 24 h/7/30 días conservados.

## Lo que falta

1. **Revisión manual de 6.3**: Diagnóstico IA · DEMO → historial → elegir dos fotos → Ver comparación → intercambiar/quitar/limpiar.
2. El mock seguirá dando respuestas genéricas similares: es esperado, no evalúa enfermedades reales. No modificarlo para inventar resultados variados. Comparación manual ya implementada, no infiere evolución.
3. Gestión adicional: asignación a agricultores ajenos al administrador, recuperación/rotación de claves, restauración, edición de sensores/intervalos y configuración requieren diseño y permisos explícitos. No solucionarlo otorgando ADMIN o acceso global.
4. Diagnóstico IA: comparación y filtros ya existen. **OpenAI real pospuesto explícitamente por el usuario**, solo retomarlo con autorización, consentimiento externo nuevo, presupuesto y configuración backend.
5. Clima público con procedencia/licencia/unidades verificadas; predicción con target/horizonte, baseline/regresión y evaluación cronológica. No existen resultados predictivos validados.
6. Integración auténtica ESP32/receptor: contrato, protocolo, identidad, frecuencia, muestras y calibración. No modificar firmware ni política multizona sin autorización y prueba de seguridad.
7. Litros, duración física y ahorro: faltan evidencia temporal, caudal calibrado, área/eficiencia donde corresponda y línea base. Mantener «No disponible»; una orden de relé no confirma flujo.
8. Preparación operativa: HTTPS/hosting, respaldos/restauración probados, revisión de dependencias, recuperación/verificación de correo, administración/retención de sesiones y escala de Socket.IO. No declarar listo para producción.

## Cómo retomar en otro equipo

Leer primero [AGENTS.md](../AGENTS.md) y sus documentos obligatorios, luego [README](../README.md), [HANDOFF](HANDOFF.md) y [matriz de requisitos](requirements-status.md). Conservar cambios locales del compañero; no usar reset para actualizar.

Si ya está clonado y la rama puede actualizarse sin conflictos:

```powershell
git switch main
git pull --ff-only origin main
```

Si ya se trabaja sobre `3ba7bf4` con la migración de sesiones aplicada, 5.13/5.14 no requieren instalaciones ni migraciones nuevas: reiniciar API/Angular y comprobar las dos rutas de prueba indicadas arriba. Si hay cambios locales, conservarlos e integrarlos antes de actualizar; no usar reset ni forzar el pull.

Si no está clonado:

```powershell
git clone https://github.com/bryanAlex29/Cacao-lot.git
cd Cacao-lot
```

Desde la raíz, con Node.js 22 compatible y Docker disponibles, seguir el README. Para una copia nueva:

```powershell
node scripts/setup-env.mjs
node scripts/setup-auth-env.mjs
npx --yes npm@11.6.2 ci
npm run db:generate
npm run db:validate
npm run db:up
npm run db:migrate
```

**La nueva migración `20261123020000_auth_sessions` es necesaria para login y renovación.** Usar migrate deploy mediante el comando anterior, nunca reset o db push. En la copia local de entrega se aplicó preservando las 13 tablas anteriores y el entorno privado; cada equipo debe aplicarla a su propia base.

Iniciar `npm run dev:backend` y `npm run dev:frontend` en terminales separadas. Abrir http://localhost:4200 y comprobar `/estado`. Las funciones de cookie requieren el origen frontend configurado y proxy del mismo origen; no ampliar CORS para ocultar errores.

Continuar por incrementos verificables. Gestión, diagnóstico simulado, filtros 6.2 y comparación 6.3 ya existen; pendiente revisión manual de comparación. No recrearlos ni conectar proveedores externos: OpenAI está explícitamente pospuesto. Ver [CONTRIBUTING](../CONTRIBUTING.md) para trabajo en ramas y Pull Requests.

## Lo que GitHub no transfiere

`.env`, claves IoT, `.local/simulator.json`, usuarios, parcelas, lecturas, imágenes privadas y volumen PostgreSQL **no se publican**. El compañero genera su entorno y cuentas locales según README. No copiar credenciales por chat/GitHub ni asumir que la parcela DEMO del otro equipo aparecerá al clonar.

No iniciar simulador, crear fixtures en la principal, configurar márgenes, cambiar roles, desplegar, tocar firmware o borrar datos sin autorización. El usuario quiere probar cada incremento personalmente. Sin caudal/calibración/línea base no inventar métricas; IA y predicción nunca controlan la válvula automáticamente.
