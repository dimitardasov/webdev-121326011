const test = require('node:test');
const assert = require('node:assert/strict');
const { createGeminiClient, ModelUnavailableError } = require('../src/model/gemini');

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

test('Gemini client sends the configured key, model, announcement and date using fetch', async () => {
  let request;
  const client = createGeminiClient({
    apiKey: 'test-key',
    modelName: 'test-model',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({
        candidates: [{ content: { parts: [{ text: '{"title":"Workshop"}' }] } }],
      });
    },
  });

  const result = await client.suggestEvent('A workshop next week', new Date('2026-11-05T10:00:00Z'));
  const body = JSON.parse(request.options.body);

  assert.equal(result.title, 'Workshop');
  assert.deepEqual(body.generationConfig, {
    responseMimeType: 'application/json',
  });
  assert.match(request.url, /test-model:generateContent$/);
  assert.equal(request.options.headers['x-goog-api-key'], 'test-key');
  assert.match(body.contents[0].parts[0].text, /A workshop next week/);
  assert.match(body.contents[0].parts[0].text, /2026-11-05/);
  assert.ok(request.options.signal instanceof AbortSignal);
});

test('Gemini client uses the default model when MODEL_NAME is unset', async () => {
  let url;
  const originalModel = process.env.MODEL_NAME;
  delete process.env.MODEL_NAME;
  try {
    const client = createGeminiClient({
      apiKey: 'test-key',
      fetchImpl: async (requestUrl) => {
        url = requestUrl;
        return response({
          candidates: [{ content: { parts: [{ text: '{}' }] } }],
        });
      },
    });

    await client.suggestEvent('', new Date('2026-11-05T10:00:00Z'));
  } finally {
    if (originalModel === undefined) delete process.env.MODEL_NAME;
    else process.env.MODEL_NAME = originalModel;
  }

  assert.match(url, /gemini-2\.5-flash:generateContent$/);
});

test('Gemini client does not call fetch when the API key is missing', async () => {
  let called = false;
  const client = createGeminiClient({
    apiKey: '',
    fetchImpl: async () => { called = true; },
  });

  await assert.rejects(
    client.suggestEvent('announcement', new Date()),
    (error) => error instanceof ModelUnavailableError && error.reason === 'GEMINI_API_KEY is not set',
  );
  assert.equal(called, false);
});

test('Gemini client converts timeout and network errors into ModelUnavailableError', async (t) => {
  await t.test('timeout', async () => {
    const client = createGeminiClient({
      apiKey: 'test-key',
      fetchImpl: async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); },
    });

    await assert.rejects(
      client.suggestEvent('announcement', new Date()),
      (error) => error instanceof ModelUnavailableError && error.reason === 'request timed out',
    );
  });

  await t.test('network error', async () => {
    const client = createGeminiClient({
      apiKey: 'test-key',
      fetchImpl: async () => { throw new Error('offline'); },
    });

    await assert.rejects(
      client.suggestEvent('announcement', new Date()),
      (error) => error instanceof ModelUnavailableError && error.reason === 'network error',
    );
  });
});

test('Gemini client includes provider error messages for 4xx responses', async (t) => {
  for (const [status, payload, reason] of [
    [429, { error: { message: 'Quota exceeded.' } }, 'rate limited: Quota exceeded.'],
    [503, { error: { message: 'Unavailable.' } }, 'provider returned HTTP 503'],
  ]) {
    await t.test(String(status), async () => {
      const client = createGeminiClient({
        apiKey: 'test-key',
        fetchImpl: async () => response(payload, { ok: false, status }),
      });

      await assert.rejects(
        client.suggestEvent('announcement', new Date()),
        (error) => error instanceof ModelUnavailableError && error.reason === reason,
      );
    });
  }
});

test('Gemini client truncates and redacts 4xx provider error messages', async () => {
  const announcement = 'private announcement';
  const providerMessage =
    `Invalid key test-key; announcement: ${announcement}; ${'x'.repeat(220)}\nextra line`;
  const client = createGeminiClient({
    apiKey: 'test-key',
    fetchImpl: async () => response(
      { error: { message: providerMessage } },
      { ok: false, status: 400 },
    ),
  });

  await assert.rejects(
    client.suggestEvent(announcement, new Date('2026-11-05T10:00:00Z')),
    (error) => {
      const expectedDetails = providerMessage.slice(0, 200)
        .replaceAll('test-key', '[redacted]')
        .replaceAll(announcement, '[redacted]')
        .replace(/[\r\n]+/g, ' ');
      assert.equal(error.reason, `provider returned HTTP 400: ${expectedDetails}`);
      assert.ok(!error.reason.includes('test-key'));
      assert.ok(!error.reason.includes(announcement));
      assert.ok(!error.reason.includes('\n'));
      return error instanceof ModelUnavailableError;
    },
  );
});

test('Gemini client rejects invalid provider and generated JSON', async (t) => {
  await t.test('invalid provider JSON', async () => {
    const client = createGeminiClient({
      apiKey: 'test-key',
      fetchImpl: async () => ({ ok: true, status: 200, async json() { throw new SyntaxError('invalid'); } }),
    });

    await assert.rejects(
      client.suggestEvent('announcement', new Date()),
      (error) => error instanceof ModelUnavailableError && error.reason === 'provider returned invalid JSON',
    );
  });

  await t.test('invalid generated JSON', async () => {
    const client = createGeminiClient({
      apiKey: 'test-key',
      fetchImpl: async () => response({
        candidates: [{ content: { parts: [{ text: 'not json' }] } }],
      }),
    });

    await assert.rejects(
      client.suggestEvent('announcement', new Date()),
      (error) => error instanceof ModelUnavailableError && error.reason === 'model returned invalid JSON',
    );
  });
});
