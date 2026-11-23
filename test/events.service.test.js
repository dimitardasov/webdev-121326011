const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventService } = require('../src/services/events');

const NOW = new Date('2026-11-05T10:00:00Z');
const member = { id: 2, role: 'member' };

function serviceWith(rows) {
  const calls = [];
  const events = {
    async listStartingAfter(since, userId) {
      calls.push({ since, userId });
      return rows;
    },
  };
  return { service: createEventService({ events, clock: () => NOW }), calls };
}

test('AC-12 a visitor who is not signed in is refused with 401', async () => {
  const { service, calls } = serviceWith([]);
  await assert.rejects(service.listUpcoming(null), { status: 401 });
  assert.equal(calls.length, 0, 'the database is not even asked');
});

test('AC-1 only events after "now" are asked for', async () => {
  const { service, calls } = serviceWith([]);
  await service.listUpcoming(member);
  assert.deepEqual(calls, [{ since: NOW, userId: member.id }]);
});

test('AC-2 free places are capacity minus registrations, never below zero', async () => {
  const { service } = serviceWith([
    { id: 1, title: 'Intro to Git', startsAt: '2026-11-12T10:00:00Z', capacity: 20, registered: 3, isRegistered: false },
    { id: 2, title: 'Board games night', startsAt: '2026-11-26T10:00:00Z', capacity: 1, registered: 1, isRegistered: true },
    { id: 3, title: 'Overbooked by hand', startsAt: '2026-11-27T10:00:00Z', capacity: 2, registered: 5, isRegistered: false },
  ]);
  const list = await service.listUpcoming(member);
  assert.deepEqual(list.map((e) => e.freePlaces), [17, 0, 0]);
  assert.deepEqual(list.map((e) => e.isRegistered), [false, true, false]);
  assert.deepEqual(Object.keys(list[0]).sort(), [
    'capacity', 'freePlaces', 'id', 'isRegistered', 'startsAt', 'title',
  ]);
});

test('AC-7 an organizer creates a valid event and members cannot create one', async () => {
  const created = [];
  const events = {
    async listStartingAfter() { return []; },
    async createEvent(input) {
      created.push(input);
      return { id: 8, ...input };
    },
  };
  const service = createEventService({ events, clock: () => NOW });
  const organizer = { id: 1, role: 'organizer' };

  const result = await service.create(organizer, {
    title: 'REST workshop',
    description: 'Bring a laptop.',
    startsAt: '2026-11-12T10:00:00Z',
    capacity: 20,
  });

  assert.equal(result.id, 8);
  assert.equal(created.length, 1);
  assert.equal(created[0].description, 'Bring a laptop.');
  assert.equal(created[0].capacity, 20);
  await service.create(organizer, {
    title: 'Workshop without details',
    startsAt: '2026-11-12T10:00:00Z',
    capacity: 20,
  });
  assert.equal(created[1].description, '');
  await assert.rejects(
    service.create(member, { title: 'REST workshop', startsAt: '2026-11-12T10:00:00Z', capacity: 20 }),
    { status: 403 },
  );
  assert.equal(created.length, 2);
});

test('AC-7 event creation refuses missing, past, and invalid capacity data', async () => {
  const events = {
    async listStartingAfter() { return []; },
    async createEvent() { throw new Error('should not be called'); },
  };
  const service = createEventService({ events, clock: () => NOW });
  const organizer = { id: 1, role: 'organizer' };

  await assert.rejects(service.create(null, { title: 'Event', startsAt: '2026-11-12T10:00:00Z', capacity: 20 }), { status: 401 });
  await assert.rejects(service.create(organizer, { title: '', startsAt: '2026-11-12T10:00:00Z', capacity: 20 }), { status: 400 });
  await assert.rejects(service.create(organizer, { title: 'Past', startsAt: '2026-11-05T10:00:00Z', capacity: 20 }), { status: 400 });
  await assert.rejects(service.create(organizer, { title: 'Low', startsAt: '2026-11-12T10:00:00Z', capacity: 0 }), { status: 400 });
  await assert.rejects(service.create(organizer, { title: 'High', startsAt: '2026-11-12T10:00:00Z', capacity: 501 }), { status: 400 });
});

test('event creation refuses malformed titles, dates, and fractional places', async () => {
  const service = createEventService({
    events: {
      async createEvent() { assert.fail('invalid event details must not be saved'); },
    },
    clock: () => NOW,
  });
  const invalidInputs = [
    null,
    { title: 123, startsAt: '2026-11-12T10:00:00Z', capacity: 20 },
    { title: 'x'.repeat(121), startsAt: '2026-11-12T10:00:00Z', capacity: 20 },
    { title: 'Invalid date', startsAt: 'not-a-date', capacity: 20 },
    { title: 'Fractional places', startsAt: '2026-11-12T10:00:00Z', capacity: 2.5 },
  ];

  for (const input of invalidInputs) {
    await assert.rejects(service.create({ id: 1, role: 'organizer' }, input), {
      status: 400,
      message: 'Invalid event details.',
    });
  }
});

test('the default clock is the real time', async () => {
  let asked;
  const service = createEventService({
    events: { listStartingAfter: async (since) => { asked = since; return []; } },
  });
  await service.listUpcoming(member);
  assert.ok(Math.abs(asked - Date.now()) < 5000);
});
