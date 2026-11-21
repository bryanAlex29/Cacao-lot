import assert from 'node:assert/strict';

const base = process.env.SMOKE_API_URL ?? 'http://127.0.0.1:3100/api/v1';
for (const path of ['live', 'ready']) {
  const response = await fetch(`${base}/health/${path}`, { signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  assert.equal(response.status, 200, `health/${path} debe responder 200`);
  assert.equal(body.status, 'ok');
  console.log(`GET /health/${path}: 200 ok`);
}
const docs = await fetch(`${base}/docs-json`, { signal: AbortSignal.timeout(10000) });
assert.equal(docs.status, 200);
const schema = await docs.json();
assert.ok(schema.paths['/api/v1/health/live']);
assert.ok(schema.paths['/api/v1/health/ready']);
console.log('OpenAPI: rutas de salud presentes');
