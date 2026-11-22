const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../src/app');
const { createRegistrationService } = require('../src/services/registrations');

const member = { id: 2, email: 'member@club.test', name: 'Member', role: 'member' };
const NOW = new Date('2026-11-05T10:00:00Z');

function createHarness({ events = [], registrations = [] } = {}) {
  const eventRows = new Map(events.map((event) => [String(event.id), event]));
  const registrationRows = registrations.map((registration) => ({ ...registration }));
  const registrationsData = {
    async withEventTransaction(eventId, operation) {
      const event = eventRows.get(String(eventId)) ?? null;
      return operation({
        event,
        async hasRegistration(userId) {
          return registrationRows.some((row) =>
            String(row.userId) === String(userId)
              && String(row.eventId) === String(eventId));
        },
        async countRegistrations() {
          return registrationRows.filter((row) =>
            String(row.eventId) === String(eventId)).length;
        },
        async insertRegistration(userId) {
          const row = { userId, eventId: Number(eventId), createdAt: NOW };
          registrationRows.push(row);
          return { createdAt: row.createdAt };
        },
        async deleteRegistration(userId) {
          const index = registrationRows.findIndex((row) =>
            String(row.userId) === String(userId)
              && String(row.eventId) === String(eventId));
          if (index === -1) return false;
          registrationRows.splice(index, 1);
          return true;
        },
      });
    },
  };
  const auth = {
    async signIn() {
      return member;
    },
    async currentUser(userId) {
      return String(userId) === String(member.id) ? member : null;
    },
  };
  const registrationsService = createRegistrationService({
    registrations: registrationsData,
    clock: () => NOW,
  });
  const app = createApp({
    auth,
    events: { async listUpcoming() { return []; } },
    registrations: registrationsService,
  });
  const server = createServer(app);

  return {
    registrationRows,
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

async function signedInCookie(baseUrl) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: member.email, password: 'unused-by-fake-auth' }),
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  return setCookie.split(';', 1)[0];
}

async function withApi(t, options) {
  const harness = createHarness(options);
  const baseUrl = await harness.listen();
  t.after(() => harness.close());
  return { ...harness, baseUrl };
}

const upcomingEvent = {
  id: 7,
  startsAt: new Date('2026-11-12T10:00:00Z'),
  capacity: 2,
};

test('AC-16 POST registration returns 201 and creates one row', async (t) => {
  const api = await withApi(t, { events: [upcomingEvent] });
  const cookie = await signedInCookie(api.baseUrl);

  const response = await fetch(`${api.baseUrl}/api/events/7/registrations`, {
    method: 'POST',
    headers: { cookie },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { message: 'You are signed up' });
  assert.equal(api.registrationRows.length, 1);
  assert.equal(api.registrationRows[0].userId, member.id);
  assert.equal(api.registrationRows[0].eventId, upcomingEvent.id);
});

test('AC-17 POST for a full event returns 409 and creates no row', async (t) => {
  const api = await withApi(t, {
    events: [{ ...upcomingEvent, capacity: 1 }],
    registrations: [{ userId: 3, eventId: 7 }],
  });
  const cookie = await signedInCookie(api.baseUrl);

  const response = await fetch(`${api.baseUrl}/api/events/7/registrations`, {
    method: 'POST',
    headers: { cookie },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'This event is full' });
  assert.equal(api.registrationRows.length, 1);
});

test('AC-18 POST for an existing registration returns 409 and keeps one row', async (t) => {
  const api = await withApi(t, {
    events: [upcomingEvent],
    registrations: [{ userId: member.id, eventId: 7 }],
  });
  const cookie = await signedInCookie(api.baseUrl);

  const response = await fetch(`${api.baseUrl}/api/events/7/registrations`, {
    method: 'POST',
    headers: { cookie },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'You are already signed up' });
  assert.equal(api.registrationRows.length, 1);
});

test('AC-19 POST without a session returns 401 and creates no row', async (t) => {
  const api = await withApi(t, { events: [upcomingEvent] });

  const response = await fetch(`${api.baseUrl}/api/events/7/registrations`, {
    method: 'POST',
  });

  assert.equal(response.status, 401);
  assert.equal(api.registrationRows.length, 0);
});

test('AC-20 POST for a missing event returns 404 and for a started event returns 409', async (t) => {
  const api = await withApi(t, {
    events: [
      upcomingEvent,
      { ...upcomingEvent, id: 9, startsAt: NOW },
    ],
  });
  const cookie = await signedInCookie(api.baseUrl);

  const missing = await fetch(`${api.baseUrl}/api/events/999/registrations`, {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'Event not found.' });

  const started = await fetch(`${api.baseUrl}/api/events/9/registrations`, {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(started.status, 409);
  assert.deepEqual(await started.json(), { error: 'This event has already started' });
  assert.equal(api.registrationRows.length, 0);
});

test('AC-21 DELETE own registration returns 204 and removes the row', async (t) => {
  const api = await withApi(t, {
    events: [upcomingEvent],
    registrations: [{ userId: member.id, eventId: 7 }],
  });
  const cookie = await signedInCookie(api.baseUrl);

  const response = await fetch(`${api.baseUrl}/api/events/7/registrations/${member.id}`, {
    method: 'DELETE',
    headers: { cookie },
  });

  assert.equal(response.status, 204);
  assert.equal(api.registrationRows.length, 0);
});

test("AC-22 DELETE another member's registration returns 403 and keeps the row", async (t) => {
  const otherRegistration = { userId: 3, eventId: 7 };
  const api = await withApi(t, {
    events: [upcomingEvent],
    registrations: [otherRegistration],
  });
  const cookie = await signedInCookie(api.baseUrl);

  const response = await fetch(`${api.baseUrl}/api/events/7/registrations/3`, {
    method: 'DELETE',
    headers: { cookie },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You can only cancel your own registration.',
  });
  assert.deepEqual(api.registrationRows, [otherRegistration]);
});
