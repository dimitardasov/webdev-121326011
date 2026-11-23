# Readiness · Club Events

## 1. Live URL and how to verify it
- https://webdev-121326011.onrender.com, Render Free, Frankfurt, Docker; database on Neon (Frankfurt).
- How I checked: `curl -s https://webdev-121326011.onrender.com/health` answers `{"status":"ok","db":"ok"}`; the page loads over https with no warning; Sign in with GitHub works in a private window.

## 2. Environment variables
- Required, the app stops without them: `DATABASE_URL`, `SESSION_SECRET` (set in Render's Environment).
- For GitHub sign-in: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `PUBLIC_BASE_URL` (set in Render).
- Model: `MODEL_NAME` set in Render; `GEMINI_API_KEY` is not set, so the suggestion always uses the fallback.
- Only in my codespace's .env, never in Render: `SEED_MEMBER_PASSWORD`, `SEED_ORGANIZER_PASSWORD` (seeding Neon), `MCP_EMAIL`, `MCP_PASSWORD` (the MCP server runs locally). `PORT` is set by Render.
- How I checked: `SESSION_SECRET= npm start` stops with "missing SESSION_SECRET: see .env.example"; .dockerignore excludes .env, so no value is in the image; Render's Environment page lists exactly the six variables above.

## 3. What happens when things fail
- Database down: /health answers 503 `{"status":"error","db":"down"}`; sign-in shows "Something went wrong. Try again."; ECONNREFUSED appears only in the server log. How I checked: ran the container with a wrong DATABASE_URL.
- Bad input: broken JSON gives 400 "The request body is not valid JSON."; no session gives 401. No 500, no stack trace. How I checked: curl against the live site.
- Bad deploy: a commit with a failing test turned CI red and Render did not deploy it (After CI Checks Pass). A bad but passing change was rolled back in Render in about 10-11 seconds; the rollback had switched Auto-Deploy off and I switched it back. How I checked: commits 1f1e9f7 and 871a62d, Render's Deploys list, a stopwatch.
- Restart: data survives a redeploy. How I checked: signed up, Manual Deploy, the registration was still there.

## 4. Four states of one screen
- Upcoming events (/events): loading "Loading events…" (under a second on Slow 4G), content (the list), error (offline: "Failed to fetch" under the event, nothing changes), empty "There are no upcoming events yet." only when no event is in the future.
- How I checked: Chrome DevTools, Network, Slow 4G and Offline on the live site. The empty state I did not see live, because the database has upcoming events.

## 5. Request waterfall
- /events, cache disabled, Slow 4G: 5 requests, 4.2 kB transferred, Finish 2.39 s, DOMContentLoaded 1.22 s.
- Three rounds one after another: the page, then style.css and events.js in parallel, then /api/me and /api/events in parallel. The list needs three round trips.
- How I checked: DevTools Network on the live site.

## 6. Security basics checked
- Another account cannot cancel my registration: as member@club.test (id 2), DELETE /api/events/1/registrations/3 was refused with "You can only cancel your own registration."; my registration stayed. How I checked: curl with a second session.
- GitHub sign-in uses state and PKCE (S256); a wrong state is refused with 400; only a verified primary email links to an existing account. How I checked: the tests in test/auth.github.test.js and a real sign-in on the live site.
- Passwords are stored as salted scrypt hashes; the seed passwords on Neon are random, not the public test passwords. How I checked: src/lib/passwords.js and src/db/setup.js, which refuses a non-local database without SEED_* passwords.
- No secret is committed. How I checked: git history search; checks/ex2.mjs "no secret is committed".

## 7. Known gaps, ranked by risk
1. Cold start: the free Render instance sleeps and the first request can take 50 s or more; Neon also sleeps, so the first /health after a pause answered 503 "db: down" because waking took longer than the 2-second limit. With 100 students arriving at once, the first ones would see errors.
2. No rate limit on /api/login, so passwords can be guessed without any slowdown.
3. The Event details screen from SPEC.md is not built; sign-in, Upcoming events and New event are.
4. The server does not handle SIGTERM: in Docker, Ctrl+C did not stop it, so on every deploy Render kills it after a timeout instead of closing database connections cleanly.
5. The error text when the database is down is generic: "Something went wrong. Try again." does not tell the user the service is temporarily unavailable.
6. The seed events are dated relative to the seeding day, so they turn into past events; "Build an MCP server" had already started when I tested sign-up.
7. Coverage outside the services is uneven: routes/auth.js 78% lines, routes/suggestions.js 67%, db/migrate.js 69%, data/health.js 50%, auth/github.js 65% branches.
8. Housekeeping: src/db/schema.sql is no longer used; the startup log says "In a codespace, open the forwarded port" in production too.
9. The Neon password appeared in screenshots during setup; it was reset each time.
10. The model provider is not reliable on the free tier: on the live site Gemini answered 404 for gemini-2.5-flash (retired name from the template), 400 for thinkingConfig and 503 for gemini-3.5-flash-lite and gemini-3.8-flash. The app fell back every time; until the reason was logged, nobody could tell why.

## 8. Model feature
- What leaves the app: only the announcement text an organizer pastes on /organizer/events/new and today's date are sent to Google's Gemini API; no user names, emails or registrations.
- The model is named only in src/model/gemini.js; MODEL_NAME is gemini-3.8-flash in Render, GEMINI_API_KEY is set there.
- When it fails: 5-second timeout; on a timeout, 429, 4xx/5xx, network error or invalid JSON the organizer sees "Suggestions are unavailable, fill in the form yourself" and can still create the event. The reason is logged as "model suggestion fell back: …", never the key or the text. Model answers are re-checked: past dates, places outside 1-500 and titles over 120 characters are dropped.
- Price of one call: gemini-3.8-flash at the introductory API list price of $0.75 per 1M input tokens and $3.75 per 1M output tokens (through Dec 31, 2026). About 500 input and 200 output tokens per suggestion is about $0.0011 per call, about $1.10 per 1,000 calls. On the free tier it costs nothing but is rate-limited.
- How I checked: test/suggestions.service.test.js and test/gemini.client.test.js with a fake client (services at 100%); on the live site I saw "Asking the model…" and the fallback, and the reason in Render's log.

## 9. MCP
- mcp-server/server.js offers list_upcoming_events, register_for_event and cancel_registration, each through the same services as the HTTP API; it signs in with MCP_EMAIL and MCP_PASSWORD and may do only what that user may do.
- It runs locally (`npm run --silent mcp`), not on Render.
- How I checked: the mcp job in CI runs mcp-server/check.mjs (12/12); test/mcp.tools.test.js with fake services.