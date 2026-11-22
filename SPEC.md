# Club Events · Informatics Club

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
Club events: a student club publishes events with a limited number of places, members sign up and cancel, organizers create and edit events.

## Goals
- A member signs in, sees upcoming events with their free places, signs up for one that has a free place and can cancel later.
- An organizer creates and edits events with a limit on places and sees who signed up for each of them.
- When an event is full, nobody else can sign up for it, whether they use the web UI, the API or the MCP server.

## Non-goals
- No payments: every event is free.
- No email or push notifications: members check the site themselves.
- No waiting list: when an event is full, a member cannot queue for a place.
- No recurring events: every event is created on its own.
- No more than one club: the app serves the Informatics Club only.
- No mobile app: one web UI that also works on a phone screen.

## Constraints
- Node 22 with Express 5 for the API, PostgreSQL 16 for the data, plain HTML, CSS and JavaScript for the UI.
- Passwords are stored only as a salted scrypt hash, never as readable text.
- Secrets (database password in production, session secret, GitHub client secret, model key) come from environment variables and are never committed.
- Every rule lives in the service layer, so the HTTP API and the MCP server enforce exactly the same rules.
- Everything runs in a GitHub Codespace on the free 2-core machine; the database runs in Docker inside it.

## The model feature
<!-- Which model, which modality, and what it does for a user.
     Name three things or the check fails: the input it receives, the output it produces,
     and what happens when the model is slow, rate-limited or wrong. -->
- Model: Google Gemini through the Gemini API (`gemini-2.5-flash`, text in and text out), key in `GEMINI_API_KEY`, model name in `MODEL_NAME`.
- Input: the free text of an announcement an organizer pastes on the "New event" screen (for example a chat message about a workshop), plus today's date.
- Output: a suggestion that pre-fills the "New event" form with a title, a start date and time, a number of places and a short description. The organizer reviews and edits it; nothing is saved until the organizer presses "Create event".
- When it fails: every call has a 5-second timeout. On a timeout, a rate limit (HTTP 429), a network error or a reply that is not valid JSON, the organizer sees the empty form with the message "Suggestions are unavailable, fill in the form yourself" and can still create the event by hand. The reply is re-checked before it is shown: a date in the past, a number of places that is not a whole number from 1 to 500, or a title longer than 120 characters is dropped and that field is left empty.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: email and password. A visitor creates an account on the sign-up screen; the password is stored as a salted scrypt hash. Signing in starts a server-side session in an httpOnly, SameSite=Lax cookie, and the session id is regenerated on every sign-in.
- Provider: GitHub OAuth (authorization code flow). The app sends a random `state` with the request and refuses the callback if it does not match. The client id and secret come from Codespaces secrets.
- Linking: an external login is stored in `user_identities` by provider and provider user id, never by email alone. On the first GitHub sign-in the app reads the person's primary email from GitHub and uses it only if GitHub reports it as verified: if a user with that email already exists, the GitHub identity is linked to that same user; otherwise a new user without a password is created. An unverified email is never linked. A person who uses both ways therefore stays one row in `users`.

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| --- | --- | --- |
| list_upcoming_events | Lists the events that start in the future, each with its id, title, start date and number of free places. | Any signed-in user |
| get_event | Returns one event by id with its title, date, description and free places; the list of signed-up members is included only for an organizer. | Any signed-in user |
| register_for_event | Signs the calling member up for an event by id, and refuses with "This event is full" when no places are left. | A member, for themselves only |
| cancel_registration | Cancels the calling member's own registration for an event by id, which frees one place. | A member, for their own registration only |
| list_event_registrations | Lists the members signed up for one event by id, with their names and the time they signed up. | An organizer |

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
- Stack: plain HTML, CSS and JavaScript pages served by Express; the pages call the JSON API with `fetch`.
- Screens: Sign in and sign up (`/login`), Upcoming events (`/events`), Event details with sign up and cancel (`/events/:id`), New event for organizers (`/organizer/events/new`).
- Every screen handles four states: loading, empty, error (with a way to retry) and success.

