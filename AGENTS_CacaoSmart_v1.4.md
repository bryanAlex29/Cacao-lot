# AGENTS.md — Instrucciones para OpenCode / agentes de desarrollo

## Contexto
Desarrollar **CacaoSmart IoT**, sistema de monitoreo y riego inteligente para cacao en Chone, Manabí, para TerriTech Hackathon CITIC 2026. El ESP32 con **tres sensores independientes de humedad del suelo**, temperatura/humedad ambiental y lluvia controla localmente una electroválvula mediante relé. La aplicación web muestra mediciones, riego, alertas e indicadores.

**Fuente de verdad funcional:** [contexto/DERCAS_CacaoSmart_v1.4.md](contexto/DERCAS_CacaoSmart_v1.4.md), denominado **DERCAS** en este documento. Punto de entrada para agentes: [AGENTS.md](AGENTS.md). No reemplazar el stack ni inventar métricas. El prototipo físico funciona, pero integración web, medición de caudal y hosting aún no están confirmados.

## Stack obligatorio
- Frontend: **Angular + TypeScript** (standalone components, Angular Router, Reactive Forms).
- Backend: **Node.js + TypeScript + NestJS**.
- Persistencia: **PostgreSQL + Prisma**.
- IoT: ESP32 existente; integración inicial por HTTPS JSON, previa revisión del firmware.
- Herramientas: Git, npm, Docker Compose, ESLint, Prettier, Jest/Vitest según compatibilidad, Swagger.

No usar React, Next.js, Firebase, MongoDB o Supabase como sustitutos sin autorización explícita.

## Estructura sugerida
```text
cacaosmart-iot/
├── AGENTS.md                 # punto de entrada para agentes
├── AGENTS_CacaoSmart_v1.4.md # instrucciones completas
├── contexto/
│   ├── DERCAS_CacaoSmart_v1.4.md
│   └── DISENO_VISUAL_CacaoSmart.md
├── README.md
├── .env.example
├── docker-compose.yml
├── frontend/                 # Angular
│   └── src/app/
│       ├── core/             # auth, interceptors, guards, API clients
│       ├── shared/           # componentes reutilizables
│       └── features/         # dashboard, plots, monitoring, irrigation, alerts, reports
├── backend/                  # NestJS
│   ├── prisma/               # schema + migrations
│   └── src/
│       ├── auth/
│       ├── users/
│       ├── plots/
│       ├── devices/
│       ├── telemetry/
│       ├── irrigation/
│       ├── alerts/
│       └── reports/
├── firmware/                 # solo si el usuario aporta código del ESP32
└── docs/
```

## Reglas de trabajo del agente
1. Antes de implementar, leer DERCAS, `AGENTS.md`, este documento y el código existente. No sobrescribir trabajo del usuario.
2. Presentar un plan breve con archivos afectados y criterios de aceptación para cambios importantes.
3. Trabajar en incrementos pequeños, compilables y verificables; completar una funcionalidad antes de iniciar otra.
4. Respetar Angular para la UI, NestJS para la API y PostgreSQL para almacenamiento.
5. Usar nombres de código en inglés y textos visibles al agricultor en español.
6. Aplicar tipado estricto; no usar `any` sin justificación.
7. Mantener controladores ligeros, lógica en servicios, DTO validados y acceso a datos encapsulado.
8. Nunca almacenar secretos en el repositorio; mantener `.env.example` sin credenciales reales.
9. Crear migraciones para cada cambio de esquema; no usar sincronización destructiva en producción.
10. Probar permisos por propietario, validaciones, reglas de riego y duplicación de telemetría.
11. Los datos demo deben identificarse claramente y no mezclarse con mediciones reales.
12. No inventar litros, porcentajes de ahorro ni predicciones. Si faltan datos, mostrar «No disponible» o «Estimación» con método.
13. El control seguro del relé y la electroválvula permanece en el ESP32; no convertir la disponibilidad del backend en requisito para cerrar el riego.
14. No ejecutar migraciones destructivas, borrar datos, desplegar a producción ni cambiar firmware sin confirmación.
15. No introducir dependencias innecesarias. Documentar comandos y variables requeridas.

## Diseño frontend
Replicar el concepto visual aprobado: sidebar verde oscuro, encabezado de parcela, tarjetas de humedad del suelo, temperatura, humedad ambiental y lluvia; estado del riego, gráfico de humedad, consumo estimado, alertas y ODS 6/12/13. Diseño responsive y accesible. Priorizar información real con timestamp y estado de conexión. No presentar mockups como resultados de campo.

