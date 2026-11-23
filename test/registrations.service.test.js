const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistrationService } = require('../src/services/registrations');

const NOW = new Date('2026-11-05T10:00:00Z');
const member = { id: 2, role: 'member' };
const upcomingEvent = {
  id: 7,
  startsAt: new Date('2026-11-12T10:00:00Z'),
  capacity: 2,
};

function serviceWith({ event = upcomingEvent, seeded = [] } = {}) {
  const registrations = [...seeded];
  const calls = [];
  const data = {
    async withEventTransaction(eventId, operation) {
      calls.push(eventId);
      return operation({
        event: event && String(event.id) === String(eventId) ? event : null,
        async hasRegistration(userId) {
          return registrations.some((registration) =>
            String(registration.userId) === String(userId));
        },
        async countRegistrations() {
          return registrations.filter((registration) =>
            String(registration.eventId) === String(eventId)).length;
        },
        async insertRegistration(userId) {
          const registration = { userId, eventId, createdAt: NOW };
          registrations.push(registration);
          return { createdAt: registration.createdAt };
        },
        async deleteRegistration(userId) {
          const index = registrations.findIndex((registration) =>
            String(registration.userId) === String(userId)
              && String(registration.eventId) === String(eventId));
          if (index === -1) return false;
          registrations.splice(index, 1);
          return true;
        },
      });
    },
  };

  return {
    service: createRegistrationService({ registrations: data, clock: () => NOW }),
    registrations,
    calls,
  };
}

test('AC-16 AC-3 a member signs up for an upcoming event with a free place', async () => {
  const { service, registrations } = serviceWith();

  const result = await service.register(member, 7);

  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0], {
    userId: member.id,
    eventId: 7,
    createdAt: NOW,
  });
  assert.equal(result.userId, member.id);
});

test.skip('AC-17 AC-4 a member cannot sign up for a full event', async () => {
  const { service, registrations } = serviceWith({
    event: { ...upcomingEvent, capacity: 1 },
    seeded: [{ userId: 3, eventId: 7 }],
  });

  await assert.rejects(service.register(member, 7), {
    status: 409,
    message: 'This event is full',
  });
  assert.deepEqual(registrations, [{ userId: 3, eventId: 7 }]);
});

test('AC-18 AC-5 a member cannot sign up twice for the same event', async () => {
  const existing = { userId: member.id, eventId: 7 };
  const { service, registrations } = serviceWith({ seeded: [existing] });

  await assert.rejects(service.register(member, 7), {
    status: 409,
    message: 'You are already signed up',
  });
  assert.deepEqual(registrations, [existing]);
});

test('AC-19 a visitor cannot sign up', async () => {
  const { service, registrations, calls } = serviceWith();

  await assert.rejects(service.register(null, 7), { status: 401 });

  assert.deepEqual(registrations, []);
  assert.deepEqual(calls, []);
});

test('AC-20 a missing or already-started event cannot be signed up for', async (t) => {
  await t.test('missing event', async () => {
    const { service, registrations } = serviceWith({ event: null });

    await assert.rejects(service.register(member, 999), {
      status: 404,
      message: 'Event not found.',
    });
    assert.deepEqual(registrations, []);
  });

  await t.test('event has already started', async () => {
    const { service, registrations } = serviceWith({
      event: { ...upcomingEvent, startsAt: NOW },
    });

    await assert.rejects(service.register(member, 7), {
      status: 409,
      message: 'This event has already started',
    });
    assert.deepEqual(registrations, []);
  });
});

test('AC-21 AC-6 a member cancels their own registration', async () => {
  const { service, registrations } = serviceWith({
    seeded: [{ userId: member.id, eventId: 7 }],
  });

  await service.cancel(member, 7, member.id);

  assert.deepEqual(registrations, []);
});

test("AC-22 a member cannot cancel another member's registration", async () => {
  const otherRegistration = { userId: 3, eventId: 7 };
  const { service, registrations } = serviceWith({ seeded: [otherRegistration] });

  await assert.rejects(service.cancel(member, 7, 3), {
    status: 403,
    message: 'You can only cancel your own registration.',
  });
  assert.deepEqual(registrations, [otherRegistration]);
});

test('a visitor cannot cancel a registration', async () => {
  const { service, calls } = serviceWith();

  await assert.rejects(service.cancel(null, 7, member.id), {
    status: 401,
    message: 'Sign in to cancel a registration.',
  });

  assert.deepEqual(calls, []);
});

test('AC-8 only an organizer can list event registrations', async () => {
  const data = {
    async eventExists(eventId) { return String(eventId) === '7'; },
    async listByEventId(eventId) {
      return [{ userId: 2, name: 'Mihail Member', signedUpAt: NOW }];
    },
  };
  const service = createRegistrationService({ registrations: data, clock: () => NOW });
  const organizer = { id: 1, role: 'organizer' };

  assert.deepEqual(await service.listForOrganizer(organizer, 7), [
    { userId: 2, name: 'Mihail Member', signedUpAt: NOW },
  ]);
  await assert.rejects(service.listForOrganizer(member, 7), { status: 403 });
  await assert.rejects(service.listForOrganizer(null, 7), { status: 401 });
});

test('organizer receives 404 when listing registrations for a missing event', async () => {
  const service = createRegistrationService({
    registrations: {
      async eventExists() { return false; },
      async listByEventId() { assert.fail('a missing event has no registrations to list'); },
    },
  });

  await assert.rejects(service.listForOrganizer({ id: 1, role: 'organizer' }, 999), {
    status: 404,
    message: 'Event not found.',
  });
});

test('cancellation reports a missing event or registration', async () => {
  const missingEvent = serviceWith({ event: null }).service;
  await assert.rejects(missingEvent.cancel(member, 999, member.id), {
    status: 404,
    message: 'Event not found.',
  });

  const missingRegistration = serviceWith().service;
  await assert.rejects(missingRegistration.cancel(member, 7, member.id), {
    status: 404,
    message: 'Registration not found.',
  });
});

test('registration uses the default clock when none is injected', async () => {
  const registration = await createRegistrationService({
    registrations: {
      async withEventTransaction(eventId, operation) {
        return operation({
          event: { ...upcomingEvent, startsAt: new Date(Date.now() + 60_000) },
          async hasRegistration() { return false; },
          async countRegistrations() { return 0; },
          async insertRegistration() { return { createdAt: NOW }; },
        });
      },
    },
  }).register(member, 7);

  assert.equal(registration.userId, member.id);
  assert.equal(registration.eventId, 7);
});