## Architecture
One request: a signed-in member presses "Sign up" on /events.
- Browser: views/events.html shows the list; public/events.js, function changeRegistration(event, row, button), sends POST /api/events/:id/registrations with fetch. On success it calls registrationUpdate(event, response) to get the new free places and the button label, and updates the row without reloading. On an error it shows the server's message, for example "This event is full", next to the event.
- Route: src/routes/events.js, router.post('/api/events/:id/registrations'), reads the session user through auth.currentUser and calls registrations.register(user, req.params.id). It answers 201 with "You are signed up"; any ServiceError goes to next(error), and the error handler in src/app.js turns it into its status code and { error }.
- Service: src/services/registrations.js, register(user, eventId), holds every rule: 401 without a user, then inside registrations.withEventTransaction 404 for a missing event, 409 "This event has already started", 409 "You are already signed up" and 409 "This event is full", and only then insertRegistration.
- Data: src/data/registrations.js, withEventTransaction, opens a transaction, locks the event row with SELECT ... FOR UPDATE so two requests cannot both take the last place, and runs COUNT, SELECT and INSERT INTO registrations with parameters ($1, $2). It commits on success and rolls back on any error. Only this layer writes SQL.
- Database: PostgreSQL table registrations, primary key (user_id, event_id), created by migrations/002_registrations.sql and applied by src/db/migrate.js.
- Mismatch: the browser recomputes free places itself in registrationUpdate (public/events.js) instead of reading them from the service, so one rule, "capacity minus registrations", lives in two layers. I left it because the API answers only 201 or 204 and the screen should update without a reload; the next load of /events takes the real number from src/services/events.js, so the server stays the source of truth.

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] A signed-in member who opens `/events` sees only events whose start time is in the future, ordered from the soonest to the latest.
- - [AC-2] Each event in the list shows its title, its start date and its number of free places, which equals its capacity minus its rows in `registrations`; an event with no free places shows "Full" instead of "0".
- [AC-3] A member who signs up for an event with free places sees "You are signed up", and exactly one new row for that member and event appears in `registrations`.
- [AC-4] A member who signs up for an event with no free places sees "This event is full", and no new row appears in `registrations`.
- [AC-5] A member who signs up twice for the same event sees "You are already signed up", and `registrations` still holds one row for that member and event.
- [AC-6] A member who cancels their registration sees the event's free places go up by one, and their row is gone from `registrations`.
- [AC-7] An organizer who creates an event with a title, a future date and 20 places sees it on `/events` with 20 free places; a member who sends the same request to `POST /api/events` gets 403 and no row is added to `events`.
- [AC-8] An organizer who opens an event sees the list of members signed up for it; a member who opens the same event does not see that list, and `GET /api/events/:id/registrations` answers them with 403.
- [AC-9] A person who signs in with GitHub using a verified email that already belongs to a password account lands in that same account: `users` still has one row with that email, and `user_identities` gains one row that points to it.
- [AC-10] When the model does not answer within 5 seconds or answers with 429, the organizer sees the empty "New event" form with "Suggestions are unavailable, fill in the form yourself", and can still create the event.
- [AC-11] Signing in with a wrong password, or with an email that has no account, shows the same message "Wrong email or password", so the screen does not reveal which emails have accounts.

### Slice 1: sign-in and the upcoming events list
- [AC-12] A visitor who opens `/events` without signing in lands on `/login` instead, and `GET /api/events` answers them with 401.
- [AC-13] After signing in with the seeded member account, `/events` shows the three seeded upcoming events, each with its title, date and number of free places, and does not show the seeded past event.
- [AC-14] Deleting one event row in the database and reloading `/events` removes that event from the screen.
- [AC-15] After pressing "Sign out", reloading `/events` lands on `/login` again.
### Slice 2: signing up for an event and cancelling
- [AC-16] A signed-in member who sends `POST /api/events/:id/registrations` for an upcoming event with free places gets 201, sees "You are signed up", and exactly one row for that member and event appears in `registrations`.
- [AC-17] A member who signs up for an event with no free places gets 409 with "This event is full", and no row is added to `registrations`.
- [AC-18] A member who signs up for an event they are already signed up for gets 409 with "You are already signed up", and `registrations` still holds one row for them.
- [AC-19] A visitor who sends `POST /api/events/:id/registrations` without signing in gets 401, and no row is added to `registrations`.
- [AC-20] A member who signs up for an event id that does not exist gets 404, and for an event that has already started gets 409 with "This event has already started".
- [AC-21] A member who sends `DELETE /api/events/:id/registrations/:userId` with their own user id gets 204, their row is gone, and the event's free places go up by one.
- [AC-22] A member who sends `DELETE /api/events/:id/registrations/:userId` with another member's user id gets 403, and that member's row stays in `registrations`.
- [AC-23] On `/events`, a member presses "Sign up" on an event with free places and sees the button change to "Cancel" and the free places go down by one without reloading the page.
## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 | `test/events.service.test.js` — “AC-1 only events after "now" are asked for” |
| AC-2 | `test/events.service.test.js` — “AC-2 free places are capacity minus registrations, never below zero” |
| AC-3 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-16 AC-3…” |
| AC-4 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-17 AC-4…” |
| AC-5 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-18 AC-5…” |
| AC-6 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-21 AC-6…” |
| AC-7 | `test/events.service.test.js` and `test/events.api.test.js` — “AC-7…” |
| AC-8 | `test/registrations.service.test.js` and `test/events.api.test.js` — “AC-8…” |
| AC-9 | `test/auth.service.test.js` — “AC-9…” |
| AC-10 | `test/suggestions.service.test.js` — “AC-10…” |
| AC-11 | `test/auth.service.test.js` — “AC-11…” |
| AC-12 | `test/events.service.test.js` — “AC-12…” |
| AC-13 | `test/events.api.test.js` — “AC-13…” |
| AC-14 | `test/events.api.test.js` — “AC-14…” |
| AC-15 | `test/events.api.test.js` — “AC-15…” |
| AC-16 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-16 AC-3…” |
| AC-17 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-17 AC-4…” |
| AC-18 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-18 AC-5…” |
| AC-19 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-19…” |
| AC-20 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-20…” |
| AC-21 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-21 AC-6…” |
| AC-22 | `test/registrations.service.test.js` and `test/registrations.api.test.js` — “AC-22…” |
| AC-23 | `test/events.ui.test.js` — “AC-23…” |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
- Passed: AC-12 (`/events` without a session redirects to `/login`; `curl -i` shows 302 with `Location: /login` and no events), AC-13 (the seeded member sees the three upcoming events with title, date and places, and not the past "Welcome meetup"), AC-14 (deleting "Intro to Git" in the database removed it from the screen after a reload), AC-15 (after "Sign out", `/events` lands on `/login`).
- Reinterpreted: AC-13 asks for "the number of free places", but the full event shows "Full" instead of 0. That is better for a member, but no criterion said so.
- Not repeatable: after the AC-14 check the seed cannot be restored with `npm run db:setup`, because it skips seeding when users exist; the database has to be recreated.
- Changed in this spec: AC-2 now says that an event with no free places shows "Full" instead of "0".
