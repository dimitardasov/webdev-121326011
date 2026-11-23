const test = require('node:test');
const assert = require('node:assert/strict');
const { registrationUpdate, fetchWithConnectionMessage } = require('../public/events');

test('network failures show a message people can understand', async (context) => {
  context.mock.method(global, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });

  await assert.rejects(fetchWithConnectionMessage('/api/events'), {
    message: 'No connection. Check your internet and try again.',
  });
});

test('AC-23 a successful sign-up decrements free places and changes the button to Cancel', () => {
  assert.deepEqual(
    registrationUpdate({ capacity: 4, freePlaces: 2 }, { status: 201 }),
    { freePlaces: 1, buttonLabel: 'Cancel' },
  );
});

test('AC-23 a successful cancellation increments free places and changes the button to Sign up', () => {
  assert.deepEqual(
    registrationUpdate({ capacity: 4, freePlaces: 1 }, { status: 204 }),
    { freePlaces: 2, buttonLabel: 'Sign up' },
  );
});

test('AC-23 the button logic keeps free places within the event capacity', () => {
  assert.deepEqual(
    registrationUpdate({ capacity: 1, freePlaces: 0 }, { status: 204 }),
    { freePlaces: 1, buttonLabel: 'Sign up' },
  );
  assert.deepEqual(
    registrationUpdate({ capacity: 1, freePlaces: 0 }, { status: 201 }),
    { freePlaces: 0, buttonLabel: 'Cancel' },
  );
});
