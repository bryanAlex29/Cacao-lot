import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
let url;
try {
  url = new URL(process.env.DATABASE_URL);
} catch {
  throw new Error('DATABASE_URL local inválida; revisar configuración sin compartir credenciales.');
}
if (
  process.env.NODE_ENV !== 'development' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
) {
  throw new Error('El bootstrap está limitado a desarrollo y PostgreSQL local.');
}
const name = (process.env.BOOTSTRAP_ADMIN_NAME ?? '').trim();
const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
if (
  !name ||
  name.length > 100 ||
  email.length > 254 ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  password.length < 8 ||
  password.length > 128 ||
  !/\p{Lu}/u.test(password) ||
  !/[\p{P}\p{S}]/u.test(password)
) {
  throw new Error(
    'Completar BOOTSTRAP_ADMIN_NAME/EMAIL/PASSWORD en .env local; contraseña de 8–128 caracteres, una mayúscula y un símbolo.',
  );
}

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
  log: [],
});
try {
  // Un único primer administrador, con exclusión mutua entre procesos de bootstrap.
  await database.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20762026)`;
    if (await tx.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })) {
      throw new Error('Ya existe un administrador. No se modificó ninguna cuenta.');
    }
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    await tx.user.create({
      data: { name, email, passwordHash, role: 'ADMIN' },
      select: { id: true },
    });
  });
  console.log(
    'Primer administrador creado. Retirar BOOTSTRAP_ADMIN_* de .env y acceder mediante /login.',
  );
} catch {
  console.error(
    'No se creó el administrador: revisar migraciones, datos y si ya existe uno. No se sobrescribieron cuentas.',
  );
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
