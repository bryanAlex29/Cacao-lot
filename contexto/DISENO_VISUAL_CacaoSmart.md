# Referencia visual — CacaoSmart IoT

**Fecha:** 2026-11-20 · **Origen:** captura de pantalla aportada por el usuario en la conversación.

## 1. Alcance y fidelidad

Este documento registra los colores, la estructura y los componentes visibles en la referencia de escritorio de **1672 × 941 px**. Los códigos hexadecimales, medidas y tamaños tipográficos son **aproximaciones visuales**, no valores extraídos del código fuente. La fuente tipográfica no está identificada.

La captura no demuestra que existan integraciones, interacciones o mediciones reales. Las cifras y estados del mockup son ilustrativos. Los requisitos funcionales y de seguridad de [DERCAS](DERCAS_CacaoSmart_v1.4.md) prevalecen sobre cualquier texto o cifra de la imagen.

La imagen original no se ha guardado como archivo en el proyecto; esta documentación describe el adjunto de la conversación.

## 2. Identidad y paleta

Panel agrícola de monitoreo: verdes como identidad, fotografías de cacao y riego, tarjetas claras y métricas grandes.

| Uso | Color aproximado | Aplicación |
|---|---|---|
| Verde oscuro | `#002D1B` | Fondo del menú lateral |
| Verde principal | `#009B08` | Navegación activa, botones, iconos y valores destacados |
| Verde suave | `#E8F7E6` | Estados normales y fondos de indicadores |
| Blanco | `#FFFFFF` | Encabezado y tarjetas |
| Gris muy claro | `#F5F7F5` | Fondo general |
| Gris de bordes | `#E2E7E2` | Separadores y contornos |
| Negro suave | `#111111` | Títulos y cifras |
| Gris de texto | `#5F655F` | Etiquetas y datos secundarios |
| Rojo | `#FF3038` | Alertas, posible enfermedad y humedad baja |
| Rosa claro | `#FDE5E5` | Fondo de avisos críticos |
| Azul | `#087BFF` | Información, agua y serie del sensor 3 |
| Azul claro | `#DCEFF7` | Mensajes informativos |
| Naranja | `#FF9700` | Advertencias y serie del sensor 2 |
| Cian | `#06BCD4` | Tarjeta ODS 6 |

El verde identifica marca y estados saludables; rojo, naranja y azul distinguen advertencias e información. Los estados deben combinar **color, texto e iconos**. Verificar contraste antes de implementar: esta paleta no constituye una certificación de accesibilidad.

## 3. Estructura de escritorio

- Barra lateral izquierda: aproximadamente **260 px**, cerca del 16 % del ancho de referencia.
- Área principal: ocupa el ancho restante.
- Encabezado blanco: aproximadamente **78 px** de altura.
- Contenido: rejilla de tarjetas con separaciones aproximadas de **10–16 px**.
- Primera franja: banner fotográfico a todo el ancho del contenido.
- Segunda franja: humedad de tres zonas, condiciones ambientales y lluvia.
- Tercera franja: sistema de riego a la izquierda y diagnóstico IA a la derecha.
- Franja inferior: gráfica a la izquierda; consumo y alertas arriba a la derecha; ODS debajo.

```text
┌──────────────┬─────────────────────────────────────────────────┐
│              │ Parcela y ubicación         Conexión / Usuario  │
│              ├─────────────────────────────────────────────────┤
│              │ Banner fotográfico y mensaje principal          │
│              ├───────────────────────┬───────────────┬─────────┤
│ Menú         │ Humedad: 3 sensores    │ Ambiente      │ Lluvia  │
│ lateral      ├───────────────────────┴───┬───────────┴─────────┤
│              │ Sistema de riego          │ Diagnóstico con IA  │
│              ├───────────────────────────┼───────────┬─────────┤
│              │                           │ Consumo   │ Alertas │
│              │ Gráfica de humedad        ├───────────┴─────────┤
│              │                           │ Contribución ODS    │
└──────────────┴───────────────────────────┴─────────────────────┘
```

## 4. Navegación lateral

- Fondo verde oscuro; logotipo de cacao arriba.
- Nombre **CacaoSmart IoT** blanco y en negrita.
- Subtítulo centrado: «Riego Inteligente para Cultivos de Cacao».
- Opciones con iconos lineales blancos y texto alineado a la izquierda.
- Ilustración de hojas y marca institucional ESPAM MFL / TerriTech Hackathon CITIC 2026 al pie.