**Referencia visual documentada:** leer [contexto/DISENO_VISUAL_CacaoSmart.md](contexto/DISENO_VISUAL_CacaoSmart.md) antes de implementar o modificar la UI. Describe la captura aportada por el usuario: paleta aproximada, distribución, menú, tipografía y componentes, incluida la tarjeta de diagnóstico IA en lugar del circuito. Colores y medidas son estimaciones; la captura no confirma interacciones ni resultados reales. Los requisitos funcionales y de seguridad de [DERCAS](contexto/DERCAS_CacaoSmart_v1.4.md) prevalecen sobre los valores ilustrativos del mockup.

## API y seguridad
- Prefijo `/api/v1`.
- JWT para usuarios; credencial independiente por dispositivo, almacenada como hash.
- Autorización por parcela en todas las consultas.
- Validar payloads y rangos; rate limiting y logs sin datos sensibles.
- Mantener OpenAPI actualizado.
- Evitar acciones remotas sobre válvula en MVP hasta definir medidas de seguridad.

## Flujo de trabajo con Git
- Partir de la rama de trabajo existente; si se usa `develop`, crear rama `feature/<tema>`.
- Commits descriptivos y acotados (ej.: `feat(frontend): add monitoring dashboard`).
- Ejecutar lint, pruebas y build antes de declarar tarea terminada.
- No hacer `push`, abrir PR ni fusionar ramas sin instrucción explícita y acceso configurado.
- Al terminar, reportar: cambios, archivos, comandos ejecutados, resultados, riesgos y próximos pasos.

## Orden de tareas recomendado
1. Inspeccionar repositorio y preguntar solo por decisiones bloqueantes.
2. Crear Angular, NestJS, PostgreSQL y Docker Compose si aún no existen.
3. Definir esquema Prisma y migración inicial.
4. Implementar auth, parcelas y dispositivos.
5. Crear ingesta de telemetría con API key de dispositivo.
6. Construir dashboard con modo demo etiquetado y luego API real.
7. Añadir historial, alertas, eventos de riego y configuración de umbrales.
8. Validar con ESP32 real, pruebas y documentación.

## Definición de terminado
Una tarea está terminada solo si cumple los criterios de aceptación de DERCAS, compila, tiene pruebas pertinentes, no introduce secretos, respeta permisos y documenta cómo verificarla. Si no fue posible probar algo, indicarlo expresamente.

## Primer encargo sugerido para OpenCode
> Lee AGENTS.md y sus documentos enlazados completos. Inspecciona el proyecto sin sobrescribir archivos y verifica Node.js, npm, Git, Docker y versiones compatibles antes de instalar dependencias. Propón y ejecuta únicamente la fase 1: estructura Angular + NestJS + PostgreSQL/Prisma con Docker Compose, configuración de entorno validada, README y endpoints de salud diferenciando servicio activo y base disponible. Prepara la separación de datos demo/reales y contratos sin implementar todavía todas las funciones. Ejecuta lint, pruebas básicas, build y arranque local; reporta resultados reales y bloqueos antes de continuar.

## Integración en tiempo real: instrucciones obligatorias (versión 1.1)
- Desde la primera fase, diseñar Angular para **datos reales y simulados intercambiables** mediante una abstracción `TelemetryDataSource`. No incrustar arrays de datos de ejemplo en los componentes de producción.
- Crear en NestJS módulos `telemetry`, `realtime` y `integrations` con un contrato interno normalizado. La fuente podrá ser el ESP32 directo o un servidor receptor externo; usar adaptadores, no acoplar controladores ni UI a un proveedor concreto.
- Implementar REST para snapshot e histórico y Socket.IO para actualizaciones en vivo; un evento solo se publica tras validar y persistir. Autenticar socket con JWT y verificar permisos por parcela al unirse a salas.
- Incorporar estado de conexión, última actualización, reconexión con backoff y resincronización REST; impedir que eventos atrasados reemplacen lecturas más nuevas.
- Proporcionar un **simulador local de telemetría** que envíe payloads válidos al mismo endpoint del ESP32, con credencial de prueba solo en desarrollo; documentar comando para iniciarlo y detenerlo.
- Ingesta idempotente con `eventId` y unicidad por dispositivo; diferenciar `recordedAt` y `receivedAt`; manejar timestamp no fiable y mensajes fuera de orden.
- Prohibido mostrar consumo o ahorro como medición real sin caudal calibrado y línea base. Nunca activar la electroválvula desde el frontend por defecto: el ESP32 conserva la decisión local.
- No asumir URL, protocolo ni formato del servidor receptor existente. Definir `ExternalTelemetryAdapter` y un contrato documentado, y dejar configuración en variables de entorno (`IOT_INGEST_MODE`, `EXTERNAL_IOT_BASE_URL`, `EXTERNAL_IOT_TOKEN` como ejemplos; secretos nunca en Git).
- Antes de declarar lista la integración, demostrar: simulador -> NestJS -> PostgreSQL -> Socket.IO -> Angular, reconexión, duplicados, permisos por parcela y estado offline.

