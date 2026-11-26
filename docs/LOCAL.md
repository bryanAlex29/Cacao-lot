# CacaoSmart — uso local para el proyecto estudiantil

No se necesita hosting, dominio ni proxy HTTPS para presentar la web en este PC.
La base sigue siendo la configurada actualmente en Neon: **no es totalmente
offline**, requiere internet para PostgreSQL. No se cambia esa configuración.
OpenAI y la conexión física ESP32 quedan fuera de este incremento.

## Antes de presentar

En una terminal en la raíz del proyecto:

```powershell
npm.cmd run local:check
npm.cmd run local:health
```

El primero revisa la configuración sin mostrar secretos; el segundo comprueba
la API y la base. Si la API todavía no está iniciada, salud fallará: iniciarla
antes de repetir. Un resultado correcto no acredita sensores conectados.

## Iniciar

Si API y Angular ya están funcionando, **no iniciar otra copia**.
Abrir `http://localhost:4200/login` y usar `local:health`.

Si ambos están detenidos:

```powershell
npm.cmd run local:start
```

Mantener la terminal abierta. El comando inicia los mismos programas de
desarrollo existentes (NestJS con nodemon y Angular), sin instalar paquetes,
generar entornos, migrar, aprovisionar cuentas ni iniciar el simulador.
Conserva `.env`, base y proveedores actuales; no activa OpenAI.
Esperar a que ambos indiquen que están listos y ejecutar `local:health`
en otra terminal. Que el lanzador arranque no significa que la base responda.

Direcciones:

- Web: `http://localhost:4200/login`.
- Estado: `http://localhost:4200/estado`.
- Salud API: `http://127.0.0.1:3100/api/v1/health/live`.

Usar `localhost` para la web, coherente con el origen configurado. No sustituirlo
por una IP de red ni desactivar CORS para resolver errores.

El lanzador rechaza perfiles distintos de desarrollo/loopback/puertos 3100 y
4200, variables heredadas que contradigan `.env` o puertos ocupados. No cambia
puertos automáticamente y nunca termina un proceso preexistente.
Las comprobaciones de puerto no son una reserva: si otro proceso arranca después,
se informará el fallo del servicio y se cerrarán los procesos de esta sesión.

Si solo uno de los servicios ya está funcionando, usar los comandos separados
existentes para el que falta:

```powershell
npm.cmd run dev:backend
# O, en otra terminal:
npm.cmd run dev:frontend
```

No es necesario Docker cuando `.env` utiliza Neon. No ejecutar `db:up`,
`setup:env`, `db:migrate` ni cambiar la cadena de conexión para una presentación.

## Detener

Guardar trabajo, terminar solicitudes y detener el simulador en su propia
terminal si estaba activo. Después pulsar **Ctrl+C** en la terminal de
`local:start`. El lanzador cierra solo los procesos que creó y sus workers.
No cierra servidores iniciados desde otras terminales ni detiene Neon.

En Windows la limpieza del árbol propio usa `taskkill /PID /T /F`: es un cierre
forzado de procesos de desarrollo, no una parada de producción ni garantía de
finalizar solicitudes en vuelo. No usarlo durante respaldos u otras operaciones
administrativas. No hay servicio instalado ni arranque automático.
Con los comandos separados, detener cada terminal por separado.

## Recorrido breve para la demostración

Para exponer: [guion de siete minutos y preguntas frecuentes](GUIA_PRESENTACION.md).

Para casos ficticios reproducibles sin enviar nada a tu cuenta:
`npm.cmd run simulation:preview`. Ver [escenarios y pruebas aisladas](synthetic-simulations.md).
Este comando no inicia el simulador continuo ni modifica datos del dashboard.

1. Comprobar salud e iniciar sesión con la cuenta existente, sin compartir clave.
2. Seleccionar la parcela y el origen correcto.
3. Presentar A/B/C, ambiente, hora y calidad por separado.
4. Si se usa DEMO, mantener visible la etiqueta; iniciar el simulador únicamente
   con el comando y la configuración DEMO ya preparados, no desde este lanzador.
5. Mostrar historial, filtros, alertas y exportación según los datos disponibles.
6. Predicciones: presentar como experimentales. IA: demostrar solo su modo
   simulado; no atribuir diagnóstico real ni ahorro/litros sin evidencia.
7. Cerrar sesión al terminar.

Sin circuito no afirmar que la telemetría es física. El ESP32 no puede enviar
al `localhost` del PC: acceso de red y credenciales se revisarán aparte,
sin abrir firewall o modificar firmware en este incremento.

## Respaldo manual — opcional y explícito

No se genera automáticamente al iniciar/detener. Con internet y acceso Neon
existente, cuando quieras crear una copia:

```powershell
npm.cmd run backup:neon
```

Crea un conjunto privado DB+fotos y prueba su restauración en una base temporal,
que elimina al terminar. No restaura la principal; requiere permisos/herramientas
ya documentados y consume recursos de Neon. No cerrar durante su verificación.
Anotar el directorio que el comando informa y después:

```powershell
npm.cmd run ops:backup -- --directory .local/backups/bundle-FECHA-ID
```

