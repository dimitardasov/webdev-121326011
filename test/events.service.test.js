const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventService } = require('../src/services/events');

const NOW = new Date('2026-11-05T10:00:00Z');
const member = { id: 2, role: 'member' };

function serviceWith(rows) {
  const calls = [];
  const events = {
    async listStartingAfter(since) {
      calls.push(since);
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
  assert.deepEqual(calls, [NOW]);
});

test('AC-2 free places are capacity minus registrations, never below zero', async () => {
  const { service } = serviceWith([
    { id: 1, title: 'Intro to Git', startsAt: '2026-11-12T10:00:00Z', capacity: 20, registered: 3 },
    { id: 2, title: 'Board games night', startsAt: '2026-11-26T10:00:00Z', capacity: 1, registered: 1 },
    { id: 3, title: 'Overbooked by hand', startsAt: '2026-11-27T10:00:00Z', capacity: 2, registered: 5 },
  ]);
  const list = await service.listUpcoming(member);
  assert.deepEqual(list.map((e) => e.freePlaces), [17, 0, 0]);
  assert.deepEqual(Object.keys(list[0]).sort(), ['capacity', 'freePlaces', 'id', 'startsAt', 'title']);
});

test('the default clock is the real time', async () => {
  let asked;
  const service = createEventService({ events: { listStartingAfter: async (since) => { asked = since; return []; } } });
  await service.listUpcoming(member);
  assert.ok(Math.abs(asked - Date.now()) < 5000);
});
