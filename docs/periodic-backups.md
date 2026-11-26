# Respaldos periódicos locales con verificación

## Estado

Comando opcional implementado y probado. **No está activado permanentemente**:
no se instaló una tarea de Windows, servicio, arranque automático ni proceso
periódico en segundo plano.

En esta entrega se ejecutó **un único ciclo** sobre la base local actual:
20 tablas y 0 fotografías, creadas y recuperadas en una base temporal con
verificación de contenido. La principal no se restauró ni reseteó.

Respaldo nuevo:
`.local/backups/bundle-2026-11-25T03-15-39.801Z-3e779ebb55537a83`.
La copia anterior en F: no se actualiza automáticamente.
Se añadió después una [segunda copia verificada mediante comando explícito](external-backup-copy.md):
el mismo conjunto reciente está también en F:, conservando el anterior. Los
ciclos periódicos no llaman a esa copia externa automáticamente.

## Uso

Desde la raíz, con Docker y PostgreSQL disponibles:

```powershell
# Crear y verificar una copia; termina al completar el ciclo.
npm.cmd run backup:periodic -- --once

# Activación explícita mientras esta terminal y el equipo sigan activos.
npm.cmd run backup:periodic -- --interval-minutes 60
```

El modo continuo hace un primer ciclo inmediatamente. Después espera el
intervalo completo **desde que termina** el ciclo anterior; nunca superpone
operaciones ni intenta recuperar todas las horas perdidas después de una pausa.
Intervalos enteros admitidos: 60–10080 minutos, por defecto 60.

**Ctrl+C** solicita detener la espera o terminar después del ciclo en curso.
No se interrumpe voluntariamente una verificación antes de su limpieza. No
cerrar por la fuerza la terminal ni apagar el equipo mientras trabaja:
una interrupción abrupta puede dejar archivos incompletos, bloqueo o base temporal.

Esto es automatización local dependiente de un proceso, no una garantía de
respaldo aunque el equipo esté apagado, suspendido o Docker no esté disponible.
La espera y cancelación se probaron con reloj inyectado; no se esperó una hora
real ni se certificó el comportamiento ante corte de energía.

## Qué hace un ciclo

1. Ejecuta el creador existente, con instantánea PostgreSQL y fotografías
   referenciadas, dentro de `.local/backups`, excluido de Git.
2. Consume `backup:create -- --json`, un resultado versionado con directorio
   relativo y conteos; no interpreta el mensaje humano ni imprime datos de
   cuentas, URL de base o errores internos del proceso hijo.
3. Comprueba que el directorio pertenece al área privada, tiene el formato de
   conjunto fechado y contiene el marcador/manifiesto de creación.
4. Ejecuta `backup:verify` exclusivamente sobre una base temporal generada por
   esa herramienta; nunca permite seleccionar la principal como restauración.
5. Solo informa **verificado** después de que termine correctamente. Cada
   conjunto verificado conserva su informe `restore-check-*.json`.

Un fallo no se presenta como éxito y no borra copias anteriores ni el conjunto
incompleto. `--once` sale con error. El modo continuo informa el fallo y espera
el intervalo normal antes de otro intento; comprobar siempre los mensajes y
los informes, no asumir protección por tener el proceso abierto.

Siguen vigentes las guardas del
[respaldo conjunto](current-backup-bundle.md): solo PostgreSQL local coherente
con Compose, nunca producción; diagnósticos pendientes impiden crear una copia
que se anuncie como completa.

## Bloqueo y límites

- Un `periodic.lock` privado impide dos ejecutores periódicos en el mismo
  directorio de proyecto. Contiene identificador aleatorio, PID y fecha.
- Solo el proceso que conserva su identificador puede liberar su bloqueo.
  No se borra automáticamente un bloqueo existente, aunque parezca antiguo.
- Si queda tras un cierre abrupto, inspeccionar el PID y los comandos de los
  procesos antes de intervenir; un PID reutilizado no prueba que sea el mismo
  proceso. No borrar un bloqueo activo ni bases temporales desconocidas.
- Los procesos hijos se lanzan sin shell y con comandos fijados, en grupo
  separado para no propagarles el Ctrl+C de la consola del supervisor.
  No hay comandos arbitrarios, destinos externos ni limpieza automática por CLI.
- No hay retención/borrado automático, cifrado, copia externa automática ni monitorización
  web. Vigilar el espacio libre: un respaldo periódico puede llenar el disco.
- El respaldo contiene datos privados y hashes de autenticación; no compartirlo
  ni versionarlo. Los permisos POSIX no sustituyen una revisión de ACL en Windows.
- No incluye `.env` ni la clave IoT en texto de `.local/simulator.json`;
  respaldar la base no equivale a respaldar toda la configuración del equipo.

Una copia en el mismo equipo no protege contra todas las fallas físicas.
La copia externa dispone de un [comando separado](external-backup-copy.md) con
destino explícito, sin activación automática.

## Archivos y pruebas

- `scripts/periodic-backup.mjs`: supervisor de comandos fijados.
- `scripts/periodic-backup-core.mjs`: argumentos, selección de conjunto,
  bloqueo exclusivo y ciclos secuenciales.
- `scripts/create-backup.mjs`: añade `--json`; conserva la salida y uso normal.
- `scripts/periodic-backup.test.mjs`: 9 pruebas correctas.
- `scripts/backup-bundle.integration.mjs`: ampliada para ejecutar `--once`
  con PostgreSQL/JPEG sintéticos aislados; 1 prueba integral correcta, incluida
  limpieza, restauración y rechazo de corrupción.
- Pruebas anteriores de respaldo: 8 correctas.
- Backend: 354 pruebas correctas; Angular: 601 correctas.
- Lint, tipos de todos los workspaces y build backend/frontend correctos.

Comandos: `test:backup:periodic`, `test:backup`, `test:backup:integration`,
`npm.cmd test`, `lint`, `typecheck`, `build`.

No se cambió el esquema, firmware, roles, credenciales, providers externos ni
reglas de riego. No se activó una programación horaria durante esta entrega.
