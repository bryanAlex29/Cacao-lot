# CacaoSmart IoT — Avance y traspaso a Bryan

Fecha de corte: 24 de noviembre de 2026.
Objetivo: que Bryan descargue la entrega, prepare su entorno, pruebe primero lo existente y reporte resultados antes de continuar el desarrollo.

Preparación posterior autorizada: el responsable pidió dejar todo listo para
subir. Esta guía, el Word, el código y las migraciones forman parte del commit
local de entrega en `feature/agricultural-management`. Consultar su hash con
`git log -1 --oneline`; falta publicar con
`git push -u origin feature/agricultural-management`. Los párrafos de inspección
inicial conservan el estado anterior a preparar ese commit; no describen una
publicación remota. No repetir el commit si ya existe.

## 1. Resumen ejecutivo

CacaoSmart IoT es una plataforma para monitorear cultivos de cacao en Chone, Manabí. El desarrollo usa Angular, NestJS, PostgreSQL y Prisma; Socket.IO comunica cambios en tiempo real. El ESP32 conserva el control físico local del riego.

La aplicación local cuenta con autenticación, parcelas propias, equipos/sensores, monitoreo de tres zonas, rangos, alertas, históricos, reportes CSV, diagnóstico fotográfico DEMO y clima histórico modelado. La interfaz se ha trabajado en seis incrementos visuales y se ha probado con diferentes anchos de pantalla.

No es un producto terminado ni una integración física validada. La telemetría extremo a extremo se probó con un simulador; el diagnóstico no usa OpenAI; no existe una predicción hídrica validada. No se deben presentar estos elementos como resultados reales de campo.

### Instrucción principal para Bryan

PRIMERO PROBAR. No empezar una función nueva, modificar permisos o corregir muchos módulos a la vez. Preparar el entorno, ejecutar verificaciones, recorrer la guía manual y entregar un informe de incidencias. Acordar después un único incremento.

## 2. Cómo interpretar esta entrega y su estado Git

Inspección de esta copia al preparar el documento:

- Repositorio: https://github.com/bryanAlex29/Cacao-lot.git
- Rama local actual: feature/agricultural-management.
- HEAD local: 9fe2dc1, "feat: add irrigation date filters and device inventory".
- La referencia local main y la referencia almacenada origin/main apuntaban a ese mismo commit. No se consultó el servidor remoto durante esta preparación; pueden existir cambios remotos nuevos.
- Hay numerosos archivos modificados y sin seguimiento: gestión posterior, IA, clima, pruebas y renovación visual. El presente documento también debe agregarse a Git.
- No se ha realizado commit, push, merge, pull ni despliegue al preparar esta guía.

IMPORTANTE: un pull solo descarga commits publicados. Si se sube únicamente el documento, Bryan no recibirá las funciones que siguen sin commit. Publicar el código revisado, sus migraciones, package-lock.json y la documentación juntos en la rama de entrega; nunca la base de datos ni secretos.

Los documentos anteriores conservan registros históricos, con cifras y pendientes de su momento. Para el estado actual, leer esta entrega y la parte superior de docs/CONTINUAR.md; contrastar siempre con Git y DERCAS. No sumar cifras de distintas fases.

## 3. Aportes y decisiones del responsable del proyecto

- Definió el objetivo agrícola, los tres sensores de suelo y la necesidad de monitoreo y trazabilidad del riego.
- Indicó que el prototipo físico funciona; todavía debe comprobarse su conexión auténtica con esta aplicación.
- Aportó la referencia visual y orientó los ajustes mediante revisiones incrementales.
- Solicitó que agricultores creen parcelas propias sin concederles administración general.
- Probó la navegación y reportó problemas de sesión y acceso móvil.
- Decidió posponer OpenAI y no avanzar con cambios de red adicionales por ahora.
- Solicitó este traspaso para que Bryan pruebe el conjunto antes de continuar.

El desarrollo de software descrito se realizó en colaboración con el asistente. Estas decisiones no equivalen a certificación agronómica, revisión de seguridad de producción ni validación de hardware.

## 4. Funciones implementadas

### 4.1 Base técnica y salud

- Monorepositorio con frontend Angular standalone, backend NestJS y contratos TypeScript compartidos.
- PostgreSQL local en Docker Compose y Prisma con migraciones versionadas.
- Configuración validada y variables privadas fuera del repositorio.
- Salud separada: live confirma proceso/API; ready consulta la base.
- Swagger y OpenAPI disponibles en desarrollo.

