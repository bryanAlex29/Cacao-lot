# Renovación visual — incremento 6 y revisión transversal

## Alcance autorizado

El usuario pidió implementar Clima/estado y, a continuación, adaptar el conjunto
del diseño al objetivo documentado. Se mantiene la identidad verde oscuro,
encabezados blancos, tarjetas claras, jerarquía agrícola e iconos locales.
No se afirma fidelidad exacta sin la captura original ni se añaden fotografías
sin procedencia.

## Cambios

### Clima

- Ubicación y consentimiento separados visualmente de la consulta histórica.
  Coordenadas agrupadas, estados inválidos y acción principal coherentes.
- Procedencia, periodo, zona horaria, consulta antigua, resolución y atribución
  visibles. La conexión desactivada y ausencia de datos siguen explícitas.
- Filtro local por variable sobre la tabla almacenada, sin peticiones nuevas,
  envío de coordenadas ni cambios en sincronización. Conserva cero y `null`.
- Tabla desplazable con teclado, encabezados semánticos, calidad textual y
  avisos de límites de ERA5/ET₀. No se inventa clima actual o predicción.
- FARMER sigue sin configurar ni sincronizar. ADMIN conserva autorización,
  control de versiones y protección de escrituras inciertas.

### Estado del sistema

- Identidad e iconos consistentes, estados separados para API y PostgreSQL,
  fallo parcial visible, última consulta y reintento existentes conservados.
- Durante la consulta no se muestran indicadores verdes de la comprobación
  anterior. El guard existente evita solicitudes simultáneas.
- Corregidos textos antiguos que anunciaban que histórico/tiempo real aún no
  existían. Ahora explican qué comprueba esta pantalla y qué no: salud de
  servicios no acredita conexión del ESP32 ni mediciones del cultivo.
- Acceso público y retorno a parcelas mediante Angular Router conservados;
  no se añaden privilegios, credenciales o endpoints.

### Revisión transversal

- Nuevo `shared/ui/workspace.css` aplicado, después del CSS específico, a
  Dashboard, Parcelas, IA y Clima. Centraliza estructura, ancho y márgenes:
  sidebar 240 px, contenido máximo 1600 px y margen de escritorio 24 px.
- Un solo punto de corte de estructura a 900 px, alineado con el menú móvil.
  Antes Parcelas conservaba una columna lateral estrecha hasta 680 px, aunque
  su sidebar ya era móvil: se elimina ese desacuerdo.
- Encabezado compartido más compacto, márgenes de tarjetas y separaciones
  consistentes, título adaptable en Parcelas y controles Dashboard de 44 px.
- Nuevos enlaces «Saltar al contenido» en IA/Clima, con destino enfocable.
  El diseño de acceso del incremento 5 se conserva.
- No cambia la estructura funcional de tres sondas, ambiente, lluvia,
  riego observado, diagnóstico, gráficos, alertas y ODS.

## Archivos

- `frontend/src/styles.css`: variables de presentación.
- `frontend/src/app/shared/ui/{workspace.css,page-header.component.css}`.
- `frontend/src/app/features/{dashboard,plots}/`: CSS y declaración de estilos.
- `frontend/src/app/features/ai-diagnosis/`: declaración de estilos, márgenes y
  enlace de salto.
- `frontend/src/app/features/weather/`: plantilla, estilos, filtro local y pruebas.
- `frontend/src/app/features/system-status/`: presentación, textos y pruebas.
- `backend/test/dashboard.integration.ts`: pruebas UI y respuestas interceptadas
  de clima/salud, solo fixtures; no modifica el backend de producción.
- `docs/CONTINUAR.md` y este documento.

Sin dependencias, migraciones, datos nuevos en principal, OpenAI, firmware,
commit, push ni despliegue. Se conserva todo el trabajo anterior.

## Verificación

- Angular: **534/534**, 33 archivos.
- Build backend/frontend, lint y tipos frontend: correctos.
- Smoke: API live/ready HTTP 200; web local HTTP 200.
- Edge: **43/43**. Clima/salud con respuestas interceptadas de prueba, sin
  consultas meteorológicas externas. A 320/390/768/1440 px, sin desbordamiento;
  cuatro pantallas alinean el comienzo del contenido en x=240 en escritorio y
  x=0 con menú móvil.
- Prettier y `git diff --check`: correctos.
- Capturas sintéticas revisadas en
  `C:\Users\Hp\AppData\Local\Temp\opencode\cacaosmart-browser-ayRRoi`:
  `system-status-partial-390.png`, `weather-stored-1440.png`,
  `dashboard-desktop.png`, `unified-diagnosis-1440.png`.
  También se revisaron Parcelas móvil y Clima móvil de la primera ejecución
  (`cacaosmart-browser-t7ora5`).
- Primera matriz de navegador: 41/43. Se corrigió una expectativa textual
  («ni» frente a «no») y el nombre accesible del selector local de variable,
  añadiendo `aria-label` explícito. Repetición completa: 43/43, sin aumentar
  tiempos de espera ni cambiar lógica de API.
- El runner eliminó las bases temporales de ambas ejecuciones. Persiste la
  advertencia de consultas concurrentes de `pg`, sin impedir aprobar.

La suite global backend no se volvió a ejecutar: permanece el error ajeno
TS2322 de `backend/src/weather/open-meteo.spec.ts:37`. No se declara aprobada.

## Revisión manual

1. Recorrer Dashboard → Parcelas → IA → Clima en escritorio y móvil: sidebar,
   comienzo de contenido, encabezados y márgenes no deben saltar entre páginas.
2. En Clima con registros almacenados, cambiar variable: no debe sincronizar ni
   modificar la autorización. «No disponible» no debe convertirse en cero.
3. En `/estado`, comprobar servicios y reintentar. Estar disponible no acredita
   telemetría física ni autoriza riego remoto.
4. No registrar equipos, subir fotos ni autorizar coordenadas reales solo para
   revisar el diseño.

Pendiente de revisión del usuario y comparación con la imagen original.
Fotografías de cacao/riego y fidelidad exacta siguen pendientes; OpenAI continúa
pospuesto. No se declara terminada la integración física ni una predicción.