Orden visible:
1. Inicio.
2. Monitoreo.
3. Parcelas.
4. Diagnóstico IA.
5. Historial.
6. Riego.
7. Consumo de agua.
8. Alertas.
9. Reportes.
10. Configuración.

«Inicio» aparece con fondo verde intenso y esquinas redondeadas. «Diagnóstico IA» tiene un fondo verde más tenue. La captura no permite confirmar si ese segundo resaltado representa foco, interacción o una sección destacada; no inferir dos rutas activas. «Alertas» incluye una insignia roja con contador ilustrativo.

## 5. Encabezado y banner

### Encabezado
- Izquierda: icono agrícola verde, nombre «Parcela 01 – Cacao», ubicación «Chone, Manabí, Ecuador» con marcador y flecha que sugiere un selector.
- Derecha: cápsula «Sistema en línea», campana con punto rojo, icono de usuario, rol «Productor» y flecha desplegable.
- Fondo blanco y alineación horizontal.
- En producción, el estado de conexión requiere evidencia reciente y última actualización; no debe quedar fijo como decoración.

### Banner
- Rectángulo ancho con esquinas redondeadas.
- Fotografía de mazorcas y follaje; zona verde oscura detrás del texto para contraste.
- Mensaje blanco, grande y en negrita: «Monitoreo en tiempo real, riego automatizado y diagnóstico de la salud del cacao con IA.»
- Beneficios a la derecha con iconos blancos: «Ahorra agua», «Cuida el cultivo» y «Producción sostenible».
- Separador vertical entre mensaje y beneficios.
- El lenguaje promocional no equivale a evidencia de ahorro o eficacia; no añadir resultados cuantificados sin validación.

## 6. Tarjetas del dashboard

### 6.1 Humedad del suelo: tres zonas
Una tarjeta contenedora reúne tres subtarjetas horizontales: Sensor 1 / Zona A, Sensor 2 / Zona B y Sensor 3 / Zona C.

Cada una muestra icono vegetal, nombre, zona, porcentaje grande, cápsula de estado y barra horizontal sobre pista gris. El sensor bajo cambia su estado a rojo y la barra a naranja; los normales usan verde. Los valores visibles 42 %, 28 % y 55 % son ejemplos, no datos reales.

Conservar identidad independiente por sensor, unidad, calidad y fecha. «Bajo», «en rango» y «alto» dependen de rangos configurados; sin lectura mostrar «Sin datos», no cero.

### 6.2 Condiciones ambientales
- Una tarjeta con dos columnas: temperatura y humedad ambiental.
- Separador vertical fino, iconos grandes y valores destacados.
- Estados en cápsulas verdes.
- Ejemplos visibles: 28.4 °C y 76 %; no establecerlos como valores iniciales de producción.

### 6.3 Lluvia
- Icono de nube con lluvia.
- Estado central grande «Sin lluvia».
- Cápsula inferior «Condición seca».
- La lluvia del sensor es presencia/ausencia; no inferir precipitación en mm ni humedad del suelo a partir de este estado.

### 6.4 Sistema de riego
- Fotografía de riego como fondo superior, título blanco e icono de tuberías.
- Tarjeta blanca superpuesta con icono de grifo, estado «Riego ACTIVO» y explicación del disparo.
- Franja inferior con tres métricas: electroválvula, tiempo de riego y agua aplicada; separadores verticales.
- La referencia muestra «Abierta», 00:12:36 y 24.6 L: son ilustrativos.
- Si solo se conoce el relé, mostrar «Orden de apertura», no confirmación física de válvula abierta. Litros únicamente con medición o estimación justificada. El umbral ilustrativo de 35 % no fija la política real del firmware.

### 6.5 Diagnóstico de plantas con IA
Tarjeta horizontal dividida en tres áreas:
1. Fotografía de hoja con esquinas de encuadre blancas.
2. Acciones «Tomar foto» (verde sólido) y «Subir imagen» (blanco con borde verde).
3. Resultado con título, aviso de posible enfermedad sobre rosa, síntomas y recomendación.

Incluye etiqueta «Datos de demostración» y nota azul «Análisis orientativo, no diagnóstico definitivo». La imagen muestra un ejemplo de posible enfermedad foliar, no un diagnóstico verificado.

Esta tarjeta **reemplaza el esquema/circuito de hardware del dashboard**, conforme a la sección 19 de DERCAS. Cámara, carga de archivos, análisis e historial necesitan implementación real o modo demo explícito; la captura no acredita su funcionamiento.

