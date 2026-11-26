import { ThingSpeakClient } from './thingspeak.client';
import { mapThingSpeakSnapshot } from './thingspeak.mapping';

/** Comprobación explícita local: no arranca NestJS ni consulta PostgreSQL. */
async function main(): Promise<void> {
  try {
    const client = new ThingSpeakClient({
      channelId: process.env.THINGSPEAK_CHANNEL_ID,
      readApiKey: process.env.THINGSPEAK_READ_API_KEY,
    });
    const result = await client.readLatest();
    console.log('Conexión de lectura con ThingSpeak verificada.');
    if (result.entry) {
      console.log(`Última entrada: ${result.entry.entryId}; fecha: ${result.entry.createdAt}.`);
      console.log(
        `Campos con contenido: ${
          Object.entries(result.entry.fields)
            .filter(([, value]) => value !== null && value !== '')
            .map(([name]) => name)
            .join(', ') || 'ninguno'
        }.`,
      );
    } else {
      console.log('El canal no contiene entradas.');
    }
    const mapped = mapThingSpeakSnapshot(result);
    console.log(
      'Mapa confirmado: field1 → °C ambiental; field2 → % ambiental; field3 → % suelo A; field4 → relé (1 activo / 0 apagado).',
    );
    if (mapped) {
      console.log(
        `Calidad: temperatura ${mapped.quality.temperatureC}; humedad ambiental ${mapped.quality.airHumidityPct}; suelo A ${mapped.quality.soil_1}; relé ${mapped.quality.relayCommandedOpen}.`,
      );
    }
    console.log(
      'B/C, lluvia y válvula: sin datos. Sin importación, persistencia ni eventos al dashboard.',
    );
    console.log('Esta prueba no acredita que el ESP32 esté conectado actualmente.');
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Falló la comprobación de ThingSpeak.');
    process.exitCode = 1;
  }
}

void main();
