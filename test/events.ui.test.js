const test = require('node:test');
const assert = require('node:assert/strict');
const { registrationUpdate } = require('../public/events');

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