### 6.6 Gráfica de humedad
- Tarjeta grande inferior izquierda; gráfico de líneas sobre blanco.
- Tres series: sensor 1 verde, sensor 2 naranja y sensor 3 azul.
- Eje horizontal de horas, eje vertical de porcentaje y cuadrícula tenue.
- Línea roja discontinua para umbral ilustrativo.
- Selector superior derecho: «24 h», «7 días», «30 días»; activo verde, restantes blancos.
- Leyenda debajo del gráfico.
- Implementar umbrales min/max cuando estén configurados según DERCAS, no fijar 35 % por copiar la imagen. Representar discontinuidades por datos faltantes y diferenciar series también mediante etiquetas o estilos.

### 6.7 Consumo y ahorro de agua
- Dos bloques gris claro: consumo de hoy y de esta semana.
- Franja verde suave inferior con hoja, texto «Ahorro estimado», porcentaje grande y flecha ascendente.
- Los ejemplos 24.6 L, 168.4 L y 34 % no son resultados de campo.
- Sin caudal calibrado o línea base, mostrar «No disponible» u ocultar el valor; toda estimación debe explicar método y supuestos.

### 6.8 Alertas recientes
- Lista compacta con icono izquierdo, mensaje y tiempo a la derecha.
- Rosa para humedad baja y azul para información de riego activado.
- Los tiempos relativos deben derivarse de eventos reales o quedar etiquetados como demo.

### 6.9 Contribución a los ODS
Tres tarjetas horizontales de color sólido, con iconos y textos blancos:
- **ODS 6:** cian, «Agua limpia y saneamiento».
- **ODS 12:** naranja, «Producción y consumo responsables».
- **ODS 13:** verde, «Acción por el clima».

Estas tarjetas comunican alineación temática; no prueban impactos medidos ni certificaciones.

## 7. Componentes, tipografía y espaciado

| Elemento | Característica aproximada |
|---|---|
| Tarjetas | Fondo blanco, contorno gris tenue y sombra ligera |
| Esquinas de tarjetas | Radio de 16–20 px |
| Botones | Redondeados, icono y texto |
| Botón principal | Verde con texto blanco |
| Botón secundario | Blanco con borde y texto verdes |
| Estados | Cápsulas con fondo suave, icono y etiqueta |
| Iconos | Mayormente lineales, agrícolas y ambientales |
| Fotografías | Cacao, hojas y riego, recortadas dentro de los bloques |
| Tipografía | Sans serif compacta; familia pendiente de identificar |
| Cifras y estados principales | 28–32 px, negrita |
| Títulos de tarjetas | 20–24 px, negrita |
| Menú y botones | 16–20 px |
| Etiquetas y descripciones | 14–16 px |

Los tamaños corresponden a una estimación de la captura; no fijan dimensiones rígidas para todos los dispositivos.

## 8. Responsive, accesibilidad y estados pendientes

**Observado:** únicamente escritorio. No hay referencia de móvil/tableta, puntos de quiebre, menús desplegados, foco, carga o errores.

**Requisitos existentes que debe conservar la implementación:** diseño responsive, navegación por teclado, contraste accesible y estados de carga, error, datos obsoletos, desconexión y sin datos. La vista móvil debe apilar tarjetas y facilitar captura de imágenes, conforme a DERCAS; sus medidas concretas siguen pendientes de diseño y validación.

No sustituir silenciosamente datos reales ausentes por ejemplos. Mostrar origen demo/real, marcas temporales y limitaciones de IA y métricas hídricas.

## 9. Lista de verificación visual para implementación futura

- [ ] Sidebar verde oscuro, encabezado blanco y banner fotográfico mantienen la jerarquía de referencia.
- [ ] Tres sensores A/B/C visibles e independientes, además de ambiente y lluvia.
- [ ] Riego y diagnóstico IA comparten la franja central; no reaparece el circuito en el dashboard.
- [ ] Gráfica de tres series, consumo, alertas y ODS conservan el orden general.
- [ ] Botones, cápsulas, bordes, sombras y tipografía son consistentes.
- [ ] Estados no dependen solo del color y se verifica contraste y teclado.
- [ ] Diseño móvil validado sin desbordamiento ni ocultar información crítica.
- [ ] Datos demo, incertidumbre, conexión y métricas no disponibles se identifican sin inventar resultados.

## Key Learnings:
1. La identidad combina verde agrícola oscuro, tarjetas claras y fotografías del cultivo.
2. La jerarquía presenta estado del cultivo, luego riego y diagnóstico, y finalmente tendencias, consumo y alertas.
3. La captura es una referencia visual, no una especificación de integraciones ni evidencia de mediciones.
