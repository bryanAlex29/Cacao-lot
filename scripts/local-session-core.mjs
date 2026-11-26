import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export function localSessionCommands(root) {
  const backendRequire = createRequire(join(root, 'backend/package.json'));
  const frontendRequire = createRequire(join(root, 'frontend/package.json'));
  return {
    backend: backendRequire.resolve('nodemon/bin/nodemon.js'),
    frontend: frontendRequire.resolve('@angular/cli/bin/ng.js'),
  };
}

export function localSessionConfig(input) {
  if (
    !['development', undefined].includes(input.NODE_ENV) ||
    (input.HOST ?? '127.0.0.1') !== '127.0.0.1' ||
    Number(input.PORT ?? 3100) !== 3100 ||
    (input.CORS_ORIGIN ?? 'http://localhost:4200') !== 'http://localhost:4200'
  )
    throw new Error('El arranque sencillo requiere el perfil local existente');
  // Keep the existing database and provider choices; never rewrite configuration.
  return { api: 'http://127.0.0.1:3100', web: 'http://localhost:4200' };
}

export async function requireFreePort(port, host) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Puerto ${port} ocupado o no disponible`)));
    server.listen({ port, host, exclusive: true }, () => server.close(resolve));
  });
}

/** Only processes created by this invocation may be stopped. */
export async function runLocalSession({ start, stop, onStopping = () => {} }) {
  const owned = [];
  let cleanup;
  const close = () => {
    cleanup ??= (async () => {
      onStopping();
      await Promise.all(owned.map((child) => stop(child)));
    })();
    return cleanup;
  };
  try {
    for (const kind of ['backend', 'frontend']) owned.push(await start(kind));
    await Promise.race(owned.map((child) => child.finished));
  } finally {
    await close();
  }
}
