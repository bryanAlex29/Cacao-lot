# PostgreSQL en Neon: respaldo y comprobación sin Docker

La aplicación conserva Angular, NestJS, PostgreSQL y Prisma. Solo la base está
alojada en Neon: el frontend y la API siguen ejecutándose localmente. No publicar
`.env`, cadenas de conexión, archivos de recuperación de acceso ni respaldos.

## Arranque

Con el `.env` privado ya configurado:

```powershell
npm.cmd run dev:backend
npm.cmd run dev:frontend
```

No ejecutar `db:up` para este entorno. `db:migrate` sigue siendo el comando para
aplicar migraciones versionadas pendientes, no para restablecer ni borrar datos.
La URL debe usar `sslmode=verify-full`. La configuración anterior permanece en
una copia privada ignorada bajo `.local`.

## Crear y verificar un respaldo

```powershell
npm.cmd run backup:neon
```

Requisitos: conexión Neon no productiva, permiso del rol para crear bases
temporales, cliente Prisma generado y herramientas `pg_dump`/`pg_restore`
compatibles con la versión del servidor. En este equipo se detecta PostgreSQL 18
en `C:\Program Files\PostgreSQL\18\bin`. En otro equipo puede indicarse una carpeta
absoluta mediante la variable `PG_BIN`; la herramienta no instala software.

El comando:

1. Valida el destino Neon, TLS y parámetros de conexión, rechazando redirecciones.
2. Usa el endpoint **directo** para las herramientas nativas y las conexiones de
   verificación. No modifica la URL agrupada del `.env` que utiliza la API.
   `pg_dump`, `pg_restore`, ajustes de sesión e instantáneas exportadas no deben
   depender de un pool de transacciones.
3. Captura conteos, huellas y referencias a fotos en una transacción
   `RepeatableRead`; `pg_dump --snapshot` utiliza esa misma instantánea.
4. Copia solo las fotos privadas referenciadas y publica `before.json` v2 al
   finalizar. Incluye todas las tablas públicas, migraciones y sesiones.
5. Restaura el archivo completo en una base nueva de nombre aleatorio
   `cacaosmart_restore_*`; compara todas las tablas, conteos, huellas y fotos.
6. Elimina únicamente esa base temporal. Escribe `restore-check-*.json` solo si
   también terminó la limpieza. **Nunca restaura sobre la base principal**.

Los conjuntos quedan en `.local/backups/bundle-*`, excluidos de Git y compatibles
con el formato del copiador privado existente. Son privados:
contienen información de cuentas, hashes de contraseña y sesiones. Proteger las
ACL de Windows. El certificado CA temporal es público y se retira al finalizar.
Contraseñas de libpq se pasan por entorno, no por argumentos ni por consola;
se descartan variables `PG*` heredadas que puedan alterar el destino.

Un conjunto sin `before.json` está incompleto. Un conjunto sin informe
`restore-check-*.json` aún no acredita una restauración verificada. Si hay
diagnósticos pendientes, fotos ausentes o errores de integridad, la operación
falla sin silenciarlos. No borrar restos ni bases temporales ajenas
automáticamente.

Es un respaldo **a demanda**, no una tarea programada ni una segunda copia fuera
del equipo. Los comandos previos `backup:create`, `backup:verify` y
`backup:periodic` conservan sus guardas de Docker local: no usarlos con Neon.
Frecuencia, retención, cifrado y copia externa requieren una decisión posterior.
La verificación y las pruebas consumen conexiones/recursos del proyecto Neon.

## Pruebas sin alterar la cuenta real

```powershell
npm.cmd run test:backup:neon
npm.cmd run test:backup
npm.cmd run test:integration:neon
npm.cmd run test:browser:neon
npm.cmd test
npm.cmd run smoke
```

Los runners Neon crean una base `cacaosmart_test_*` independiente por suite,
aplican migraciones, ejecutan las pruebas existentes y eliminan su propia base
en `finally`. No debilitan las guardas del runner Docker ni insertan cuentas,
parcelas o telemetría ficticias en la base principal. Para ejecutar una sola:

```powershell
npm.cmd run test:integration:neon -- --suite=security.integration.ts
```