### Prioridad de ejecución revisada
1. Estructura Angular/NestJS/PostgreSQL, migraciones y entorno.
2. Contratos DTO, modelos de dispositivo y lectura, ingesta autenticada e idempotente.
3. Simulador IoT y adaptador de servidor externo (interfaz + implementación pendiente de contrato real).
4. REST snapshot + histórico y WebSocket por parcela.
5. Dashboard Angular con servicio reactivo, estados online/stale/offline y selector de origen solo en desarrollo.
6. Alertas, eventos de riego, indicadores y pruebas integrales.
7. Conectar el servidor receptor real **cuando el usuario facilite protocolo, endpoint y muestra de datos**, sin reescribir la interfaz.

### Encargo de integración posterior a la base y seguridad
> Lee AGENTS.md y sus documentos enlazados completos. Una vez verificadas la base técnica, la autenticación y los permisos, implementa incrementalmente la telemetría con el contrato canónico de las secciones 18.3 y 17.8 de DERCAS: ingesta idempotente, simulador de tres sensores, consulta REST, gateway Socket.IO autenticado y dashboard con fuente demo/real intercambiable. No supongas datos del servidor receptor externo; deja su adaptador preparado. Prueba el recorrido simulador → API → PostgreSQL → WebSocket → Angular y documenta resultados. Este es un objetivo de varias fases, no el primer incremento. No modifiques el firmware existente.


## Actualización v1.2 — implementación de la maqueta de tres zonas

1. Antes de programar, leer las **secciones 17–20 de DERCAS** y la referencia visual. La vista vigente sustituye a cualquier dashboard anterior con una sola humedad de suelo o circuito de hardware.
2. Crear modelos TypeScript compartidos (o contratos generados desde OpenAPI): `SoilSensorId = 'soil_1' | 'soil_2' | 'soil_3'`, `SoilMoistureMap`, `TelemetryReading`, `ValveState`, `SensorHealth`, `DashboardSnapshot`. No agregar `soilMoisturePct` como único valor canónico.
3. Implementar el backend NestJS con módulos `iot-ingestion`, `telemetry`, `plots`, `irrigation`, `alerts`, `realtime`, `auth` y Prisma. Guardar lecturas por sensor y sus zonas, índices temporales y deduplicación por `deviceId + eventId`.
4. Desacoplar `ExternalTelemetryAdapter` de `DirectEsp32TelemetryAdapter`; ambos producen el mismo DTO canónico. La conexión al servidor externo será configurable mediante variables de entorno; no inventar URL ni credenciales.
5. Socket.IO autenticado por JWT y autorizado por parcela: emitir `telemetry.updated`, `irrigation.updated`, `sensor.status`. Primero persistir, luego publicar. REST aporta snapshot y recuperación.
6. Angular: componentes `soil-sensor-card` (x3), `environment-card`, `rain-card`, `irrigation-status`, `soil-history-chart` (3 series), tarjeta de diagnóstico IA, `water-metrics`, `alerts-panel`, `ods-panel`, y navegación lateral. No mostrar `iot-architecture` ni circuito en el dashboard; la arquitectura técnica permanece documentada. Usar un servicio `TelemetryFacade` para que UI no dependa de HTTP/WebSocket/demo.
7. Simulador determinista que envíe **tres** lecturas por evento con IDs estables y variaciones independientes; etiquetar «Datos simulados». Implementar estados sin datos, carga, desconexión, error y reintento.
8. El control de la electroválvula es **local al ESP32**; no imponer promedio/mínimo/mayoría para disparar riego sin decisión del equipo. Si solo hay estado del relé, etiquetar «Orden de apertura» y no «Válvula físicamente abierta».
9. No implementar litros reales sin caudalímetro o caudal calibrado; no afirmar ahorro porcentual sin línea base documentada. Mantener indicadores ocultos o «No disponible» en producción sin datos suficientes.
10. Tests: tres sondas independientes, lectura parcial, fuera de orden, duplicada, desconexión por sonda, reconexión Socket.IO, aislamiento por parcela y persistencia PostgreSQL. Mantener firmware intacto hasta revisar pinout, tensión de válvula y protocolo existente.

