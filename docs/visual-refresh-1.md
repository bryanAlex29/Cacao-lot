# Renovación visual — incremento 1

## Alcance autorizado

El usuario solicitó revisar y completar el diseño conforme a la captura inicial,
levantar servicios y abrir la web antes de empezar. Se conserva la guía
`contexto/DISENO_VISUAL_CacaoSmart.md`; la imagen original no está guardada en el
repositorio y aún debe adjuntarse para verificar fidelidad exacta.

Este incremento no representa la finalización de todo el rediseño.

## Cambios

- Navegación compartida en dashboard, Parcelas, Diagnóstico IA y Clima histórico.
  Sidebar verde oscuro, iconos SVG locales, sección activa única y enlaces
  Angular que conservan sesión. Sin parcela no se fabrican enlaces de un ID vacío.
- Menú desplegable en móvil/tableta hasta 900 px, con `aria-expanded` y
  `aria-controls`; sidebar sticky y desplazable en escritorio.
- Anclas del dashboard conservadas, incluido clic repetido; navegación a las
  secciones desde otras pantallas con soporte de anclas del router.
- Variables compartidas de radio/sombra, tipografía del sistema y controles.
- Dashboard: jerarquía y espaciado de tarjetas, iconos en sensores/ambiente/lluvia,
  icono del relé y acceso destacado al diagnóstico. El acceso abre la pantalla
  de captura: no aparenta abrir directamente la cámara.
- Rangos: min/max visibles y vigencia/versión/consulta dentro de un desplegable,
  sin eliminar información, cambiar permisos ni reglas.
- Diagnóstico: acciones principal/secundaria, captura con selector accesible,
  filtros agrupados, tarjetas de historial, eliminación diferenciada y marco
  de comparación A/B. Sin modificar cuota, consentimiento o privacidad.
- Parcelas y gestión: tarjetas, bordes, superficies y confirmaciones coherentes.
- Clima: títulos, tarjetas y tabla alineados con la identidad común; se mantiene
  la distinción entre datos modelados y sensores.

## Archivos principales

- `frontend/src/app/shared/ui/{app-sidebar.component.*,icon.component.ts}`
- `frontend/src/styles.css`, `frontend/src/app/app.config.ts`
- `frontend/src/app/features/dashboard/{dashboard.component.*,diagnosis-preview.component.ts,soil-sensor-card.component.ts,sensor-range.component.ts}`
- `frontend/src/app/features/plots/{plots.component.*,management.css}`
- `frontend/src/app/features/ai-diagnosis/ai-diagnosis.component.*`
- `frontend/src/app/features/weather/weather.component.*`
- `backend/test/dashboard.integration.ts` (solo pruebas de interfaz)

Se conservaron los cambios previos sin commit. Sin nuevas dependencias, endpoints,
migraciones, llamadas OpenAI, cambios de firmware, commit, push ni despliegue.

## Servicios y entorno

- Node 22.23.5, Git 2.54.0, Docker 29.9.3.
- npm instalado: 10.9.9, inferior al `packageManager` declarado (11.6.2).
  No se instalaron dependencias ni se cambió el lockfile para este incremento.
  PowerShell bloquea `npm.ps1`; se usó `npm.cmd`.
- Se abrió Docker Desktop y se levantó el contenedor PostgreSQL existente con
  `npm.cmd run db:up`, sin migrar ni poblar la base principal.
- Angular: http://localhost:4200; API local: http://127.0.0.1:3100.
  Se abrió la URL con `Start-Process`. Smoke inicial y HTTP 200 verificados.
- Pruebas de navegador con Edge:
  `$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'`.
  El Chrome predeterminado no está instalado.

## Criterios de revisión

1. Comparar la misma navegación en las cuatro pantallas y una sola sección activa.
2. Abrir/cerrar Menú en 390 px y navegar sin perder la sesión.
3. Repetir Monitoreo/Historial/Alertas desde dashboard y volver desde Clima.
4. Verificar A/B/C, mínimo/máximo, estados y detalles de rango con teclado.
5. Capturar/subir con consentimiento, filtrar, comparar dos imágenes y eliminar
   sin modificar la semántica de las operaciones.
6. Revisar escritorio (1440/1672 px), tableta y móvil sin desbordamiento.
7. Mantener «DEMO», marcas temporales, incertidumbre y métricas indisponibles.

## Verificación ejecutada

- `npm.cmd run test --workspace=@cacaosmart/frontend`: **499/499**.
- `npm.cmd run test:browser` con Edge: **38/38**, en una base temporal
  eliminada por el runner, sin cambios en la principal.
- `npm.cmd run build`, `npm.cmd run lint`, tipado de frontend, formato de
  archivos afectados y `git diff --check`: correctos.
- `npm.cmd run smoke`: `/health/live` y `/health/ready` responden 200.
- `npm.cmd test`: no completa la suite global. Backend aprueba 251 pruebas,
  pero `backend/src/weather/open-meteo.spec.ts:37` no compila (TS2322):
  asigna `'inventada'` a un valor inferido como `'°C' | '%' | 'mm'`.
  Ese archivo de pruebas no se modificó en este incremento. Angular se ejecutó
  luego por separado y pasó; no declarar la suite global aprobada.
- Capturas sintéticas revisadas en
  `C:\Users\Hp\AppData\Local\Temp\opencode\cacaosmart-browser-UGaYyM`
  (dashboard, IA, comparación y clima; escritorio/móvil).
  No son fotografías del usuario ni mediciones reales.
- La suite usa esperas sobre el renderizado real al abrir/cerrar menú,
  seleccionar fotos y limpiar comparación; no se aumentaron timeouts.
  Los recorridos móviles abren el nuevo menú antes de usar enlaces ocultos.

Persiste una advertencia de `pg` sobre consultas concurrentes en las pruebas;
no impidió el resultado correcto de los 38 recorridos de navegador.

## Pendientes para siguientes incrementos

- Volver a adjuntar la captura original para revisar proporciones y fotografías.
- Incorporar fotografías locales con licencia/procedencia documentadas en banner
  y riego. Wikimedia respondió HTTP 429 durante los intentos; no se dejaron
  imágenes rotas, referencias a archivos inexistentes ni créditos ficticios.
  Se mantiene un fondo de respaldo, todavía distinto de la referencia.
- Compactar alertas y distribuir mejor resumen/detalle para evitar que alarguen
  la franja inferior; conservar estado, fechas, reconocimiento y configuración.
- Completar encabezado común de parcela/cuenta y coherencia de las pantallas
  secundarias, sin indicadores de conexión decorativos.
- Unificar filtros/tablas/acciones de histórico, riego y reportes y pulir diálogos,
  inventario y gestión.
- Mejorar disposición de captura/resultado/historial de IA, sin inventar
  miniaturas públicas ni diagnósticos, y completar ajustes de ODS/agua.
- Revisión visual de login/registro y estados de carga/error/vacío.

OpenAI sigue explícitamente pospuesto. No se inició el simulador ni se crearon
cuentas, parcelas o diagnósticos de prueba en la base principal.
