# Clima actual dentro del dashboard

La antigua tarjeta **Lluvia** se sustituye por **Clima actual**, sin botón
«Simular lluvia» ni cambio de página para consultar el clima. El código del ejemplo
antiguo se conserva, pero ya no está conectado al dashboard.

Muestra condición WMO e icono día/noche, temperatura, sensación térmica, humedad
relativa y precipitación acumulada durante el intervalo que indique el proveedor.
No es probabilidad de lluvia ni precipitación diaria. Incluye etiqueta de ubicación,
hora de validez y de consulta, presentadas en hora local del navegador.

**Fuente: Open-Meteo, condiciones modeladas. No son lecturas del ESP32.**
El clima no sustituye sensores, no modifica históricos, predicciones o alertas
ni transmite órdenes al relé. La demostración de consumo permanece independiente.

## Activación y privacidad

- Requiere `WEATHER_PROVIDER=open-meteo` en la configuración privada del backend.
  Además `WEATHER_NONCOMMERCIAL_CONFIRMED=true` tras confirmar uso no comercial.
  El usuario confirmó ambos y se habilitó **solo el `.env` local**, excluido de Git.
- Sin ciudad seleccionada, reutiliza el perfil meteorológico de la parcela: coordenadas WGS84 y
  autorización explícita. Se configura por el ADMIN propietario en
  `/parcelas/:id/clima`; no se deducen coordenadas del nombre ni se usa ubicación
  del navegador. Los permisos existentes de configuración no se amplían.
- Sin perfil autorizado: «Clima no disponible» y explicación/enlace de configuración.
  Sin proveedor habilitado: «Servicio meteorológico desactivado».
- La parcela ThingSpeak no tiene perfil meteorológico. Puede consultar una ciudad
  de referencia sin crear ese perfil ni escribir coordenadas en la parcela.
- Geocoding recibe el texto público de ciudad buscado o su ID GeoNames. El servicio
  de clima recibe coordenadas públicas de esa ciudad y variables meteorológicas.
  Nunca se envían nombres de usuario/parcela, IDs privados, lecturas, JWT ni claves ThingSpeak.

## Elegir ciudad sin escribir coordenadas

1. En la misma tarjeta: **Elegir ciudad** → escribir, por ejemplo, **Chone** →
   **Buscar ciudad**. También se admite un nombre seguido de país o región.
2. Seleccionar el resultado por ciudad, región y país. No se elige automáticamente
   el primer resultado si hay homónimos.
3. El clima se muestra ahí mismo, con el nombre completo seleccionado y el aviso
   **Clima de referencia de la ciudad, no ubicación exacta de la parcela**.
4. **Cambiar ciudad** permite otra búsqueda o **Usar ubicación de la parcela**.

La elección es temporal durante esa visita al dashboard; se descarta al cambiar
de parcela, salir o recargar. No usa GPS, cookies ni storage para recordarla.
No modifica el perfil, permisos ADMIN/FARMER ni datos del ESP32. No escribe en
PostgreSQL y no incluye clima de ciudad en reportes o predicciones.

## API e implementación

`GET /api/v1/plots/:id/weather/current`, autenticado y solo para propietario activo
de parcela no archivada. Contrato `CurrentWeather` y DTO OpenAPI. Comprueba propiedad
y autorización antes de acceder al proveedor/caché, y vuelve a comprobarlas tras
obtener la respuesta para evitar devolver datos con un perfil revocado/cambiado.

`GET /api/v1/plots/:id/weather/cities?name=Chone` busca hasta 5 ubicaciones en
español. Entrada de 2–80 caracteres, sin URLs, claves ni campos adicionales.
`GET /api/v1/plots/:id/weather/current?cityId=...` resuelve el ID GeoNames en
backend y obtiene condiciones con sus coordenadas; no confía en coordenadas ni
etiquetas suministradas por el navegador. Ambos endpoints verifican propiedad
antes/después, también para FARMER propietario, y respetan proveedor desactivado.

Geocoding: host fijo `https://geocoding-api.open-meteo.com/v1/search` y `/get`;
caché limitada a 100 entradas por proceso, 1 h y fallos 1 min. Timeout 8 s,
64 KiB y sin redirecciones. No geocodifica el nombre privado de la parcela.

Adaptador independiente del archivo histórico ERA5:
`https://api.open-meteo.com/v1/forecast`, parámetros `current`, `timeformat=unixtime`,
`timezone=GMT`, Celsius y mm. Se validan ubicación de rejilla, unidades, rangos,
código, intervalo y hora (hasta 1 h de antigüedad, máximo 15 min futura).
Ausentes conservan `null`; cero no se confunde con ausencia.

Caché en memoria por coordenadas durante 15 min, máximo 100 entradas por proceso,
peticiones concurrentes compartidas y errores retenidos 1 min para moderar reintentos.
No es un límite global distribuido; un reinicio vacía la caché. No persiste clima
actual en PostgreSQL ni lo introduce en entrenamiento/predicciones.
Timeout externo 8 s, máximo 64 KiB, host HTTPS fijo y sin redirecciones.
Errores sanitizados; no se sustituyen por ejemplos ni por histórico ERA5.

Frontend: consulta al entrar, cada 15 min y con «Actualizar clima» (sujeto a caché).
Cancela solicitudes y timers al cambiar parcela o destruir componente.
No borra ni interrumpe la telemetría si falla el clima. En error elimina condiciones
anteriores en lugar de presentarlas como actuales.

## Fuente y términos

- Documentación oficial verificada: https://open-meteo.com/en/docs
- Geocoding: https://open-meteo.com/en/docs/geocoding-api · datos de ciudades GeoNames.
- Las condiciones actuales se basan en modelos de 15 min; fuera de áreas con modelos
  de esa resolución pueden ser interpoladas desde datos horarios.
- `current.interval` indica segundos del intervalo anterior para acumulados.
- Resolución/modelo dependen del best match para las coordenadas; no se afirma
  precisión de estación ni medición en la finca.
- Atribución Open-Meteo; datos CC BY 4.0. API pública para uso no comercial;
  revisar https://open-meteo.com/en/terms y https://open-meteo.com/en/pricing
  antes de explotación comercial o despliegue.

## Verificación

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
Pruebas de normalización, consentimiento/propiedad, caché/coalescencia, fallos
sanitizados, tarjeta con fixtures, valores ausentes/cero, cambio de parcela y
conservación del dashboard real. Consulta pública real de Chone y sus condiciones
modeladas verificada. No se enviaron coordenadas privadas de parcela.

Resultado con selector de ciudad: **518 pruebas backend y 681 frontend correctas**,
24 pruebas de integración meteorológica con PostgreSQL temporal eliminada,
lint, tipos y compilación correctos. Revisión de navegador con fixtures aisladas
a 1440/768/390 px: búsqueda, homónimos y selección sin navegación ni desbordamiento,
errores de página ni escrituras inesperadas;
estados sin ubicación/proveedor y fallo también comprobados. Capturas locales:
`.local/current-weather/card-{1440,768,390}.png`.