### Orden de ejecución recomendado a OpenCode
- Fase A: inspeccionar repositorio y registrar decisiones/pendientes sin borrar trabajo existente.
- Fase B: modelos Prisma + migraciones + contratos y simulador de tres sensores.
- Fase C: endpoints REST + Socket.IO + pruebas de autenticación, deduplicación y persistencia.
- Fase D: Angular fiel a la última vista, responsive, con tres zonas y estados de conexión.
- Fase E: integrar hardware/servidor receptor real solo al recibir contrato auténtico; probar extremo a extremo.
- Al finalizar cada fase: ejecutar lint, tests y build; documentar comandos, resultados, archivos modificados y pendientes. No afirmar pruebas que no se ejecutaron.


## Extensión v1.4 — Diagnóstico visual mediante GPT
**Obligatorio:** leer la sección 19 de DERCAS antes de programar el módulo; las preguntas abiertas están en las secciones 15 y 23. Preservar Angular + NestJS + PostgreSQL + Prisma y el pipeline de sensores en tiempo real. No cambiar el firmware ni la lógica local de riego por agregar IA.

### UI
- Agregar `features/ai-diagnosis/` con rutas `/diagnostico-ia`, componentes `image-capture`, `image-preview`, `analysis-result`, `diagnosis-history` y servicio tipado.
- En el dashboard **reemplazar solamente el panel de esquema/circuito IoT** por tarjeta «Diagnóstico de plantas con IA» con foto, botones de cámara/subida, síntomas y acciones sugeridas.
- Mantener tarjetas de 3 sensores (A/B/C), temperatura, humedad ambiental, lluvia, estado de válvula, gráficos, alertas, consumo/ahorro y ODS.
- Mostrar estado de carga, errores, imagen no concluyente, fecha, parcela, y etiqueta «Demostración» para datos ficticios.
- No fingir que botones funcionan: conectar a `input type=file` y endpoints reales o indicar modo demo explícitamente.

### Backend
- Crear módulo `ai-diagnostics/` (`controller`, `service`, DTOs, schema de salida, provider de OpenAI, repositorio).
- El frontend **nunca** invoca directamente OpenAI; usar `OPENAI_API_KEY` exclusivamente en NestJS.
- Aislar `VisionAnalysisProvider` para intercambiar mock de desarrollo por OpenAI real sin alterar controladores ni Angular.
- Procesar imagen solo después de validación de tamaño, tipo real, JWT, propiedad de parcela, cuota y consentimiento informado.
- Solicitar a GPT: descripción de síntomas visibles, causas plausibles con incertidumbre, pasos de observación y recomendación de revisión técnica; nunca certeza inventada, recetas de químicos o dosis.
- Validar JSON de salida con esquema antes de persistir. Tratar el contenido generado como no confiable; no permitir que la IA ejecute comandos o cambie válvulas.
- Guardar archivos en almacenamiento privado y solo referencias/metadatos en PostgreSQL; exponer imágenes con autorización.
- Añadir migraciones Prisma y tests de permisos, imagen inválida, API caída, timeout, cuota, datos no concluyentes y salida malformada.

### Orden de implementación recomendado
1. Inspeccionar repositorio existente, crear rama y plan sin sobrescribir cambios.
2. Añadir modelos Prisma y contratos DTO/API del diagnóstico.
3. Crear proveedor mock, almacenamiento local privado, endpoints y pruebas.
4. Construir la pantalla Angular y sustituir el panel de circuito en el dashboard.
5. Conectar proveedor OpenAI real por variable de entorno y probar con imágenes autorizadas.
6. Verificar seguridad, experiencia móvil, historial y costos; actualizar README y `.env.example`.
7. Ejecutar lint, typecheck, tests y build de Angular/NestJS; reportar resultados y limitaciones sin inventar éxitos.

### Reglas adicionales
- El análisis visual es **orientativo**, no diagnóstico agronómico definitivo.
- No publicar imágenes del usuario ni exponer EXIF/geolocalización; establecer política de retención.
- No bloquear dashboard ni WebSocket si OpenAI no responde.
- No afirmar porcentajes de ahorro, enfermedades detectadas o eficacia del modelo sin pruebas verificadas.
- Usar español claro en UI y nombres de clases/archivos en inglés.
- Al terminar cada fase, listar archivos editados, comandos ejecutados, pruebas, pendientes y siguiente paso; solicitar revisión antes de cambios destructivos o despliegue.


