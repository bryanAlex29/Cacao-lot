export interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  HOST: string;
  PORT: number;
  CORS_ORIGIN: string;
  DATABASE_URL: string;
  TELEMETRY_MODE: 'real' | 'demo';
  JWT_SECRET: string;
  AI_PROVIDER: 'mock' | 'disabled' | 'openai';
  OPENAI_API_KEY: string;
  OPENAI_VISION_MODEL: string;
  AI_MAX_IMAGE_MB: number;
  AI_DAILY_LIMIT_PER_USER: number;
  AI_REQUEST_TIMEOUT_MS: number;
  IMAGE_RETENTION_DAYS: number;
  IMAGE_STORAGE_PATH?: string;
  WEATHER_PROVIDER: 'disabled' | 'open-meteo';
  THINGSPEAK_CHANNEL_ID: string;
  THINGSPEAK_READ_API_KEY: string;
  THINGSPEAK_IMPORT_ENABLED: boolean;
}

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const nodeEnv = input['NODE_ENV'] ?? 'development';
  if (!['development', 'test', 'production'].includes(String(nodeEnv))) {
    throw new Error('NODE_ENV inválido');
  }
  const port = Number(input['PORT'] ?? 3100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe estar entre 1 y 65535');
  }
  const host = String(input['HOST'] ?? '127.0.0.1').trim();
  if (!host) throw new Error('HOST es obligatorio');

  const origin = String(input['CORS_ORIGIN'] ?? 'http://localhost:4200');
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new Error('CORS_ORIGIN debe ser un origen HTTP(S) explícito');
  }
  if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.origin !== origin) {
    throw new Error('CORS_ORIGIN debe ser un origen HTTP(S) sin ruta ni comodines');
  }
  const databaseUrl = String(input['DATABASE_URL'] ?? '');
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL es obligatoria y debe ser una URL PostgreSQL válida');
  }
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !database.hostname ||
    !database.username ||
    !database.password ||
    database.pathname.length < 2
  ) {
    throw new Error('DATABASE_URL requiere PostgreSQL, host, usuario, contraseña y base');
  }
  const mode = input['TELEMETRY_MODE'] ?? 'real';
  if (mode !== 'real' && mode !== 'demo') throw new Error('TELEMETRY_MODE inválido');
  if (nodeEnv === 'production' && mode === 'demo') {
    throw new Error('Modo demo no permitido en producción');
  }
  const secret = String(input['JWT_SECRET'] ?? '');
  if (!/^[a-f0-9]{64}$/i.test(secret)) {
    throw new Error(
      'JWT_SECRET requiere 32 bytes aleatorios en hexadecimal; ejecutar setup:auth-env',
    );
  }
  const aiProvider = input['AI_PROVIDER'] ?? (nodeEnv === 'production' ? 'disabled' : 'mock');
  if (
    !['mock', 'disabled', 'openai'].includes(String(aiProvider)) ||
    (nodeEnv === 'production' && aiProvider === 'mock')
  ) {
    throw new Error('AI_PROVIDER inválido; mock no permitido en producción');
  }
  const openaiKey = String(input['OPENAI_API_KEY'] ?? '').trim();
  const visionModel = String(input['OPENAI_VISION_MODEL'] ?? 'gpt-5.4-mini').trim();
  if (aiProvider === 'openai' && (!openaiKey || !/^[a-zA-Z0-9._-]{1,100}$/.test(visionModel)))
    throw new Error('OpenAI requiere OPENAI_API_KEY y OPENAI_VISION_MODEL válidos en el servidor');
  const bounded = (key: string, fallback: number, max: number) => {
    const value = Number(input[key] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${key} inválido`);
    return value;
  };
  const weather = input['WEATHER_PROVIDER'] ?? 'disabled';
  if (!['disabled', 'open-meteo'].includes(String(weather)))
    throw new Error('WEATHER_PROVIDER inválido');
  if (weather === 'open-meteo' && input['WEATHER_NONCOMMERCIAL_CONFIRMED'] !== 'true')
    throw new Error('Open-Meteo gratuito requiere WEATHER_NONCOMMERCIAL_CONFIRMED=true');
  const thingSpeakChannel = String(input['THINGSPEAK_CHANNEL_ID'] ?? '');
  const thingSpeakKey = String(input['THINGSPEAK_READ_API_KEY'] ?? '');
  const thingSpeakEnabled = input['THINGSPEAK_IMPORT_ENABLED'] ?? 'false';
  if (
    (thingSpeakChannel !== '' && !/^[1-9]\d*$/.test(thingSpeakChannel)) ||
    (thingSpeakKey !== '' && !/^[a-zA-Z0-9]{1,128}$/.test(thingSpeakKey)) ||
    !['true', 'false'].includes(String(thingSpeakEnabled)) ||
    (String(thingSpeakEnabled) === 'true' &&
      (nodeEnv !== 'development' || thingSpeakChannel !== '3554501'))
  )
    throw new Error(
      'Configuración ThingSpeak inválida; importación solo development y canal confirmado.',
    );
  return {
    NODE_ENV: nodeEnv as Environment['NODE_ENV'],
    HOST: host,
    PORT: port,
    CORS_ORIGIN: origin,
    DATABASE_URL: databaseUrl,
    TELEMETRY_MODE: mode,
    JWT_SECRET: secret,
    AI_PROVIDER: aiProvider as Environment['AI_PROVIDER'],
    OPENAI_API_KEY: openaiKey,
    OPENAI_VISION_MODEL: visionModel,
    AI_MAX_IMAGE_MB: bounded('AI_MAX_IMAGE_MB', 8, 8),
    AI_DAILY_LIMIT_PER_USER: bounded('AI_DAILY_LIMIT_PER_USER', 5, 100),
    AI_REQUEST_TIMEOUT_MS: bounded('AI_REQUEST_TIMEOUT_MS', 10000, 30000),
    IMAGE_RETENTION_DAYS: bounded('IMAGE_RETENTION_DAYS', 7, 30),
    WEATHER_PROVIDER: weather as Environment['WEATHER_PROVIDER'],
    THINGSPEAK_CHANNEL_ID: thingSpeakChannel,
    THINGSPEAK_READ_API_KEY: thingSpeakKey,
    THINGSPEAK_IMPORT_ENABLED: String(thingSpeakEnabled) === 'true',
    ...(input['IMAGE_STORAGE_PATH']
      ? { IMAGE_STORAGE_PATH: String(input['IMAGE_STORAGE_PATH']) }
      : {}),
  };
}
