const form = document.getElementById('login-form');
const message = document.getElementById('message');
const submit = document.getElementById('submit');

if (new URLSearchParams(window.location.search).get('error') === 'github') {
  showError('Could not sign in with GitHub');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Signing in…';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email.value, password: form.password.value }),
    });
    if (response.ok) {
      window.location.assign('/events');
      return;
    }
    const body = await response.json().catch(() => ({}));
    showError(body.error || 'Could not sign in. Try again.');
  } catch {
    showError('No connection to the server. Try again.');
  }
});

function showError(text) {
  message.textContent = text;
  message.hidden = false;
  submit.disabled = false;
  submit.textContent = 'Sign in';
}
