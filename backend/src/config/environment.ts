export interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  HOST: string;
  PORT: number;
  CORS_ORIGIN: string;
  DATABASE_URL: string;
  TELEMETRY_MODE: 'real' | 'demo';
  JWT_SECRET: string;
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
  return {
    NODE_ENV: nodeEnv as Environment['NODE_ENV'],
    HOST: host,
    PORT: port,
    CORS_ORIGIN: origin,
    DATABASE_URL: databaseUrl,
    TELEMETRY_MODE: mode,
    JWT_SECRET: secret,
  };
}