El navegador real puede utilizar Chrome o Edge instalado; admite
`BROWSER_EXECUTABLE_PATH`. El recorrido automatizado usa cuentas sintéticas
exclusivamente en la base temporal; no necesita cambiar la contraseña real.
No acredita integración con ESP32 ni diagnóstico OpenAI real.

## Evidencia del 25/11/2026

- Respaldo final privado
  `.local/backups/bundle-2026-11-25T07-05-25.777Z-ee5d80d2ae9281b7`:
  **20 tablas idénticas** al manifiesto tras restauración real aislada,
  SHA-256 coincidente y 0 fotografías referenciadas. Informe
  `restore-check-66e4725ca880a44f.json`; destino temporal eliminado.
- Principal comprobada por consultas de solo lectura: 1 cuenta, 1 parcela,
  1 dispositivo, 6 sensores, 1.712 lecturas y 5.136 lecturas de suelo.
  Cero índices inválidos y cero restricciones sin validar.
- Pasaron 362 pruebas unitarias de backend y 601 de frontend; 69 pruebas de
  scripts (Neon, respaldo local, programación, copia, simulador y contrato IoT).
  Lint, tipos, compilación, formato de archivos afectados y `git diff --check`
  correctos; salud live/ready y OpenAPI responden correctamente.
- La primera matriz de navegador pasó 43 de 44 casos; un flujo de edición de
  rango superó su límite de 30 s. Se amplió únicamente ese límite a 60 s, sin
  cambiar sus aserciones ni tiempos de la aplicación.
- Dos pruebas de humedad dependían del reloj real mientras SQL remoto consumía
  su ventana de frescura sintética. Ahora usan el reloj de la fixture; los casos
  de pausa/antigüedad mantienen un reloj explícito y las mismas aserciones.
  No se alteraron reglas de alertas, rangos ni firmware.
- Repetición completa de navegador: **44 de 44 pruebas aprobadas** en Edge real
  y PostgreSQL Neon aislado. Incluye login, CSV, riego, reconexión, rangos,
  alertas, sesiones, móvil, IA DEMO, clima y exportación de predicción. Base
  temporal eliminada al terminar.
- En backend ya pasaron IA (20), sesiones (6), humedad (17), desconexión (21)
  y predicción/exportación (26). En tiempo real, una prueba de duplicados
  comprobaba la llegada del primer evento después de solo 100 ms; ahora espera
  ese evento explícitamente, con límite de 7 s y comprobación de su identidad.
  Conserva las aserciones contra duplicados y no altera Socket.IO de producción.
- Tiempo real: **22 de 22 pruebas aprobadas** tras esperar el primer evento
  explícitamente.
- La CLI `admin:create` conserva su protección de desarrollo/local: no se habilitó
  para la base principal de Neon. La prueba de seguridad ahora exige su rechazo
  remoto y cero cuentas creadas; en local conserva las aserciones del bootstrap.
  La cuenta real ya recuperada no requiere ese comando.
- Seguridad: **17 de 17 pruebas aprobadas**, incluida la prohibición del bootstrap
  remoto, roles, propiedad, sesión, registro y límites de solicitudes.
- Cierre de las suites restantes: rangos **39/39**, telemetría **29/29** y clima
  **15/15** aprobadas. Las diez suites de integración del cierre de Neon sumaron
  212 pruebas correctas entre las ejecuciones completas y repeticiones acotadas,
  sin sumar intentos fallidos ni duplicar casos repetidos.
- Comprobación final del cierre de Neon: cero bases temporales restantes, datos
  principales intactos e integridad del respaldo confirmada. Informe privado
  `.local/neon-final-verification.json`. Las cifras anteriores son evidencia de
  ese cierre, no sustituyen las verificaciones de incrementos posteriores.

Las cuentas y fotografías sintéticas de las matrices permanecen únicamente en
bases/almacenamiento de prueba, no en la principal. No se modificó la contraseña
de la cuenta real para ejecutar la matriz.

En algunas suites, `pg` muestra una advertencia de compatibilidad futura por
consultas concurrentes; una ejecución de tiempo real también avisó que Jest
tardaba más de un segundo en cerrar. Los procesos terminaron y sus bases se
eliminaron, sin recurrir a `--forceExit`. No se actualizaron dependencias ni se
afirma haber corregido avisos internos del adaptador ajenos al cambio de host.
