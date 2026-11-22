const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createHandler,
  initializeProjectTools,
  tools,
} = require('../mcp-server/server');
const { ServiceError } = require('../src/services/errors');

const member = { id: 2, role: 'member' };

function call(handle, name, args = {}, id = 1) {
  return handle({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
}

test('MCP tool definitions keep lecture tools and add the three named project tools', () => {
  assert.deepEqual(tools.map((tool) => tool.name), [
    'find_lecture',
    'search_topic',
    'list_upcoming_events',
    'register_for_event',
    'cancel_registration',
  ]);
  for (const name of ['list_upcoming_events', 'register_for_event', 'cancel_registration']) {
    const tool = tools.find((item) => item.name === name);
    assert.ok(tool.description.length >= 20);
    assert.ok(tool.description.includes('Use'));
    assert.ok(tool.description.includes('returns'));
  }
});

test('MCP lecture tools still answer calls', async () => {
  const handle = createHandler({ error: 'project tools are disabled' });
  const found = await call(handle, 'find_lecture', { number: 5 });
  const searched = await call(handle, 'search_topic', { topic: 'REST' });

  assert.match(found.result.content[0].text, /Lecture 5:/);
  assert.equal(found.result.isError, false);
  assert.equal(searched.result.isError, false);
});

test('project tools sign in once and call services with the signed-in user', async () => {
  let signIns = 0;
  const calls = [];
  const projectTools = await initializeProjectTools({
    env: { MCP_EMAIL: 'member@example.test', MCP_PASSWORD: 'pass' },
    services: {
      auth: {
        async signIn(email, password) {
          signIns += 1;
          assert.equal(email, 'member@example.test');
          assert.equal(password, 'pass');
          return member;
        },
      },
      events: {
        async listUpcoming(user) {
          calls.push(['listUpcoming', user]);
          return [{ id: 7, freePlaces: 2 }];
        },
      },
      registrations: {
        async register(user, eventId) {
          calls.push(['register', user, eventId]);
        },
        async cancel(user, eventId, userId) {
          calls.push(['cancel', user, eventId, userId]);
        },
      },
    },
  });
  const handle = createHandler(projectTools);

  const listed = await call(handle, 'list_upcoming_events');
  const registered = await call(handle, 'register_for_event', { eventId: 7 });
  const cancelled = await call(handle, 'cancel_registration', { eventId: 7 });

  assert.equal(signIns, 1);
  assert.equal(listed.result.content[0].text, '[{"id":7,"freePlaces":2}]');
  assert.equal(registered.result.content[0].text, 'You are signed up');
  assert.equal(cancelled.result.content[0].text, 'Registration cancelled.');
  assert.deepEqual(calls, [
    ['listUpcoming', member],
    ['register', member, 7],
    ['cancel', member, 7, member.id],
  ]);
});

test('project tools return isError when MCP credentials are missing', async () => {
  const projectTools = await initializeProjectTools({ env: {} });
  const result = await call(createHandler(projectTools), 'list_upcoming_events');

  assert.equal(result.result.isError, true);
  assert.match(result.result.content[0].text, /MCP_EMAIL and MCP_PASSWORD/);
});

test('project tools return isError when DATABASE_URL is missing', async () => {
  const projectTools = await initializeProjectTools({
    env: { MCP_EMAIL: 'member@example.test', MCP_PASSWORD: 'pass' },
  });
  const result = await call(createHandler(projectTools), 'list_upcoming_events');

  assert.equal(result.result.isError, true);
  assert.match(result.result.content[0].text, /DATABASE_URL/);
});

test('project tools turn ServiceError into an isError result with its message', async () => {
  const projectTools = await initializeProjectTools({
    env: { MCP_EMAIL: 'member@example.test', MCP_PASSWORD: 'pass' },
    services: {
      auth: { async signIn() { return member; } },
      events: { async listUpcoming() { return []; } },
      registrations: {
        async register() {
          throw new ServiceError(409, 'This event is full');
        },
        async cancel() {},
      },
    },
  });
  const result = await call(createHandler(projectTools), 'register_for_event', { eventId: 7 });

  assert.equal(result.result.isError, true);
  assert.equal(result.result.content[0].text, 'This event is full');
});
