# Ficha pendiente de integración ESP32

Completar con el responsable del prototipo. **No incluir credenciales reales**.
Conservar el firmware original; esta ficha no autoriza cargar otro programa.

## Transporte y receptor

- Fecha/responsable: pendiente.
- Modelo de placa y entorno (Arduino IDE/PlatformIO/otro): pendiente.
- Código original disponible y versión: pendiente.
- Comunicación actual (HTTP/HTTPS/MQTT/otra): pendiente.
- Receptor: directo a NestJS / servidor existente / todavía sin envío.
- Endpoint y protocolo: pendiente; compartir solo la dirección saneada si es privada.
- Autenticación: tipo y nombres de encabezados, nunca sus valores.
- Frecuencia real de publicación y reintentos: pendiente.
- Ejemplo saneado del cuerpo guardado en `.local/esp32-muestra.json`: pendiente.
- Respuesta observada/código HTTP o error de transporte: pendiente.

## Identidad y reloj

- Serial físico: pendiente.
- UUID provisionado autorizado: pendiente; no inventar ni reutilizar el de DEMO.
- Propietario/parcela REAL y rol habilitado para provisión: pendiente.
- `eventId`: cómo se genera, conserva al reintentar y evita colisiones tras reinicio.
- Hora de dispositivo: fiable / no fiable / desconocida.
- Zona/formato/origen de sincronización: pendiente; sin reloj fiable usar null.

## Sensores y semántica

| Código de aplicación | Sonda/ubicación física | Modelo    | Unidad enviada                      | Calibración y referencia |
| -------------------- | ---------------------- | --------- | ----------------------------------- | ------------------------ |
| soil_1 / A           | Por confirmar          | Pendiente | Pendiente                           | Pendiente                |
| soil_2 / B           | Por confirmar          | Pendiente | Pendiente                           | Pendiente                |
| soil_3 / C           | Por confirmar          | Pendiente | Pendiente                           | Pendiente                |
| temperatureC         | Por confirmar          | Pendiente | Pendiente                           | Pendiente                |
| airHumidityPct       | Por confirmar          | Pendiente | Pendiente                           | Pendiente                |
| rainDetected         | Por confirmar          | Pendiente | Booleano, significado por confirmar | Pendiente                |

- Señal de error/ausencia del firmware: pendiente; no sustituir automáticamente por cero.
- ¿Suelo es porcentaje calibrado o ADC bruto?: pendiente.
- Relé: significado exacto, incluida lógica activa en alto/bajo: pendiente.
- ¿Existe confirmación física de válvula?: pendiente; sin prueba, feedback null.
- ¿Existe caudalímetro o caudal calibrado?: pendiente; no afirmar litros.
- Política multizona y protecciones locales existentes: pendiente, no modificar.
- Alimentación y estado seguro al conectar USB/abrir puerto/reiniciar: pendiente.

## Resultado de revisión

- [ ] Contrato compatible directamente o diferencias identificadas sin suposiciones.
- [ ] Datos y credenciales separados; ningún secreto compartido.
- [ ] Propietario/rol y provisión REAL acordados.
- [ ] Red y transporte seguro autorizados.
- [ ] Plan de prueba física supervisada aprobado.
- [ ] Pruebas reales realizadas y evidencia registrada (dejar sin marcar hasta entonces).

No marcar la última casilla por pasar el comprobador o el simulador.
Guía: [preparación y límites](ESP32_PREPARACION.md).
