import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const password = randomBytes(24).toString('hex');
const path = fileURLToPath(new URL('../.env', import.meta.url));
const contents = [
  'NODE_ENV=development',
  'HOST=127.0.0.1',
  'PORT=3100',
  'CORS_ORIGIN=http://localhost:4200',
  'POSTGRES_USER=cacaosmart',
  'POSTGRES_DB=cacaosmart',
  'POSTGRES_PORT=5433',
  `POSTGRES_PASSWORD=${password}`,
  `DATABASE_URL=postgresql://cacaosmart:${password}@127.0.0.1:5433/cacaosmart?schema=public&connect_timeout=3`,
  'TELEMETRY_MODE=real',
  `JWT_SECRET=${randomBytes(32).toString('hex')}`,
  '',
].join('\n');

try {
  writeFileSync(path, contents, { flag: 'wx', mode: 0o600 });
  console.log('.env local creado con credencial aleatoria. No compartir ni versionar.');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.log('.env ya existe; no se sobrescribió.');
  } else {
    throw error;
  }
}