Para copiar a un USB/disco externo, comprobar que está disponible y autorizar
un destino. El comando existente es:

```powershell
npm.cmd run backup:copy -- --directory .local/backups/bundle-FECHA-ID --destination F:\CacaoSmart-Respaldos
```

La letra F es solo el destino utilizado anteriormente: no asumir que sigue
siendo el mismo disco. No se copia nada automáticamente ni se sobrescribe un
conjunto existente. Los respaldos son privados; no compartirlos ni subirlos a Git.

## Si algo falla

- **Puerto ocupado:** usar el servicio ya abierto o detenerlo desde su terminal;
  no matar todos los procesos Node.
- **API viva, base caída:** revisar internet/Neon y volver a comprobar; no borrar
  datos ni restablecer contraseñas.
- **Lecturas antiguas:** comprobar fechas y fuente; no reemplazar REAL por DEMO
  silenciosamente.
- **Sesión/origen:** usar la dirección `localhost:4200`; no modificar cookies,
  roles o CORS como atajo.
- **Dependencias ausentes:** no instala automáticamente. Seguir README, comprobar
  Node/npm y conservar lock/configuración.

Para cambios futuros de operación existe [la guía ampliada](operations.md);
sus plantillas de hosting/HTTPS no se activan ni se necesitan para esta entrega.

## Verificación de esta entrega

### Ampliación autorizada: arranque y cierre (punto 1)

Se verificaron `local:check` y el rechazo de una segunda instancia cuando
los servicios seguían abiertos. Se ampliaron a nueve las pruebas de coordinación
de procesos: espera de ambos cierres, notificación única y error de limpieza.

El supervisor ahora inicia cada árbol en un grupo separado (`detached`) y
conserva su responsabilidad de cerrarlo por PID propio. Así no depende de que
watchers y supervisor reciban Ctrl+C en cierto orden. Un fallo de `taskkill`
ya no se oculta como limpieza correcta.
**Parada forzada de desarrollo:** no usar durante exportaciones, respaldos o
operaciones administrativas. No garantiza una parada transaccional de servicios.

La sesión anterior se identificó por comandos y parentesco y se detuvo por su
PID raíz antes del ensayo; no por nombre ni puerto. Eso fue preparación forzada,
no evidencia de Ctrl+C.

**Ctrl+C interactivo sigue pendiente.** Se intentó un emisor nativo de
`CTRL_C_EVENT` en consola separada, pero el entorno automatizado devuelve
`AttachConsole` inválido incluso con un proceso Node mínimo independiente del
proyecto. Por eso no se atribuye ese fallo a CacaoSmart ni se entrega el
lanzador experimental como una prueba aprobada. También hubo problemas del
lanzador con captura de stdout y stdin; evidencia privada en
`Temp/opencode/local-lifecycle-*`. `process.kill('SIGINT')` en Windows termina
el proceso por fuerza y tampoco demostraría el manejo de Ctrl+C.

Para cerrar la verificación en una terminal normal de Windows:

1. Si están detenidos, ejecutar `npm.cmd run local:start` y esperar API/Angular.
2. Desde otra terminal ejecutar `npm.cmd run local:health` y abrir `/login`.
3. Pulsar **Ctrl+C** en la terminal del arranque. Si npm/cmd solicita confirmación
   de finalizar el lote, responderla. Revisar que no se anuncia un cierre correcto
   si hubo un error.
4. Comprobar que 3100/4200 están libres y no quedan watchers/hijos de esa sesión.
   No detener procesos por nombre ni matar un PID que no se haya identificado.
5. Repetir el arranque y cierre. Mientras corre, una segunda invocación debe
   rechazarse sin cerrar la primera.

No se declara cerrado el punto 1 hasta completar esa comprobación real.

- 7 pruebas de sesión local y 30 operativas correctas tras la prueba de arranque.
- Lint y tipos correctos; formato de los archivos nuevos comprobado.
- `local:check` correcto; `local:health` confirma API/base disponibles.
- Puertos 3100 y 4200 ya ocupados; `local:start` rechazó una segunda sesión.
  Los servicios existentes permanecieron disponibles y `/login` respondió 200.
- Prueba posterior autorizada por el usuario: se detuvieron tres watchers nodemon
  identificados del proyecto y Angular; el arranque desde cero detectó que
  nodemon está instalado en `backend/node_modules`, no en la raíz. Se corrigió
  con resolución de módulos desde cada workspace y se añadió una regresión.
- Tras corregirlo, el lanzador inició NestJS y Angular: live, ready, `/login` y
  ready a través del proxy Angular respondieron HTTP 200. Se dejaron funcionando.
  Esperar la compilación inicial; durante ese intervalo puede aparecer un
  ECONNREFUSED transitorio en el proxy antes de que NestJS escuche.
- En la entrega inicial el Ctrl+C real y cierre de workers no tenían ensayo;
  la ampliación anterior registra el estado actualizado.
- No se ejecutó respaldo ni copia, ni se modificaron Neon, `.env`, credenciales,
  configuración de red, firmware o OpenAI durante este incremento.
