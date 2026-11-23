const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../src/app');

async function withApi(t, events = { async listUpcoming() { return []; } }) {
  const app = createApp({
    auth: {
      async currentUser() {
        return { id: 2, email: 'member@club.test', name: 'Member', role: 'member' };
      },
    },
    events,
    registrations: {},
    suggestions: {},
    health: { async checkDatabase() {} },
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${port}`;
}

test('Exercise 4 step 4 malformed JSON returns a generic 400 and is logged', async (t) => {
  const baseUrl = await withApi(t);
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));

  const response = await fetch(`${baseUrl}/api/events/1/registrations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  const body = await response.text();

  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(body), { error: 'The request body is not valid JSON.' });
  assert.doesNotMatch(body, /stack|\.js:\d+|\/(?:workspaces|src)\/|node:internal/);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0].type, 'entity.parse.failed');
});

test('Exercise 4 step 4 unknown errors stay generic while full details are logged', async (t) => {
  const error = new Error('internal failure');
  const baseUrl = await withApi(t, {
    async listUpcoming() {
      throw error;
    },
  });
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));

  const response = await fetch(`${baseUrl}/api/events`);
  const body = await response.text();

  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(body), { error: 'Something went wrong. Try again.' });
  assert.doesNotMatch(body, /internal failure|stack|\.js:\d+|\/(?:workspaces|src)\/|node:internal/);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], error);
  assert.match(logged[0][0].stack, /internal failure/);
});
