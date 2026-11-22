const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../src/app');
const { createEventService } = require('../src/services/events');
const { createRegistrationService } = require('../src/services/registrations');

const NOW = new Date('2026-11-05T10:00:00Z');
const member = { id: 2, email: 'member@club.test', name: 'Mihail Member', role: 'member' };
const organizer = { id: 1, email: 'organizer@club.test', name: 'Olga Organizer', role: 'organizer' };

function createHarness() {
  const eventRows = new Map([
    [1, { id: 1, title: 'Intro to Git', startsAt: new Date('2026-11-12T10:00:00Z'), capacity: 20, registered: 3 }],
    [2, { id: 2, title: 'Build an MCP server', startsAt: new Date('2026-11-26T10:00:00Z'), capacity: 15, registered: 0 }],
    [3, { id: 3, title: 'Board games night', startsAt: new Date('2026-12-03T10:00:00Z'), capacity: 1, registered: 1 }],
    [4, { id: 4, title: 'Welcome meetup', startsAt: new Date('2026-10-20T10:00:00Z'), capacity: 30, registered: 0 }],
  ]);
  const registrationRows = [
    { userId: 2, eventId: 1, name: 'Mihail Member', signedUpAt: NOW },
  ];

  const auth = {
    async signIn(email) {
      if (email === organizer.email) return organizer;
      if (email === member.email) return member;
      return null;
    },
    async currentUser(userId) {
      if (String(userId) === String(member.id)) return member;
      if (String(userId) === String(organizer.id)) return organizer;
      return null;
    },
  };
  const eventsData = {
    async listStartingAfter(since) {
      return [...eventRows.values()]
        .filter((event) => new Date(event.startsAt) > new Date(since))
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
        .map((event) => ({ ...event, isRegistered: false }));
    },
    async createEvent(input) {
      const id = Math.max(...eventRows.keys()) + 1;
      const event = { id, title: input.title, startsAt: input.startsAt, capacity: input.capacity };
      eventRows.set(id, { ...event, registered: 0 });
      return event;
    },
  };
  const registrationsData = {
    async eventExists(eventId) {
      return eventRows.has(Number(eventId));
    },
    async listByEventId(eventId) {
      return registrationRows.filter((row) => String(row.eventId) === String(eventId));
    },
    async withEventTransaction(eventId, operation) {
      return operation({
        event: eventRows.has(Number(eventId))
          ? eventRows.get(Number(eventId))
          : null,
        async hasRegistration() { return false; },
        async countRegistrations() { return 0; },
        async insertRegistration() { return { createdAt: NOW }; },
        async deleteRegistration() { return true; },
      });
    },
  };
  const events = createEventService({ events: eventsData, clock: () => NOW });
  const registrations = createRegistrationService({
    registrations: registrationsData,
    clock: () => NOW,
  });
  const app = createApp({ auth, events, registrations });
  const server = createServer(app);

  return {
    eventRows,
    async listen() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();
      return `http://127.0.0.1:${port}`;
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}

async function signedInCookie(baseUrl, email) {
  const password = 'unused-by-fake-auth';
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';', 1)[0];
}

async function withApi(t) {
  const harness = createHarness();
  const baseUrl = await harness.listen();
  t.after(() => harness.close());
  return { ...harness, baseUrl };
}

test('AC-7 POST /api/events creates for organizer and refuses member or visitor', async (t) => {
  const api = await withApi(t);
  const organizerCookie = await signedInCookie(api.baseUrl, organizer.email);

  const created = await fetch(`${api.baseUrl}/api/events`, {
    method: 'POST',
    headers: {
      cookie: organizerCookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: 'REST workshop',
      startsAt: '2026-11-12T10:00:00Z',
      capacity: 20,
    }),
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).event.capacity, 20);

  const memberCookie = await signedInCookie(api.baseUrl, member.email);
  const memberCreate = await fetch(`${api.baseUrl}/api/events`, {
    method: 'POST',
    headers: {
      cookie: memberCookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Member event',
      startsAt: '2026-11-12T10:00:00Z',
      capacity: 20,
    }),
  });
  assert.equal(memberCreate.status, 403);

  const visitorCreate = await fetch(`${api.baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Visitor event',
      startsAt: '2026-11-12T10:00:00Z',
      capacity: 20,
    }),
  });
  assert.equal(visitorCreate.status, 401);
});

test('AC-7 POST /api/events rejects invalid title, date, and capacity', async (t) => {
  const api = await withApi(t);
  const cookie = await signedInCookie(api.baseUrl, organizer.email);
  const invalidBodies = [
    { title: '', startsAt: '2026-11-12T10:00:00Z', capacity: 20 },
    { title: 'Past event', startsAt: '2026-11-05T10:00:00Z', capacity: 20 },
    { title: 'Too few', startsAt: '2026-11-12T10:00:00Z', capacity: 0 },
    { title: 'Too many', startsAt: '2026-11-12T10:00:00Z', capacity: 501 },
  ];

  for (const body of invalidBodies) {
    const response = await fetch(`${api.baseUrl}/api/events`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
});

test('AC-8 registration list is available to organizer and refused to member and visitor', async (t) => {
  const api = await withApi(t);
  const organizerCookie = await signedInCookie(api.baseUrl, organizer.email);
  const organizerResponse = await fetch(`${api.baseUrl}/api/events/1/registrations`, {
    headers: { cookie: organizerCookie },
  });
  assert.equal(organizerResponse.status, 200);
  assert.deepEqual((await organizerResponse.json()).registrations, [
    { userId: 2, eventId: 1, name: 'Mihail Member', signedUpAt: NOW.toISOString() },
  ]);

  const memberCookie = await signedInCookie(api.baseUrl, member.email);
  const memberResponse = await fetch(`${api.baseUrl}/api/events/1/registrations`, {
    headers: { cookie: memberCookie },
  });
  assert.equal(memberResponse.status, 403);

  const visitorResponse = await fetch(`${api.baseUrl}/api/events/1/registrations`);
  assert.equal(visitorResponse.status, 401);
});

test('AC-13 API lists only the three upcoming events', async (t) => {
  const api = await withApi(t);
  const cookie = await signedInCookie(api.baseUrl, member.email);
  const response = await fetch(`${api.baseUrl}/api/events`, { headers: { cookie } });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.events.length, 3);
  assert.deepEqual(body.events.map((event) => event.title), [
    'Intro to Git',
    'Build an MCP server',
    'Board games night',
  ]);
  assert.ok(body.events.every((event) => event.title !== 'Welcome meetup'));
});

test('AC-14 deleting an event removes it from a reloaded API list', async (t) => {
  const api = await withApi(t);
  const cookie = await signedInCookie(api.baseUrl, member.email);
  api.eventRows.delete(1);

  const response = await fetch(`${api.baseUrl}/api/events`, { headers: { cookie } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.events.every((event) => event.id !== 1));
});

test('AC-15 POST logout makes GET /api/events return 401', async (t) => {
  const api = await withApi(t);
  const cookie = await signedInCookie(api.baseUrl, member.email);

  const logout = await fetch(`${api.baseUrl}/api/logout`, {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(logout.status, 204);

  const response = await fetch(`${api.baseUrl}/api/events`);
  assert.equal(response.status, 401);
});
