const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../src/app');

async function withApi(t, health) {
  const app = createApp({
    auth: {},
    events: {},
    registrations: {},
    suggestions: {},
    health,
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${port}`;
}

test('Exercise 4 step 4 GET /health reports a working database without sign-in', async (t) => {
  let checked = false;
  const baseUrl = await withApi(t, {
    async checkDatabase() {
      checked = true;
    },
  });

  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', db: 'ok' });
  assert.equal(checked, true);
});

test('Exercise 4 step 4 GET /health reports a failed database probe', async (t) => {
  const baseUrl = await withApi(t, {
    async checkDatabase() {
      throw new Error('database connection details');
    },
  });
  t.mock.method(console, 'error', () => {});

  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'error', db: 'down' });
});

test('Exercise 4 step 4 GET /health reports a probe that exceeds two seconds', async (t) => {
  const baseUrl = await withApi(t, {
    async checkDatabase() {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    },
  });
  t.mock.method(console, 'error', () => {});

  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'error', db: 'down' });
});