### 4.2 Acceso, sesión y permisos

- Registro público de FARMER, login, hash Argon2id y límites de solicitudes.
- Contraseñas nuevas: 8–128 caracteres, al menos una mayúscula y un símbolo; espacios no sustituyen al símbolo. No se exige un dígito adicional.
- JWT corto, hasta 15 minutos, mantenido en memoria; renovación por cookie HttpOnly/Strict.
- Sesión absoluta hasta 8 horas, recuperación al recargar y revocación al salir.
- Autorización por propietario y rol en la API y Socket.IO. ADMIN no tiene acceso global a parcelas ajenas.
- Registro no crea parcelas ni dispositivos automáticamente. No hay cuentas predeterminadas.

### 4.3 Parcelas, equipos e inventario

- ADMIN y FARMER crean parcelas propias; propietario derivado de la sesión.
- Ubicación escrita y superficie opcional, sin mapas ni GPS automático.
- ADMIN propietario edita y archiva lógicamente con confirmación por nombre.
- Registro visual de dispositivos y clave privada mostrada una sola vez; credencial guardada como hash en backend.
- La clave nueva se conserva al refrescar el inventario hasta ocultarla; no se copia ni persiste automáticamente en almacenamiento del navegador.
- Habilitación/deshabilitación de recepción con confirmación: no controla una válvula.
- Inventario paginado con origen REAL/DEMO, contacto, conexión al consultar, habilitación e identidades de seis sensores.

### 4.4 Telemetría y dashboard

- Ingesta autenticada por dispositivo, validada, transaccional e idempotente por evento.
- Tres humedades independientes A/B/C; temperatura, humedad ambiental y lluvia binaria.
- Datos ausentes mediante null, sin rellenarlos con cero ni reutilizar silenciosamente otros datos.
- Separación de orden del relé y confirmación física de válvula.
- Snapshot/histórico REST y Socket.IO autenticado; recuperación REST al reconectar.
- Manejo de lecturas parciales, duplicadas, atrasadas y estados de calidad/antigüedad.
- Simulador local determinista identificado como DEMO, separado del hardware real.

### 4.5 Rangos, alertas, históricos y CSV

- Rangos min/max por sensor y variable; escritura solo ADMIN propietario, auditoría y versión ante cambios concurrentes.
- Clasificación numérica Bajo/En rango/Alto sin confundirla con calibración o salud del cultivo.
- Gráfico A/B/C y líneas de rangos según su vigencia histórica.
- Alertas persistentes de desconexión y baja humedad por sonda; reconocer no resuelve la condición.
- Baja humedad requiere política/margen explícito y confirmaciones consecutivas; no se inventan umbrales o márgenes.
- Historial paginado del riego observado: cambios de relé y feedback, no sesiones físicas de riego.
- Filtros locales de fecha convertidos a UTC, periodos fijos al paginar y máximo 31 días.
- CSV de lecturas y riego observado, límites de 10000 filas y protección de fórmulas.
- Eventos independientes de telemetría, dispositivo, riego y estado de sensores.

### 4.6 Diagnóstico fotográfico privado DEMO

- Captura/selección JPEG, PNG o WebP; vista previa sin enviar automáticamente.
- Consentimiento explícito, notas opcionales y limpieza de consentimiento al sustituir foto.
- Validación del contenido, sanitización con sharp, copia JPEG privada sin EXIF/geolocalización.
- Proveedor simulado con resultado orientativo no concluyente: NO detecta enfermedades reales.
- Historial privado por parcela, filtros por fecha/estado, eliminación y retención configurable.
- Por defecto: 8 MB, 5 intentos por usuario/día UTC y 7 días de retención; confirmar valores efectivos en configuración.
- Idempotencia: respuesta perdida no autoriza duplicar automáticamente la solicitud.
- Comparación manual de dos fotos existentes, intercambio A/B, selección entre páginas y limpieza.
- No identifica plantas ni afirma mejoría, empeoramiento o eficacia. No hay integración OpenAI ni costos de ese proveedor.

### 4.7 Clima histórico y estado técnico

- Módulo de clima con adaptador Open-Meteo/ERA5, ubicación y consentimiento por parcela.
- Desactivado por defecto; activar requiere confirmar condiciones de uso y autorización explícita.
- Datos diarios modelados históricos, no sensores propios ni clima actual ni pronóstico.
- Conserva fecha, unidades, calidad, procedencia, resolución, celda y atribución.
- Filtro local de la tabla por variable: no consulta al proveedor ni envía coordenadas.
- Solo ADMIN propietario configura/sincroniza; FARMER consulta registros almacenados.
- Pantalla /estado separa API y PostgreSQL, fecha de comprobación y reintento; no confirma conexión del ESP32.

