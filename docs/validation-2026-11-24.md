# Validación integral local — 24 de noviembre de 2026

Ejecución en Windows, noche local del 24 (25 de noviembre UTC). Revisión del
estado existente, sin implementar funciones nuevas ni modificar código productivo.

## Resultados de esta ejecución

- ESLint: correcto.
- Tipos de los tres workspaces: correctos.
- Compilación NestJS y Angular: correcta.
- Backend Jest: 338 pruebas, 19 suites correctas.
- Frontend: 551 pruebas, 35 archivos correctos.
- Integración HTTP/PostgreSQL/Socket.IO: 199 pruebas, 10 suites correctas.
- Navegador Edge: 44 recorridos correctos.
- Simulador: 10 pruebas correctas.
- CLI de persistencia offline: 2 pruebas correctas.
- CLI de regresión offline: 1 correcta, 1 fallida; falta entorno Python privado.
- Respaldo, pruebas unitarias: 8 pruebas correctas.
- Regresión de seguridad Effect/Prisma: 2 correctas; no equivale a auditoría completa.
- Prisma validate: esquema válido.
- Smoke: API live/ready 200, rutas OpenAPI presentes.
- Formato global: no aprobado, 281 archivos señalados.
- Diagnóstico con `--end-of-line auto`: 10 archivos; no se cambió configuración.

El bloqueo antiguo TS2322 de la fixture de clima ya estaba corregido en esta
copia; no se reprodujo ni requirió otro cambio.

## Seguridad de los datos y alcance

- Integración y navegador usaron bases `cacaosmart_test_*` generadas por el
  ejecutor, con migraciones y eliminación de esas bases al terminar. No se
  restauró ni reseteó la base principal.
- Las consultas a la base principal mantuvieron una cuenta y una parcela; el
  simulador existente continuó agregando lecturas exclusivamente DEMO.
- No se cambiaron credenciales, roles, firmware, dependencias, configuración
  privada, puertos ni configuración de proveedores externos.
- Las pruebas de navegador usaron datos sintéticos y sesiones aisladas, no la
  contraseña ni la sesión del usuario. Capturas privadas de prueba en
  `C:\Users\Hp\AppData\Local\Temp\opencode\cacaosmart-browser-zaaJYZ`.
- No se conectaron ESP32, OpenAI ni un proveedor meteorológico real. Estas
  pruebas no certifican producción, calibración, cámara física ni una sesión
  de ocho horas de duración real.

## Hallazgos pendientes

1. **Regresión offline:** falta `.local/prediction-python/Scripts/python.exe`.
   El CLI rechaza la ejecución como está previsto; no se instalaron paquetes
   automáticamente. Preparar el entorno siguiendo
   [la guía de regresión](prediction-offline-regression.md), comprobar primero
   Python compatible y repetir `test:regression-python` y
   `test:regression-cli`. La persistencia offline sí pasó.
2. **Formato:** Git muestra LF en el índice y CRLF en archivos del directorio
   de trabajo. Al tolerar finales de línea, el diagnóstico baja de 281 a 10
   archivos. Quedan diferencias de estilo adicionales; no se reformatearon
   masivamente archivos ni se relajó el chequeo del proyecto.
3. **PostgreSQL:** persiste la advertencia de consultas concurrentes de `pg`.
   No impidió las pruebas; no se ocultó ni se actualizó la dependencia.
4. **Herramientas:** Node 22.23.5, npm global 10.9.9, Git 2.54.0.windows.1,
   Docker 29.9.3 y Compose 5.7.0. npm global es inferior al requisito de
   instalación (11.6.2); se usaron dependencias existentes, sin instalar.
   Para futuras instalaciones usar la versión indicada por el proyecto.

## Comandos

Se ejecutaron `npm.cmd run lint`, `typecheck`, `build`, `npm.cmd test`,
`test:integration`, `test:browser` (Edge instalado mediante
`BROWSER_EXECUTABLE_PATH`), `test:simulator`, `test:prediction-cli`,
`test:regression-cli`, `test:backup`, `test:dependency-security`,
`db:validate`, `smoke`, `format:check` y `git diff --check`.

Diagnóstico adicional, solo lectura:
`node node_modules/prettier/bin/prettier.cjs --check frontend backend packages scripts package.json docker-compose.yml eslint.config.mjs .prettierrc.json README.md docs --end-of-line auto`.

**Siguiente incremento recomendado:** preparar y validar el entorno privado de
regresión offline. La regresión experimental ya existe; no recrearla ni
presentarla como pronóstico agrícola operativo. No confundir la preparación
del entorno con validación de un modelo con datos reales.

## Actualización posterior — entorno de regresión preparado

El usuario autorizó preparar el entorno privado. Se extrajo Python oficial
3.11.9 x64 en `.local/prediction-runtime`, se creó
`.local/prediction-python` y se instalaron las siete dependencias del lock con
hashes y ruedas binarias. Python global permanece en 3.14.6.

`pip check`, las **12 pruebas Python**, las **2 pruebas CLI de regresión** y la
demo completa finalizaron correctamente. El fallo por entorno ausente queda
resuelto; los resultados anteriores se conservan como registro de la revisión.
Dataset e informe de la demo coinciden con los hashes de su marcador de
finalización; las tres zonas siguen siendo experimentales, no validadas en campo.

Detalles y comandos en [regresión offline](prediction-offline-regression.md).
No se cambiaron base de datos, firmware, código productivo ni dependencias npm.
Persisten los pendientes de formato y la advertencia de concurrencia de `pg`.
