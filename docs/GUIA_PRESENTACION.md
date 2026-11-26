# Guía de presentación — CacaoSmart IoT

**Duración sugerida:** 7 minutos y preguntas. Proyecto estudiantil; demostración
local con datos simulados identificados. No requiere contratar hosting o dominio.

## 1. Preparación antes de exponer

- Conectar el computador a corriente y comprobar internet: Angular y NestJS
  corren en el PC, pero PostgreSQL está en Neon. No es totalmente offline.
- Cerrar notificaciones y pestañas con información privada.
- Abrir `http://localhost:4200/login`; utilizar una cuenta propia ya preparada.
  No proyectar contraseña, API key, `.env`, cookies ni cadena de conexión.
- Tener seleccionada una parcela y confirmar que el origen es **DEMO**.
- Revisar qué datos hay: no prometer alertas, modelos o diagnósticos existentes
  sin comprobarlos antes. No crear cuentas ni cambiar roles durante la exposición.
- Preparar una imagen de cacao autorizada, si se mostrará el diagnóstico DEMO.
- Ensayar una vez el recorrido y descargar un CSV autorizado si se desea mostrarlo.

Comprobación previa desde la raíz:

```powershell
npm.cmd run local:check
npm.cmd run local:health
```

Si ambos servicios están detenidos, iniciar `npm.cmd run local:start`, esperar
la compilación y repetir salud en otra terminal. Si ya están abiertos, no iniciar
otra copia. Detalles en [uso local](LOCAL.md).

Para ver cambios en vivo, usar **solo si la configuración DEMO ya está preparada
y autorizada** el simulador existente en otra terminal:

```powershell
npm.cmd run simulator -- --count 12
```

Envía hasta 12 eventos al dispositivo DEMO configurado y termina; **sí escribe
datos simulados en ese canal**. No aprovisionar, cambiar credenciales ni iniciar
el simulador durante esta entrega documental. Si no está preparado, presentar
el historial disponible sin afirmar que llegan lecturas nuevas.

## 2. Guion de siete minutos

### 0:00–0:45 · Problema y objetivo

**Mostrar:** título del proyecto o dashboard.

> «CacaoSmart IoT es un prototipo estudiantil para apoyar el monitoreo de cacao.
> Reúne humedad del suelo de tres zonas, condiciones ambientales e historial,
> para que el productor pueda consultar qué sucede en su parcela.»

> «Hoy mostramos el software local con datos simulados. La integración física
> y la calibración de sensores todavía requieren pruebas con el circuito real.»

No afirmar una reducción medida de agua ni mejora del rendimiento agrícola.

### 0:45–1:30 · Cómo funciona

**Explicar brevemente:**

```text
Sensores → ESP32 → API NestJS → PostgreSQL → Angular
                               └→ Socket.IO para actualizaciones
```

> «La aplicación usa Angular, NestJS y PostgreSQL con Prisma. Los datos se validan
> y guardan antes de notificarlos al navegador. En esta demostración, un
> simulador sustituye el envío del ESP32 usando la misma entrada de telemetría.»

> «El control físico del riego corresponde al ESP32; la web no abre una válvula
> ni hace depender su cierre de la conexión a internet.»

Es una responsabilidad de diseño, no una prueba física ya realizada.
Una sola electroválvula no equivale a riego independiente de tres zonas.

### 1:30–3:00 · Parcela y monitoreo

**Hacer:** iniciar sesión sin proyectar credenciales, abrir la parcela y mantener
visible la etiqueta DEMO. Señalar A/B/C, ambiente, lluvia y última actualización.

> «Cada sonda conserva su identidad: no mezclamos las tres humedades en un
> promedio que oculte diferencias. También mostramos fecha y calidad.»

> «Un dato ausente aparece como “Sin datos”, no como cero. Cero puede ser una
> lectura válida. “Sin rango configurado” no significa que el cultivo esté normal.»

Si llegan eventos del simulador, señalar una actualización sin recargar.
Si no llegan, mostrar la fecha real y explicar que se consulta histórico.
No cambiar de REAL a DEMO silenciosamente.

**Riego observado:**

> «La orden del relé y la confirmación física son datos diferentes. Sin un sensor
> que confirme apertura, la aplicación no afirma que la válvula esté abierta.»

### 3:00–4:00 · Historial, alertas y reportes

**Hacer:** abrir historial, elegir un rango corto que tenga datos y señalar las
tres series. Mostrar alertas si existen y la opción de exportación CSV.

> «Podemos consultar el historial por fecha y exportar lecturas autorizadas.
> Las alertas distinguen la condición observada de su reconocimiento: reconocer
> una alerta no resuelve automáticamente la causa.»

No modificar umbrales durante la exposición salvo que se haya ensayado con una
cuenta autorizada. Un FARMER puede no tener permisos de edición: es lo esperado.
Si no hay alertas, decirlo; no crear resultados ficticios para llenar el panel.

### 4:00–5:00 · Pruebas con fallos simulados

**Mostrar:** resumen de escenarios o la vista previa offline:

```powershell
npm.cmd run simulation:preview
```

> «Además del recorrido normal probamos una sonda ausente, datos inválidos,
> duplicados, mensajes atrasados y pérdida de conexión. Los datos de prueba son
> reproducibles, y las pruebas de integración se ejecutan en bases temporales
> separadas de la cuenta principal.»