### 4.8 Diseño y adaptación móvil

- Sidebar verde oscuro compartido; menú móvil, navegación Angular y sección activa única.
- Encabezado compartido con parcela, ubicación, cuenta y salida. Indicador de conexión solo donde hay evidencia de telemetría.
- Tarjetas, formularios, filtros, tablas y confirmaciones en línea armonizados.
- Foco visible, Escape en confirmaciones de gestión y retorno al activador sin cancelar escrituras pendientes.
- Estructura común: sidebar de 240 px, contenido máximo de 1600 px y menú móvil a 900 px.
- Pruebas en Edge a 320, 390, 768 y 1440 px, sin desbordamiento general. Tablas pueden desplazarse dentro de su región.
- Falta validar teléfonos físicos, especialmente cámara; sin la captura original no se certifica fidelidad visual exacta. Fotografías del cultivo/riego pendientes.

## 5. Verificaciones realizadas y límites de la evidencia

Último cierre de desarrollo registrado, no una ejecución nueva para redactar este documento:

| Verificación                         | Último resultado documentado                     |
| ------------------------------------ | ------------------------------------------------ |
| Angular                              | 534 pruebas correctas, 33 archivos               |
| Edge real automatizado               | 43 recorridos correctos                          |
| Build backend/frontend               | Correcto                                         |
| Lint y tipos frontend                | Correctos                                        |
| Formato de archivos afectados y diff | Correctos                                        |
| Smoke y frontend local               | live/ready 200, OpenAPI presente y web 200       |
| Suite global backend                 | No declarada aprobada; bloqueo conocido de clima |

Bloqueo conocido: backend/src/weather/open-meteo.spec.ts:37 asigna 'inventada' a un campo cuyo tipo admite '°C' | '%' | 'mm'. Se registró TS2322. Bryan debe reproducir, registrar y proponer una corrección acotada de la fixture, conservando el caso de unidad inválida. No eliminar el test ni ampliar tipos productivos para ocultarlo.

La advertencia de consultas concurrentes de pg persiste en integración/navegador. No se ha cambiado una dependencia para ocultarla.

Los números mayores de pruebas totales en documentos antiguos pertenecen a otras ejecuciones que incluían suites diferentes; no representan una validación global posterior de todo el código actual.

Las pruebas integrales y de navegador generan bases temporales locales, aplican migraciones y las eliminan. No deben ejecutarse contra producción. Las capturas anteriores están en una carpeta temporal del equipo original; no se transfieren por Git y Bryan debe generar las suyas.

### Revalidación al preparar el commit local

- Build backend/frontend y lint: correctos.
- Angular: 534/534, 33 archivos, repetidas en esta preparación.
- Backend: 15 suites correctas y 251 pruebas ejecutadas correctas; 1 suite no
  pudo compilar por el TS2322 conocido de `open-meteo.spec.ts:37`.
  La ejecución backend completa termina con error: no se declara aprobada.
- Las 43 pruebas Edge corresponden al cierre visual anterior; no se repitieron
  para empaquetar la entrega.
- Sin cambios funcionales, instalaciones, migraciones locales ni datos nuevos.
  Revisión de archivos y exclusión de secretos antes de crear el commit.

## 6. Lo que Git NO transfiere

- .env y secretos de autenticación/base.
- .local/simulator.json y claves de dispositivo.
- Usuarios, contraseñas, parcelas, lecturas y volumen PostgreSQL.
- Fotografías privadas y diagnósticos locales.
- node_modules, compilaciones y capturas temporales.

Bryan generará sus propias variables, cuentas y datos de prueba. Una lista de parcelas vacía al clonar es esperable. No compartir el .env, cookies, JWT, archivos de simulador ni fotos privadas por Git o chat.

## 7. Descargar o actualizar la entrega

### 7.1 Copia nueva, después de que el responsable publique la rama

```powershell
git clone --branch feature/agricultural-management https://github.com/bryanAlex29/Cacao-lot.git
cd Cacao-lot
git status --short --branch
git log -1 --oneline
```

La rama debe existir en el remoto. Si no existe, todavía no se publicó esta entrega. No usar main pensando que contiene cambios locales sin commit.

### 7.2 Bryan ya tiene una copia

```powershell
git status --short --branch
git fetch origin
git branch -a
```

