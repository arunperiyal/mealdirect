// The browser apps are on this same host, each on its own port
for (const link of document.querySelectorAll('[data-app-port]')) {
  link.href = `${location.protocol}//${location.hostname}:${link.dataset.appPort}/`;
}
document.getElementById('year').textContent = new Date().getFullYear();

// Suggestions and feedback: the API emails it to the MealDirect inbox
const form = document.getElementById('feedback-form');
const status = document.getElementById('feedback-status');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  const say = (text, kind) => { status.textContent = text; status.className = `status ${kind}`; };
  button.disabled = true;
  say('Sending…', '');
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || "Your message couldn't be sent. Please try again later.");
    form.reset();
    say('Thank you! Your message has reached the MealDirect team.', 'ok');
  } catch (error) {
    say(error.message === 'Failed to fetch' ? "Couldn't reach MealDirect. Check your connection and try again." : error.message, 'err');
  } finally {
    button.disabled = false;
  }
});
