import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../.env', import.meta.url));
const existing = parseEnv(readFileSync(path, 'utf8'));
if (!Object.hasOwn(existing, 'JWT_SECRET')) {
  appendFileSync(path, `\nJWT_SECRET=${randomBytes(32).toString('hex')}\n`);
  console.log('JWT_SECRET local añadido sin modificar las variables existentes.');
} else {
  console.log('JWT_SECRET ya existe; no se sobrescribió.');
}