Si hay trabajo local, detenerse y conservarlo: acordar commit en rama propia o integración revisada. No ejecutar reset --hard, checkout de archivos, clean ni un pull forzado. No hacer stash automáticamente.

Con directorio limpio y sin divergencias:

```powershell
git switch feature/agricultural-management
git pull --ff-only origin feature/agricultural-management
```

Si esa rama aún no existe localmente, en lugar de git switch simple:

```powershell
git switch --track origin/feature/agricultural-management
```

Si --ff-only rechaza, inspeccionar la divergencia y coordinar; no forzar. Comparar el commit de Bryan con el hash que comunique el responsable después del push.

## 8. Preparar el equipo de Bryan

Leer primero AGENTS.md, AGENTS_CacaoSmart_v1.4.md y contexto/DERCAS_CacaoSmart_v1.4.md completos. Leer contexto/DISENO_VISUAL_CacaoSmart.md antes de tocar UI. Después README.md, esta guía y docs/CONTINUAR.md.

Comprobar herramientas antes de instalar:

```powershell
node --version
npm.cmd --version
git --version
docker --version
docker compose version
docker info
```

El proyecto declara Node.js ^22.12.0 y npm >=11.6.2; usar la rama compatible 22 y npm 11.6.2 para reproducibilidad. Docker Desktop debe estar iniciado con contenedores Linux. PostgreSQL usa puerto local 5433 por defecto; comprobar que no esté ocupado por otro proyecto.

En PowerShell usar npm.cmd si la política bloquea npm.ps1. No modificar la política global para ocultar ese error.

### 8.1 Entorno, dependencias y migraciones

Ejecutar desde la raíz:

```powershell
node scripts/setup-env.mjs
node scripts/setup-auth-env.mjs
npx.cmd --yes npm@11.6.2 ci
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run db:up
npm.cmd run db:migrate
```

Los generadores no deben sobrescribir un .env existente. Revisar compatibilidad si se reutiliza un entorno anterior. npm ci instala también sharp desde el lockfile; no copiar node_modules de otra máquina.

db:migrate usa migrate deploy; no usar db push, migrate reset o eliminación de volúmenes. En una base con datos importantes hacer respaldo y revisar migraciones antes de aplicarlas.

Hay nueve migraciones en esta entrega, incluidas auth_sessions, ai_diagnoses y weather. Una copia que solo tenía 5.13/5.14 necesita instalar las dependencias actuales, regenerar Prisma y aplicar las migraciones nuevas; no basta con reiniciar servidores.

Mantener inicialmente CORS_ORIGIN=http://localhost:4200, API en 127.0.0.1:3100, WEATHER_PROVIDER=disabled y WEATHER_NONCOMMERCIAL_CONFIRMED=false. En desarrollo IA usa mock por defecto; no introducir claves OpenAI.

### 8.2 Iniciar servicios

Terminal 1, desde la raíz:

```powershell
npm.cmd run dev:backend
```

Terminal 2, desde la raíz:

```powershell
npm.cmd run dev:frontend
```

Direcciones:

- http://localhost:4200/login
- http://localhost:4200/registro
- http://localhost:4200/parcelas
- http://localhost:4200/estado
- http://127.0.0.1:3100/api/v1/health/live
- http://127.0.0.1:3100/api/v1/health/ready
- http://127.0.0.1:3100/api/v1/docs

El proxy Angular comunica /api y /socket.io con la API. No exponer PostgreSQL ni abrir puertos del router. No iniciar API compilada y API de desarrollo simultáneamente en el mismo puerto.

### 8.3 Cuentas locales

Para FARMER usar /registro con datos locales de prueba y una contraseña propia. Esto crea datos en la base local elegida; no hacerlo contra una base compartida sin acuerdo.

Para ADMIN seguir README, apartado "Crear el primer administrador local": definir temporalmente BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD en el .env privado, ejecutar npm.cmd run admin:create y retirar esas tres variables. No escribir contraseñas en comandos ni en informes.

No promover cuentas cambiando la base a mano para esquivar permisos. FARMER no debe recibir controles administrativos.

## 9. Prueba automatizada inicial — antes de desarrollar

Ejecutar comandos por separado y guardar un resumen sin secretos. Si falla uno, registrar salida y continuar con las verificaciones independientes que puedan ejecutarse de forma segura. No declarar todo aprobado por pasar solo frontend.

