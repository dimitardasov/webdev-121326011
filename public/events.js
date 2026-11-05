const states = {
  loading: document.getElementById('loading'),
  empty: document.getElementById('empty'),
  error: document.getElementById('error'),
  list: document.getElementById('list'),
};
const rowTemplate = document.getElementById('event-row');
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' });

function show(name) {
  for (const [key, element] of Object.entries(states)) element.hidden = key !== name;
}

async function loadEvents() {
  show('loading');
  try {
    const response = await fetch('/api/events');
    if (response.status === 401) {
      window.location.assign('/login');
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { events } = await response.json();
    if (events.length === 0) return show('empty');

    // textContent, never innerHTML: a title can contain anything an organizer typed.
    states.list.replaceChildren(
      ...events.map((event) => {
        const row = rowTemplate.content.cloneNode(true);
        row.querySelector('.title').textContent = event.title;
        row.querySelector('.when').textContent = dateFormat.format(new Date(event.startsAt));
        row.querySelector('.places').textContent =
          event.freePlaces === 0 ? 'Full' : `${event.freePlaces} of ${event.capacity} places free`;
        return row;
      }),
    );
    show('list');
  } catch {
    show('error');
  }
}

async function loadWho() {
  const response = await fetch('/api/me');
  if (response.ok) {
    const { user } = await response.json();
    document.getElementById('who').textContent = `${user.name} (${user.role})`;
  }
}

document.getElementById('retry').addEventListener('click', loadEvents);
document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.assign('/login');
});

loadWho();
loadEvents();
