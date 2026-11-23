class ModelUnavailableError extends Error {
  constructor(reason, options = {}) {
    super(`Model unavailable: ${reason}`, options);
    this.name = 'ModelUnavailableError';
    this.reason = reason;
  }
}

function createGeminiClient({
  apiKey = process.env.GEMINI_API_KEY,
  modelName = process.env.MODEL_NAME || 'gemini-2.5-flash',
  fetchImpl = fetch,
} = {}) {
  return {
    async suggestEvent(text, today) {
      if (!apiKey) throw new ModelUnavailableError('GEMINI_API_KEY is not set');

      const date = today instanceof Date ? today.toISOString().slice(0, 10) : String(today);
      const prompt = [
        'Extract event details from the announcement below.',
        `Today's date is ${date}.`,
        'Return only a JSON object with string fields title, startsAt, description, and integer field capacity.',
        'Use an ISO 8601 date-time for startsAt. Use an empty string for unknown strings and null for unknown capacity.',
        '',
        'Announcement:',
        String(text ?? ''),
      ].join('\n');

      let response;
      try {
        response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
            signal: AbortSignal.timeout(5000),
          },
        );
      } catch (error) {
        const reason = error.name === 'TimeoutError' || error.name === 'AbortError'
          ? 'request timed out'
          : 'network error';
        throw new ModelUnavailableError(reason, { cause: error });
      }

      if (!response.ok) {
        let providerMessage = '';
        if (response.status >= 400 && response.status < 500) {
          try {
            const errorBody = await response.json();
            if (typeof errorBody?.error?.message === 'string') {
              providerMessage = errorBody.error.message.slice(0, 200);
              for (const sensitive of [apiKey, prompt, String(text ?? '')]) {
                if (sensitive) providerMessage = providerMessage.replaceAll(sensitive, '[redacted]');
              }
              providerMessage = providerMessage.replace(/[\r\n]+/g, ' ');
            }
          } catch {}
        }
        const baseReason = response.status === 429
          ? 'rate limited'
          : `provider returned HTTP ${response.status}`;
        throw new ModelUnavailableError(
          providerMessage ? `${baseReason}: ${providerMessage}` : baseReason,
        );
      }

      let envelope;
      try {
        envelope = await response.json();
      } catch (error) {
        throw new ModelUnavailableError('provider returned invalid JSON', { cause: error });
      }

      const generatedText = envelope?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter((part) => typeof part === 'string')
        .join('');
      if (!generatedText) throw new ModelUnavailableError('provider returned no suggestion');

      try {
        return JSON.parse(generatedText);
      } catch (error) {
        throw new ModelUnavailableError('model returned invalid JSON', { cause: error });
      }
    },
  };
}

module.exports = { createGeminiClient, ModelUnavailableError };