```powershell
npm.cmd run lint
npm.cmd run typecheck --workspace=@cacaosmart/frontend
npm.cmd run test --workspace=@cacaosmart/frontend
npm.cmd run build
npm.cmd run db:validate
npm.cmd run test:simulator
```

Ejecutar también, registrando el bloqueo de clima si se reproduce:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run format:check
```

Con PostgreSQL local disponible y permisos para bases temporales:

```powershell
npm.cmd run test:integration
```

Para navegador real, primero localizar Edge o Chrome instalado. Ejemplo Windows; sustituir la ruta si no existe:

```powershell
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm.cmd run test:browser
```

El proyecto usa playwright-core; no asumir que descargó un navegador. No aumentar timeouts, desactivar seguridad o saltar aserciones para obtener un verde.

Con API y base iniciadas:

```powershell
npm.cmd run smoke
git diff --check
```

Las pruebas no reemplazan la revisión manual. Si aparece un error distinto al documentado, registrarlo como hallazgo nuevo; no asumir que todo fallo proviene de clima.

## 10. Recorrido manual para Bryan

Usar cuentas y recursos de prueba propios, preferiblemente una base local dedicada. Las acciones Crear, Guardar, Registrar equipo, Confirmar análisis, Reconocer y Eliminar escriben datos; confirmar antes si la base es compartida.

### A. Salud y acceso

1. Abrir /estado: API y base tienen estados separados y fecha; reintentar sin solicitudes duplicadas.
2. Abrir registro, comprobar validaciones y crear un FARMER local de prueba.
3. Comprobar inicio automático y lista vacía si no hay parcelas.
4. Salir, iniciar sesión y recargar: una sesión válida debe recuperarse.
5. Navegar a Alertas/Historial/Riego/Reportes sin volver inesperadamente a login.
6. Al salir, las rutas protegidas deben volver a pedir acceso.
7. Renovación temporal y revocación deben verificarse también con pruebas automatizadas; no afirmar haber esperado ocho horas físicas.

### B. Parcelas y permisos

1. Crear parcela propia con nombre y ubicación; superficie opcional.
2. Confirmar que no aparecen dispositivos o lecturas inventadas.
3. FARMER no debe ver edición/archivo ni alta/habilitación administrativa de equipos.
4. En una cuenta ADMIN propietaria de sus propios recursos, abrir edición/archivo y cancelar con Escape; el foco debe volver al botón, sin escritura.
5. Confirmar archivo solo sobre una parcela desechable. Es lógico, no borrado de historial.
6. Comprobar aislamiento usando dos cuentas y las pruebas de API; no probar acceso ajeno modificando registros de negocio.

### C. Inventario y credencial

1. Abrir dispositivos/sensores: origen, habilitación y conexión al consultar son distintos.
2. Sin equipos, debe mostrar vacío, no datos de muestra.
3. Solo en entorno de prueba y con ADMIN propietario, registrar un equipo.
4. Guardar su clave de forma privada: se muestra una vez y no debe incluirse en capturas ni informes.
5. Refrescar inventario antes de ocultar: la clave debe permanecer; después de ocultar, no debe recuperarse desde UI.
6. Abrir cambio de habilitación y cancelar: no debe modificar recepción ni enviar una orden de válvula.
7. No reutilizar esa credencial para el prototipo real sin un plan de integración autorizado.

### D. Telemetría y simulador

1. Empezar por test:browser, que ya usa fixtures aisladas; no iniciar el simulador de desarrollo automáticamente.
2. Para una demostración manual adicional, acordar primero cuenta/base y alta DEMO. Ver README, "Telemetría y simulación local".
3. Solo con autorización local, configurar TELEMETRY_MODE=demo y reiniciar backend.
4. Ejecutar los siguientes comandos únicamente con el UUID del propietario de prueba:

```powershell
npm.cmd run simulator:provision -- --owner UUID_DEL_PROPIETARIO_DE_PRUEBA
npm.cmd run simulator -- --count 5
```

5. La provisión crea recursos DEMO y .local/simulator.json privado. No sobrescribir uno existente ni copiarlo a Git.
6. En dashboard seleccionar origen "Datos simulados · DEMO" y el dispositivo; el origen inicial puede ser real.
7. Confirmar A/B/C independientes, ambiente, lluvia y fechas. Relé no confirma apertura física.
8. Tras terminar el lote, es esperable que envejezcan los datos y aparezca desconexión; no significa fallo de hardware.
9. Duplicados, parciales, eventos atrasados y reconexión se prueban en las suites aisladas; no alterar firmware para simularlos.

### E. Rangos, alertas, históricos y CSV

1. ADMIN propietario configura rangos solo en sensores de prueba; no inventar valores agronómicos para campo.
2. FARMER consulta sin poder guardar rangos.
3. Verificar que "En rango" no oculta "Sin calibrar".
4. Cambiar un rango actual no debe alterar la vigencia histórica.
5. Alertas: reconocer no cierra la condición. No crear una política de humedad sin un margen explícito autorizado.
6. Aplicar Desde/Hasta, paginar y actualizar; conservar periodo fijo y zona horaria.
7. Diferenciar filtros del gráfico, riego y CSV; no deben afectarse silenciosamente entre sí.
8. Descargar ambos CSV y comprobar origen DEMO, fechas y valores ausentes. No esperar litros o duración física.

### F. Diagnóstico fotográfico DEMO

1. Abrir desde una parcela propia; elegir una imagen de prueba autorizada, sin personas o documentos.
2. Elegir no envía. Sustituir foto limpia notas y consentimiento.
3. Revisar cuota, retención y consentimiento antes de confirmar. El envío crea un intento y consume cuota local.
4. El resultado esperado es simulado/no concluyente; no esperar detección real ni recomendaciones químicas.
5. Verificar imagen privada, filtros y paginación del historial.
6. Comparar dos fotos, intercambiar/quitar/limpiar; no debe ejecutar un análisis nuevo.
7. Cancelar eliminación no borra; confirmar sobre un diagnóstico de prueba retira foto/resultado sin devolver cuota.
8. Los fallos y reintentos idempotentes se comprueban en navegador automatizado.

### G. Clima y diseño responsive

1. Con proveedor desactivado es correcto no tener registros y no enviar coordenadas.
2. No activar Open-Meteo ni aceptar condiciones por otra persona solo para probar UI.
3. Las suites usan respuestas interceptadas para mostrar cero, ausencia, procedencia antigua y filtro sin peticiones externas.
4. En tablas con registros, seleccionar variable solo filtra lo almacenado.
5. Revisar a 320, 390, 768 y 1440 px: menú, tarjetas, formularios, nombres largos, foco y scroll de tablas.
6. Conservar navegación y cuenta al cambiar pantalla. IA/Clima tienen enlace de salto al contenido.
7. Si se usa teléfono real, registrar modelo/navegador y cámara por separado: la emulación de ancho no valida hardware móvil.

## 11. Incidencia conocida del acceso desde teléfono

El frontend se inició inicialmente solo en localhost; luego se detectó un segundo servidor accesible por red. El backend permite por configuración un origen concreto: http://localhost:4200. Al abrir desde una IP LAN diferente, login/registro pueden ser rechazados por "Origen no permitido".

El usuario decidió no continuar con cambios de red en ese momento. No está resuelto ni validado en el teléfono. La IP del equipo original no es una configuración portable: Bryan debe usar localhost para su primera revisión.

No quitar requireOrigin, HttpOnly, SameSite, autorización o validación de sesión. No usar CORS comodín ni desactivar firewall. Si se autoriza posteriormente una prueba LAN, coordinar un origen explícito, host frontend, proxy, permisos de red privada y prueba real de sesión. Eso es una tarea aparte.

## 12. Qué falta para completar el alcance

- Cierre visual con referencia original y fotografías con procedencia autorizada.
- Reproducir/corregir la fixture de clima y ejecutar las suites globales e integrales del código actual.
- Integración ESP32/receptor auténtica: protocolo, payload real, identidad, frecuencia, conexión y reconexión verificadas.
- Calibración/modelos de sensores y política multizona de riego acordadas; no modificar firmware sin permiso.
- OpenAI real: autorización futura, presupuesto, proveedor/modelo, consentimiento externo y pruebas. Sigue pospuesto.
- Predicción hídrica: datos suficientes, target/horizonte, baseline y regresión, partición cronológica y métricas fuera de muestra.
- Métricas de agua: caudal calibrado, evidencia temporal, área/eficiencia donde proceda y línea base; sin ellos "No disponible".
- Producción: HTTPS, hosting, secretos, auditoría actual de dependencias, respaldos y restauración probados, recuperación/verificación de correo y operación.
- Gestión avanzada: asignación entre cuentas, rotación/recuperación de claves y restauración requieren diseño/permisos explícitos, no acceso global ADMIN.

Son bloques con varias tareas, no una lista corta de cinco arreglos. Una demo puede cerrarse antes si declara claramente simulación y límites.

## 13. Informe que Bryan debe entregar antes de continuar

Preparar un reporte con:

- Fecha, sistema operativo, versiones Node/npm/Docker y navegador.
- Rama y commit exactos descargados; git status sin secretos.
- Comandos ejecutados y resultado real de cada suite; distinguir no ejecutado, bloqueado y aprobado.
- Estado de API/base, migraciones y origen usado; no pegar DATABASE_URL.
- Checklist A–G: aprobado, falló o no probado, con motivo.
- Para cada incidencia: pantalla, pasos, resultado esperado/obtenido y captura sin credenciales/fotos privadas.
- Clasificación: bloqueo conocido, regresión nueva o entorno/configuración.
- Confirmación de si creó datos de prueba y en qué entorno, sin exportar secretos.
- Propuesta del siguiente incremento, con archivos y aceptación; esperar autorización.

Si falla algo durante esta primera auditoría, registrar primero. No corregir en bloque ni mezclar un rediseño, cambios de seguridad y migraciones en la misma entrega.

## 14. Prompt listo para el asistente de Bryan

El texto completo está también en docs/PROMPT_BRYAN.md para copiar sin depender de Word:

```text
Continúa CacaoSmart IoT, pero tu primer encargo es AUDITAR Y PROBAR la entrega,
no desarrollar funcionalidades nuevas. Lee completos AGENTS.md,
AGENTS_CacaoSmart_v1.4.md y contexto/DERCAS_CacaoSmart_v1.4.md; para UI lee
contexto/DISENO_VISUAL_CacaoSmart.md. Después lee docs/ENTREGA_BRYAN.md,
docs/CONTINUAR.md, README.md y docs/visual-refresh-6.md. Los registros antiguos
de HANDOFF son históricos: no recrees funciones ya implementadas.