La vista previa solo imprime JSON; **no actualiza el dashboard**. No confundirla
con el simulador continuo. El rango ilustrativo 30–70 % no es agronómico.
No cortar internet en plena exposición: Neon también lo necesita. Explicar
el ensayo automatizado de reconexión sin provocar una interrupción no ensayada.

**Evidencia registrada de la batería sintética:**

- 13 pasos nuevos: nueve lecturas únicas, duplicados sin escritura extra y
  rechazos esperados.
- 29 pruebas de telemetría, 22 de tiempo real y 46 recorridos de navegador.
- Además, 384 pruebas backend y 614 frontend en esa ejecución.

Son resultados de software en entorno de prueba, no porcentaje de precisión
agronómica ni certificación de hardware.

### 5:00–6:15 · IA y predicción: alcance honesto

**Hacer:** abrir diagnóstico o predicción únicamente si quedó ensayado.

> «El flujo fotográfico permite seleccionar una imagen, confirmar consentimiento
> y consultar resultados privados. Actualmente el proveedor es simulado:
> OpenAI no está conectado y no estamos diagnosticando enfermedades reales.»

> «La predicción de humedad es experimental. Comparamos referencias y regresión
> con separación cronológica; si faltan datos o modelo, mostramos la ausencia
> en vez de inventar un pronóstico.»

No subir fotografías personales, mostrar diagnósticos de otra cuenta ni decir
que el modelo determina litros o fecha de riego. Si no hay modelo en esa parcela,
«No disponible» es un resultado correcto; no registrar uno durante la presentación.

### 6:15–7:00 · Cierre y siguientes pasos

> «Hemos comprobado el recorrido del software con simulación, incluyendo
> persistencia, actualización en vivo, permisos y recuperación de conexión.»

> «Lo siguiente es conectar el ESP32, validar y calibrar las lecturas y reunir
> historial real. Eso permitirá evaluar las predicciones en campo. OpenAI será
> una integración independiente cuando se autorice.»

> «El proyecto se alinea con el uso responsable del agua, pero no afirmamos
> ahorro medido hasta contar con caudal calibrado y una línea base comparable.»

Cerrar sesión si termina la demostración; no detener servidores mientras haya
una exportación u operación administrativa en curso.

## 3. Respuestas cortas para preguntas

**¿Ya funciona con sensores reales?**
«El software está probado con simulación. La conexión física y calibración
se verificarán con el circuito; no las damos por demostradas todavía.»

**¿Qué ocurre si se pierde internet?**
«La web puede perder acceso a la base Neon y mostrar desconexión. El ESP32 debe
conservar control local seguro; ese comportamiento físico requiere validación
supervisada. La reconexión del software sí tiene pruebas automatizadas.»

**¿Cuánta agua ahorra?**
«Aún no tenemos una cifra medida. Necesitamos medición o caudal calibrado y una
línea base comparable; no usamos porcentajes ilustrativos como resultados.»

**¿La IA detecta enfermedades?**
«Todavía no: el flujo actual es DEMO. Incluso con un proveedor real, el análisis
será orientativo y no sustituirá a un profesional.»

**¿Qué precisión tienen las predicciones?**
«Hay métricas retrospectivas experimentales en datos de prueba. La precisión
en cultivo real sigue pendiente de evaluación con historial de campo.»

**¿Por qué datos por código y no cifras inventadas por una IA?**
«Permiten conocer la entrada y el resultado esperado y repetir el mismo caso.
No necesitamos OpenAI para simular telemetría ni le atribuimos realismo agrícola.»

**¿Se abre la válvula desde la página?**
«No. La página muestra observaciones. Las predicciones no mandan órdenes de riego.»

**¿Por qué no está publicada?**
«El alcance estudiantil es una demostración local. La base usa Neon, pero no
hemos contratado hosting ni dominio para la web y la API.»

## 4. Plan de respaldo durante la exposición

- **Si falla internet/base:** no cambiar `.env` ni usar cuentas nuevas. Mostrar
  capturas, CSV o video preparados previamente y etiquetados como grabación/DEMO.
  No afirmar que son datos en vivo.
- **Si falla el inicio:** revisar `/estado` y `local:health`; no reinstalar,
  migrar o borrar datos delante del público.
- **Si no hay lecturas/modelo/alertas:** explicar el estado visible; no ocultarlo
  con datos inventados.
- **Si falta tiempo:** conservar problema, tres sensores, historial, separación
  DEMO/REAL y límites. Omitir IA/predicción antes que exagerar resultados.

Esta guía no crea capturas, video ni diapositivas: prepararlos y revisarlos antes.
No mostrar logs privados ni usar el respaldo de base como material público.

## 5. Material para llevar

- Computador, cargador e internet comprobado.
- Guía y cuenta propia ensayada, sin contraseñas impresas en diapositivas.
- Capturas o video DEMO autorizados como alternativa, si se preparan.
- CSV saneado opcional, sin información privada.
- Código completo en una versión identificable para entrega, si se solicita:
  no incluir `.env`, `.local`, credenciales, respaldos ni `node_modules`.
  Esta guía no hace commit ni publica el repositorio.

Referencias: [uso local](LOCAL.md), [simulaciones y evidencia](synthetic-simulations.md),
[ficha del ESP32](ESP32_FICHA_INTEGRACION.md).
