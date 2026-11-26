/** Transporte de solo lectura. No normaliza ni persiste telemetría. */
export interface ThingSpeakEntry {
  entryId: number;
  createdAt: string;
  fields: Record<string, string | null>;
}

export interface ThingSpeakSnapshot {
  channelId: number;
  mappingStatus: 'pending';
  entry: ThingSpeakEntry | null;
}

export interface ThingSpeakConfig {
  channelId: string | undefined;
  readApiKey: string | undefined;
}

const MAX_RESPONSE_BYTES = 256 * 1024;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ThingSpeakClient {
  constructor(
    private readonly config: ThingSpeakConfig,
    private readonly request: typeof fetch = fetch,
  ) {}

  async readLatest(): Promise<ThingSpeakSnapshot> {
    const id = this.config.channelId ?? '';
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new Error('Configura THINGSPEAK_CHANNEL_ID con un entero positivo.');
    }
    const key = this.config.readApiKey ?? '';
    if (key && !/^[a-zA-Z0-9]{1,128}$/.test(key)) {
      throw new Error('THINGSPEAK_READ_API_KEY tiene un formato inválido.');
    }
    // Host fijo y redirecciones prohibidas: no enviar la clave a otros servidores.
    const url = new URL(`https://api.thingspeak.com/channels/${id}/feeds.json`);
    url.searchParams.set('results', '1');
    if (key) url.searchParams.set('api_key', key);
    let data: unknown;
    try {
      const response = await this.request(url, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok || !response.body) throw new Error();
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) throw new Error();
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      // Nunca propagar URL, respuesta del proveedor o errores con credenciales.
      throw new Error(
        'No se pudo leer ThingSpeak. Revisa canal, Read API Key, red y límites del proveedor.',
      );
    }
    if (
      !object(data) ||
      !object(data.channel) ||
      data.channel.id !== Number(id) ||
      !Array.isArray(data.feeds) ||
      data.feeds.length > 1
    ) {
      throw new Error('Respuesta de ThingSpeak inválida.');
    }
    const snapshot: ThingSpeakSnapshot = {
      channelId: Number(id),
      mappingStatus: 'pending',
      entry: null,
    };
    if (data.feeds.length === 0) return snapshot;
    const feed: unknown = data.feeds[0];
    if (
      !object(feed) ||
      typeof feed.entry_id !== 'number' ||
      !Number.isSafeInteger(feed.entry_id) ||
      feed.entry_id < 1 ||
      typeof feed.created_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(feed.created_at) ||
      !Number.isFinite(Date.parse(feed.created_at))
    ) {
      throw new Error('Entrada de ThingSpeak inválida.');
    }
    const fields: Record<string, string | null> = {};
    for (let n = 1; n <= 8; n++) {
      const name = `field${n}`;
      const value: unknown = feed[name];
      if (value !== undefined && value !== null && typeof value !== 'string') {
        throw new Error('Campo de ThingSpeak inválido.');
      }
      // Mantener texto crudo; no inferir unidades, booleanos ni calibración.
      fields[name] = value ?? null;
    }
    snapshot.entry = {
      entryId: feed.entry_id,
      createdAt: feed.created_at,
      fields,
    };
    return snapshot;
  }
}