Inspecciona rama, commit, git status y herramientas. No sobrescribas trabajo
local, no hagas reset/clean ni cambies rama con trabajo pendiente. Confirma que
recibí el commit publicado de feature/agricultural-management, no solo main
9fe2dc1. No hagas commit/push/merge ni despliegues por tu cuenta.

Verifica Node 22 compatible, npm 11.6.2, Git y Docker antes de instalar. Sigue
la guía de entorno sin imprimir .env/secretos; conserva archivos existentes.
En una copia nueva autorizo preparar el entorno local de desarrollo e instalar
dependencias del lockfile; revisa el destino y pide confirmación antes de
migraciones sobre una base con datos importantes. Nunca borres volúmenes ni
uses migrate reset/db push. Cada equipo tiene sus cuentas y datos: Git no
transfiere PostgreSQL, fotos ni .local/simulator.json.

Ejecuta las verificaciones documentadas, preferiblemente una suite por vez,
en bases locales temporales cuando corresponda. Última evidencia registrada:
534 pruebas Angular y 43 Edge correctas; build/lint/tipos frontend correctos.
NO está certificada la suite global actual: hay un TS2322 conocido en
backend/src/weather/open-meteo.spec.ts:37 por la fixture de unidad inventada.
Reprodúcelo y repórtalo; no elimines el caso ni amplíes contratos productivos.
No aumentes timeouts ni desactives seguridad para hacer pasar las pruebas.