## Extensión v1.4 — rangos, datos públicos y predicción hídrica (obligatoria)
1. Leer las secciones 20–23 de DERCAS antes de modificar código. Implementar **tres medidores independientes** A/B/C con rangos `min/max` configurables y validados, series con líneas de umbral, marcas temporales, estados de calidad y actualización Socket.IO. No mezclar valores de suelo con temperatura ni precipitación; conservar unidades.
2. Separar la configuración de rangos agronómicos del rango físico/calibración del sensor. Valores de demo son ficticios y deben rotularse. El control del relé queda en firmware local; no cambiar reglas sin validación de usuario y pruebas de seguridad.
3. Crear módulo `weather` en NestJS con adaptadores de proveedor para Open-Meteo y, opcionalmente, NASA POWER. Documentar endpoints oficiales, variables realmente disponibles, licencia, resolución, unidades, atribución, límites, manejo de fallas y fecha de consulta; no inventar datasets de cacao ni registros meteorológicos. Implementar jobs idempotentes, tablas de procedencia y pruebas con fixtures.
4. Crear `analytics/prediction` con interfaz de modelo intercambiable: regresión lineal múltiple (Python/scikit-learn) y baseline heurístico/balance hídrico; evaluar con división cronológica, MAE/RMSE, sin filtración de datos futuros, guardando versión y metadatos. No entrenar en cada request. No declarar exactitud sin evaluación.
5. Definir target y horizonte antes de modelar. Primero predecir humedad por zona o déficit en mm. Para litros exigir área y eficiencia; marcar «No calculable» si faltan. Diferenciar datos observados, meteorología modelada, estimaciones y predicciones.
6. Crear feature Angular `water-forecast` con gráfico observado/pronosticado, horizonte, próximo riego estimado, déficit mm, litros condicionales, modelo, fecha y advertencias de incertidumbre. No conectar predicciones directamente a comandos de electroválvula.
7. Ampliar Prisma con `sensor_thresholds`, `weather_observations`, `model_versions`, `predictions` y `water_demand_estimates`; generar migraciones no destructivas, índices, permisos y pruebas.
8. Añadir pruebas de min>=max, desconexión, datos faltantes, unidades, duplicados, falta de área, no disponibilidad de modelo, fuga temporal y aislamiento por parcela.
9. Mantener el módulo de diagnóstico fotográfico GPT, los tres sensores, lluvia, relé, historial, reportes y ODS. El dashboard aprobado **no** debe mostrar diagrama de circuito: su lugar lo ocupa la tarjeta de foto y resultado de diagnóstico IA.
10. Mantener el stack Angular + NestJS + PostgreSQL/Prisma, Socket.IO, servicio Python de entrenamiento/predicción solo si hace falta, y OpenAI exclusivamente desde backend. No sustituir tecnologías sin autorización.

### Fases adicionales sugeridas
- **Fase 8:** rangos min/max, barras y gráficos en tiempo real para tres sensores.
- **Fase 9:** ingesta de clima público, normalización, procedencia y almacenamiento histórico.
- **Fase 10:** baseline heurístico, regresión múltiple, evaluación temporal y API de predicción.
- **Fase 11:** pantalla de predicción, métricas y validación de extremo a extremo con datos demo y reales claramente separados.

### Entregables de cada fase
Código compilable, migraciones cuando apliquen, tests ejecutados (resultado real), documentación de variables de entorno, endpoints y contratos, capturas o descripción verificable del UI, lista de supuestos y pendientes. Nunca afirmar que el ESP32, las fuentes públicas o OpenAI están conectados sin comprobarlo. Pedir autorización antes de desplegar, cambiar firmware, sobrescribir datos o realizar acciones externas.

## Aclaración documental — orden vigente y contratos (2026-11-20)

Las listas anteriores describen subfases y evolución del alcance. El orden global vigente es el de la sección 13 de DERCAS: base técnica → seguridad y datos → telemetría/simulador → tiempo real/dashboard → gestión agrícola → diagnóstico IA → clima/predicción → validación final. No se elimina ninguna funcionalidad por aplazarla a su fase correspondiente.

- `telemetry.updated` utiliza exclusivamente el evento agregado versionado de la sección 17.8; no alternar entre payload completo y payload individual por sensor bajo el mismo nombre.
- El payload de ingreso sigue la sección 18.3, admite lecturas parciales explícitas y separa orden del relé de confirmación física de válvula. No usar `valveOpen` como campo canónico nuevo.
- Los rangos agronómicos min/max se gestionan por sensor y variable; no equivalen a calibración física ni configuran el firmware automáticamente.
- El simulador debe permitir avanzar sin hardware real. El proveedor simulado de IA debe permitir probar el módulo sin clave de OpenAI. Ambos deben identificarse explícitamente.
- La predicción, la meteorología pública y la IA siguen siendo requisitos del proyecto; su implementación y validación son incrementos posteriores, no dependencias para arrancar la base técnica.
