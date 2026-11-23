const test = require('node:test');
const assert = require('node:assert/strict');
const { registrationUpdate, fetchWithConnectionMessage } = require('../public/events');
const {
  eventResultView,
  NO_CONNECTION_MESSAGE,
  SUGGESTION_FALLBACK_MESSAGE,
  SUGGESTED_LABEL,
} = require('../public/new-event');

test('network failures show a message people can understand', async (context) => {
  context.mock.method(global, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });

  await assert.rejects(fetchWithConnectionMessage('/api/events'), {
    message: 'No connection. Check your internet and try again.',
  });
});

test('model suggestion results select the fallback message and no labels', () => {
  assert.deepEqual(eventResultView({
    operation: 'suggest',
    response: {
      ok: true,
      body: { title: '', startsAt: '', capacity: '', description: '', message: SUGGESTION_FALLBACK_MESSAGE },
    },
  }), {
    status: 'unavailable',
    message: SUGGESTION_FALLBACK_MESSAGE,
    suggestedFields: [],
  });
});

test('valid model suggestions label only the fields they filled', () => {
  assert.deepEqual(eventResultView({
    operation: 'suggest',
    response: {
      ok: true,
      body: { title: 'Workshop', startsAt: '', capacity: 20, description: 'Bring a laptop.', message: '' },
    },
  }), {
    status: 'suggestion',
    message: '',
    suggestedFields: ['title', 'capacity', 'description'],
  });
  assert.equal(SUGGESTED_LABEL, 'Suggested by the model, check before saving');
});

test('create results preserve server messages, report success, and explain offline failures', () => {
  assert.deepEqual(eventResultView({
    operation: 'create',
    response: { ok: false, body: { error: 'Only organizers can create events.' } },
  }), { status: 'error', message: 'Only organizers can create events.', suggestedFields: [] });
  assert.deepEqual(eventResultView({
    operation: 'create',
    response: { ok: true, body: { event: { id: 8 } } },
  }), { status: 'success', message: 'Event created successfully.', suggestedFields: [] });
  assert.deepEqual(eventResultView({ operation: 'create', networkError: true }), {
    status: 'error', message: NO_CONNECTION_MESSAGE, suggestedFields: [],
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