Prueba manualmente salud, login/registro/sesión, parcelas, inventario,
telemetría DEMO, rangos/alertas, fechas/CSV, IA privada simulada/comparación,
clima y responsive, según la guía A–G. Pide confirmación antes de crear
cuentas/parcelas/equipos, activar un simulador, subir fotos o cambiar rangos en
una base compartida. Prioriza las suites con fixtures aisladas.

Conserva permisos por propietario, FARMER sin privilegios administrativos,
cookie HttpOnly/Strict, renovación JWT y logout revocable. No guardes tokens
en localStorage ni desactives validación de origen. Primero prueba en
localhost:4200: el acceso LAN/login móvil sigue pendiente y no está autorizado
resolverlo debilitando CORS o modificando firewall.

No conectes OpenAI, no generes costos ni actives consultas externas de clima.
WEATHER_PROVIDER debe seguir disabled para la primera prueba. No toques
firmware, política de riego, roles o datos de campo. Relé no demuestra flujo;
no inventes litros/ahorro/predicción ni diagnóstico real.

Entrega primero un informe con versiones, rama/commit, comandos, resultados,
fallos reproducibles, capturas seguras, puntos no probados y un único siguiente
incremento recomendado. Distingue fallo de entorno, bloqueo conocido y
regresión. Espera mi autorización antes de corregir o seguir desarrollando.
```

## 15. Cómo subir esta entrega y el Word a GitHub

PULL descarga; PUSH sube. Estos comandos son instrucciones, no se ejecutaron al preparar el documento.

Si recibiste la confirmación de que el commit local ya está preparado, basta con:

```powershell
git status --short --branch
git log -1 --oneline
git push -u origin feature/agricultural-management
```

El directorio debe estar limpio. Los pasos de preparación detallados debajo
sirven como referencia o para cambios posteriores; no hace falta repetirlos
para un commit ya creado. Esta preparación no incluye push, merge ni despliegue.

### En el equipo del responsable

Revisar primero:

```powershell
git status --short --branch
git diff --stat
git diff --check
git fetch origin
git log --oneline --decorate -5
```

Si fetch revela cambios de Bryan, coordinar antes de integrarlos: el directorio actual tiene trabajo sin commit. No hacer pull con cambios pendientes ni forzar.

Después de revisar que no hay secretos y aceptar publicar la rama actual:

```powershell
git add -- .env.example README.md backend frontend packages scripts docs package.json package-lock.json CacaoSmart_Avance_y_Traspaso_Bryan.docx
git diff --cached --stat
git diff --cached --name-only
git diff --cached
```

Revisar todo lo preparado, incluidos archivos antes no seguidos. No debe aparecer .env, .local, node_modules, imágenes privadas, claves, cookies, copias de base o logs con datos sensibles. Si aparece alguno, NO hacer commit; detenerse y corregir la preparación sin borrar trabajo.

Confirmar que solo está preparado lo acordado. El ejemplo registra el conjunto de avances locales; no es un commit de "solo documento". El bloqueo de prueba de clima debe constar en la entrega; no presentarla como rama totalmente verde.

```powershell
git commit -m "feat: entrega gestion IA clima y revision visual con guia para Bryan"
git push -u origin feature/agricultural-management
git rev-parse --short HEAD
```

Enviar a Bryan el nombre de rama y el último hash. No usar --force. Si push rechaza por divergencias/permisos, detenerse y coordinar; no sobrescribir el remoto.

Abrir GitHub, seleccionar feature/agricultural-management y comprobar que se ven:

- CacaoSmart_Avance_y_Traspaso_Bryan.docx en la raíz.
- docs/ENTREGA_BRYAN.md y docs/PROMPT_BRYAN.md.
- Código de IA/clima, migraciones nuevas y lockfile.

Puede abrirse un Pull Request para revisión; no es necesario fusionar a main para que Bryan pruebe la rama. No fusionar sin acuerdo. Tras una fusión aprobada, el flujo de descarga cambia a main y debe comunicarse su nuevo commit.

### Descargar el Word

En GitHub seleccionar la rama de entrega, abrir el archivo .docx y usar Download raw file/Descargar archivo. Al clonar o hacer pull de esa rama también se descarga. Si GitHub no lo previsualiza, abrirlo localmente con Word o LibreOffice.

El archivo Word contiene esta guía y el prompt. Si se modifica el Markdown después, regenerarlo con:

```powershell
python scripts/export-handoff-word.py docs/ENTREGA_BRYAN.md CacaoSmart_Avance_y_Traspaso_Bryan.docx --overwrite
```

El exportador usa solo la biblioteca estándar de Python, sin instalar paquetes ni modificar dependencias de la aplicación. Sin --overwrite se niega a reemplazar un archivo existente; usar esa opción solo para actualizar este Word generado.

## 16. Rutas de referencia y cierre

- AGENTS.md y AGENTS_CacaoSmart_v1.4.md: reglas de desarrollo.
- contexto/DERCAS_CacaoSmart_v1.4.md: requisitos funcionales y técnicos.
- contexto/DISENO_VISUAL_CacaoSmart.md: objetivo visual documentado.
- docs/session-renewal.md: sesión y límites de seguridad.
- docs/phase-5-15-16.md: gestión visual de parcelas/equipos.
- docs/phase-6-1.md, phase-6-2.md y phase-6-3.md: IA DEMO, filtros y comparación.
- docs/visual-refresh-1.md a visual-refresh-6.md: renovación visual incremental.
- docs/requirements-status.md: matriz histórica, contrastar con entregas posteriores.
- backend/test/: pruebas de integración y navegador.
- scripts/integration-test.mjs: runner de bases temporales.

Entrega preparada para revisión y transferencia, no para producción. El siguiente paso de Bryan es probar y reportar; el siguiente desarrollo se decide con los resultados.
