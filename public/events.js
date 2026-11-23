const noConnectionMessage = 'No connection. Check your internet and try again.';

async function fetchWithConnectionMessage(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(noConnectionMessage);
  }
}

function registrationUpdate(event, apiResult) {
  if (apiResult.status !== 201 && apiResult.status !== 204) {
    throw new TypeError('Registration update requires a successful API response.');
  }

  const isRegistered = apiResult.status === 201;
  return {
    freePlaces: Math.min(
      event.capacity,
      Math.max(0, event.freePlaces + (isRegistered ? -1 : 1)),
    ),
    buttonLabel: isRegistered ? 'Cancel' : 'Sign up',
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registrationUpdate, fetchWithConnectionMessage };
}

if (typeof document !== 'undefined') {
  const states = {
    loading: document.getElementById('loading'),
    empty: document.getElementById('empty'),
    error: document.getElementById('error'),
    list: document.getElementById('list'),
  };
  const rowTemplate = document.getElementById('event-row');
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' });
  let currentUserId;

  function show(name) {
    for (const [key, element] of Object.entries(states)) element.hidden = key !== name;
  }

  function updatePlaces(element, event) {
    element.textContent =
      event.freePlaces === 0 ? 'Full' : `${event.freePlaces} of ${event.capacity} places free`;
  }

  async function changeRegistration(event, row, button) {
    const error = row.querySelector('.registration-error');
    error.hidden = true;
    error.textContent = '';
    button.disabled = true;

    try {
      const response = await fetchWithConnectionMessage(
        `/api/events/${event.id}/registrations${event.isRegistered ? `/${currentUserId}` : ''}`,
        { method: event.isRegistered ? 'DELETE' : 'POST' },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || `Request failed (${response.status}).`);
      }

      const update = registrationUpdate(event, response);
      event.freePlaces = update.freePlaces;
      event.isRegistered = update.buttonLabel === 'Cancel';
      button.textContent = update.buttonLabel;
      button.disabled = !event.isRegistered && event.freePlaces === 0;
      updatePlaces(row.querySelector('.places'), event);
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
      button.disabled = !event.isRegistered && event.freePlaces === 0;
    }
  }

  async function loadEvents() {
    show('loading');
    try {
      const meResponse = await fetchWithConnectionMessage('/api/me');
      if (meResponse.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!meResponse.ok) throw new Error(`HTTP ${meResponse.status}`);
      const { user } = await meResponse.json();
      currentUserId = user.id;
      document.getElementById('who').textContent = `${user.name} (${user.role})`;
      document.getElementById('new-event').hidden = user.role !== 'organizer';

      const response = await fetchWithConnectionMessage('/api/events');
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { events } = await response.json();
      if (events.length === 0) return show('empty');

      states.list.replaceChildren(
        ...events.map((event) => {
          const row = rowTemplate.content.cloneNode(true);
          const item = row.querySelector('li');
          row.querySelector('.title').textContent = event.title;
          row.querySelector('.when').textContent = dateFormat.format(new Date(event.startsAt));
          updatePlaces(row.querySelector('.places'), event);

          const button = row.querySelector('.registration-button');
          button.textContent = event.isRegistered ? 'Cancel' : 'Sign up';
          button.disabled = !event.isRegistered && event.freePlaces === 0;
          button.addEventListener('click', () => changeRegistration(event, item, button));
          return row;
        }),
      );
      show('list');
    } catch (requestError) {
      document.getElementById('error-message').textContent =
        requestError.message === noConnectionMessage ? noConnectionMessage : 'Could not load the events.';
      show('error');
    }
  }

  document.getElementById('retry').addEventListener('click', loadEvents);
  document.getElementById('logout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.assign('/login');
  });

  loadEvents();
}
