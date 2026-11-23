const test = require('node:test');
const assert = require('node:assert/strict');
const { createSuggestionService, FALLBACK_MESSAGE } = require('../src/services/suggestions');
const { ModelUnavailableError } = require('../src/model/gemini');

const NOW = new Date('2026-11-05T10:00:00Z');
const organizer = { id: 1, role: 'organizer' };
const member = { id: 2, role: 'member' };

function serviceWith(client) {
  return createSuggestionService({ client, clock: () => NOW });
}

test('a visitor cannot request event suggestions', async () => {
  const service = serviceWith({ async suggestEvent() { assert.fail('client must not be called'); } });

  await assert.rejects(service.suggestEvent(null, 'announcement'), {
    status: 401,
    message: 'Sign in to get event suggestions.',
  });
});

test('a member cannot request event suggestions', async () => {
  const service = serviceWith({ async suggestEvent() { assert.fail('client must not be called'); } });

  await assert.rejects(service.suggestEvent(member, 'announcement'), {
    status: 403,
    message: 'Only organizers can get event suggestions.',
  });
});

test('valid event suggestion fields are returned', async () => {
  let received;
  const service = serviceWith({
    async suggestEvent(text, today) {
      received = { text, today };
      return {
        title: 'Club workshop',
        startsAt: '2026-11-12T10:00:00Z',
        capacity: 25,
        description: 'Bring a laptop.',
      };
    },
  });

  const result = await service.suggestEvent(organizer, 'Workshop next week');

  assert.deepEqual(received, { text: 'Workshop next week', today: NOW });
  assert.deepEqual(result, {
    title: 'Club workshop',
    startsAt: '2026-11-12T10:00:00Z',
    capacity: 25,
    description: 'Bring a laptop.',
    message: '',
  });
});

test('past dates, invalid places and overlong titles are blanked independently', async () => {
  const service = serviceWith({
    async suggestEvent() {
      return {
        title: 'x'.repeat(121),
        startsAt: '2026-11-04T10:00:00Z',
        capacity: 501,
        description: 'Keep valid description.',
      };
    },
  });

  assert.deepEqual(await service.suggestEvent(organizer, 'announcement'), {
    title: '',
    startsAt: '',
    capacity: '',
    description: 'Keep valid description.',
    message: '',
  });
});

test('a non-whole number of places and an invalid date are blanked', async () => {
  const service = serviceWith({
    async suggestEvent() {
      return {
        title: 'Workshop',
        startsAt: 'not-a-date',
        capacity: 2.5,
        description: '',
      };
    },
  });

  const result = await service.suggestEvent(organizer, 'announcement');

  assert.equal(result.startsAt, '');
  assert.equal(result.capacity, '');
  assert.equal(result.title, 'Workshop');
});

test('places at the minimum and maximum supported values remain valid', async () => {
  for (const capacity of [1, 500]) {
    const service = serviceWith({
      async suggestEvent() {
        return {
          title: 'Workshop',
          startsAt: '2026-11-12T10:00:00Z',
          capacity,
          description: '',
        };
      },
    });

    assert.equal((await service.suggestEvent(organizer, 'announcement')).capacity, capacity);
  }
});

test('AC-10 a timeout logs only its reason and returns the empty fallback suggestion', async (t) => {
  const logged = [];
  t.mock.method(console, 'error', (line) => logged.push(line));
  const service = serviceWith({
    async suggestEvent() {
      throw new ModelUnavailableError('request timed out');
    },
  });

  assert.deepEqual(await service.suggestEvent(organizer, 'announcement'), {
    title: '',
    startsAt: '',
    capacity: '',
    description: '',
    message: FALLBACK_MESSAGE,
  });
  assert.deepEqual(logged, ['model suggestion fell back: request timed out']);
});

test('AC-10 a 429 rate limit returns the empty fallback suggestion', async () => {
  const service = serviceWith({
    async suggestEvent() {
      throw new ModelUnavailableError('rate limited');
    },
  });

  assert.equal(
    (await service.suggestEvent(organizer, 'announcement')).message,
    FALLBACK_MESSAGE,
  );
});

test('missing key, network error and invalid JSON each return the fallback', async (t) => {
  for (const reason of [
    'GEMINI_API_KEY is not set',
    'network error',
    'model returned invalid JSON',
  ]) {
    await t.test(reason, async () => {
      const service = serviceWith({
        async suggestEvent() {
          throw new ModelUnavailableError(reason);
        },
      });

      assert.deepEqual(await service.suggestEvent(organizer, 'announcement'), {
        title: '',
        startsAt: '',
        capacity: '',
        description: '',
        message: FALLBACK_MESSAGE,
      });
    });
  }
});

test('an unexpected client error is not hidden as a provider fallback', async () => {
  const service = serviceWith({
    async suggestEvent() {
      throw new Error('unexpected service defect');
    },
  });

  await assert.rejects(service.suggestEvent(organizer, 'announcement'), {
    message: 'unexpected service defect',
  });
});

test('missing and non-string suggestion fields are blanked', async () => {
  const missing = serviceWith({ async suggestEvent() { return undefined; } });
  assert.deepEqual(await missing.suggestEvent(organizer, 'announcement'), {
    title: '',
    startsAt: '',
    capacity: '',
    description: '',
    message: '',
  });

  const invalid = serviceWith({
    async suggestEvent() {
      return { title: 123, startsAt: 123, capacity: 0, description: 123 };
    },
  });
  assert.deepEqual(await invalid.suggestEvent(organizer, 'announcement'), {
    title: '',
    startsAt: '',
    capacity: '',
    description: '',
    message: '',
  });
});

test('suggestion service uses the default clock when none is injected', async () => {
  const service = createSuggestionService({
    client: {
      async suggestEvent() {
        return {
          title: 'Future event',
          startsAt: '2999-11-12T10:00:00Z',
          capacity: 20,
          description: 'Details',
        };
      },
    },
  });

  const result = await service.suggestEvent(organizer, 'announcement');

  assert.equal(result.title, 'Future event');
  assert.equal(result.startsAt, '2999-11-12T10:00:00Z');
});
