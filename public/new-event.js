const NO_CONNECTION_MESSAGE = 'No connection. Check your internet and try again.';
const SUGGESTION_FALLBACK_MESSAGE = 'Suggestions are unavailable, fill in the form yourself';
const SUGGESTED_LABEL = 'Suggested by the model, check before saving';
const SUGGESTIBLE_FIELDS = ['title', 'startsAt', 'capacity', 'description'];

function eventResultView({ operation, response, networkError = false }) {
  if (networkError) {
    return { status: 'error', message: NO_CONNECTION_MESSAGE, suggestedFields: [] };
  }

  if (operation === 'create' && response?.ok) {
    return { status: 'success', message: 'Event created successfully.', suggestedFields: [] };
  }

  const body = response?.body || {};
  if (body.error) {
    return { status: 'error', message: body.error, suggestedFields: [] };
  }
  if (operation === 'suggest' && body.message) {
    return { status: 'unavailable', message: SUGGESTION_FALLBACK_MESSAGE, suggestedFields: [] };
  }
  if (operation === 'suggest' && response?.ok) {
    return {
      status: 'suggestion',
      message: '',
      suggestedFields: SUGGESTIBLE_FIELDS.filter((field) => body[field] !== '' && body[field] != null),
    };
  }

  return {
    status: 'error',
    message: operation === 'suggest' ? SUGGESTION_FALLBACK_MESSAGE : 'Could not create event. Try again.',
    suggestedFields: [],
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { eventResultView, NO_CONNECTION_MESSAGE, SUGGESTION_FALLBACK_MESSAGE, SUGGESTED_LABEL };
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('event-form');
  const suggestButton = document.getElementById('suggest');
  const createButton = document.getElementById('create');
  const message = document.getElementById('form-message');
  const progress = document.getElementById('model-progress');
  const success = document.getElementById('create-success');
  const successMessage = document.getElementById('create-success-message');
  const modelFilledValues = new Map();

  function showMessage(view) {
    message.textContent = view.message;
    message.hidden = !view.message;
  }

  function setSuggestedFields(fields, body) {
    for (const [name, oldValue] of modelFilledValues) {
      const input = form.elements.namedItem(name);
      if (input.value === oldValue) input.value = '';
      document.getElementById(`suggested-${name}`).hidden = true;
    }
    modelFilledValues.clear();

    for (const name of fields) {
      const input = form.elements.namedItem(name);
      const value = name === 'startsAt' ? toLocalDateTime(body[name]) : String(body[name]);
      input.value = value;
      modelFilledValues.set(name, value);
      const label = document.getElementById(`suggested-${name}`);
      label.textContent = SUGGESTED_LABEL;
      label.hidden = false;
    }
  }

  function toLocalDateTime(value) {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  suggestButton.addEventListener('click', async () => {
    showMessage({ message: '' });
    suggestButton.disabled = true;
    suggestButton.textContent = 'Asking the model…';
    progress.hidden = false;

    try {
      const response = await fetch('/api/events/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: document.getElementById('announcement').value }),
      });
      const body = await response.json().catch(() => ({}));
      const view = eventResultView({ operation: 'suggest', response: { ok: response.ok, body } });
      showMessage(view);
      if (view.status === 'suggestion') setSuggestedFields(view.suggestedFields, body);
    } catch {
      showMessage(eventResultView({ operation: 'suggest', networkError: true }));
    } finally {
      progress.hidden = true;
      suggestButton.disabled = false;
      suggestButton.textContent = 'Suggest details';
    }
  });

  form.addEventListener('input', (event) => {
    const name = event.target.name;
    if (!modelFilledValues.has(name)) return;
    modelFilledValues.delete(name);
    document.getElementById(`suggested-${name}`).hidden = true;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    showMessage({ message: '' });
    success.hidden = true;
    createButton.disabled = true;
    createButton.textContent = 'Creating…';

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.elements.title.value,
          startsAt: new Date(form.elements.startsAt.value).toISOString(),
          capacity: Number(form.elements.capacity.value),
          description: form.elements.description.value,
        }),
      });
      const body = await response.json().catch(() => ({}));
      const view = eventResultView({ operation: 'create', response: { ok: response.ok, body } });
      if (view.status === 'success') {
        successMessage.textContent = view.message;
        success.hidden = false;
        form.hidden = true;
      } else {
        showMessage(view);
      }
    } catch {
      showMessage(eventResultView({ operation: 'create', networkError: true }));
    } finally {
      createButton.disabled = false;
      createButton.textContent = 'Create event';
    }
  });
}