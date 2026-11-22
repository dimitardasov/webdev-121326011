# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

## 2026-10-27 · Connect Gemini CLI to my MCP server
- Goal: Check that Gemini CLI starts my server and calls find_lecture without being told the tool name.
- Delegated: Answering "What does lecture 7 cover?" using my MCP tools.
- Checkpoints: /mcp showed my-project as Ready with find_lecture and search_topic; Gemini asked permission and called find_lecture(number: 7); the answer matched lectures.json.
- Went wrong: Gemini first skipped project settings because the folder was untrusted; I had to trust the folder and log in with an API key.
- Changed by hand: Nothing in the code.

## 2026-10-27 · Description experiment
- Goal: See whether a vague tool description changes which tool Gemini picks.
- Delegated: The same question, "What does lecture 7 cover?", with find_lecture described only as "Does lecture stuff.".
- Checkpoints: Gemini still called find_lecture(number: 7) and gave the same answer.
- Went wrong: Nothing failed; the vague description also broke the self-check's 20-character rule, so I restored it.
- Changed by hand: I edited the description in server.js before the session and restored the original after it; self-check back to 12/12.

## 2026-11-05 · Exercise 2: spec and slice 1 with Claude
- Goal: SPEC.md, AGENTS.md and slice 1 (sign-in and the upcoming events list) for Club Events.
- Delegated: I chose the project (club events), the stack (Node, Express, PostgreSQL) and GitHub sign-in; Claude (claude.ai chat) drafted SPEC.md, AGENTS.md and .env.example and wrote the slice in src/, views/, public/ and test/.
- Checkpoints: I ran the slice in the codespace myself; AC-12 (redirect to /login, curl shows 302), AC-13 (three seeded events, no past one), AC-14 (deleted row disappears), AC-15 (sign out) all passed; checks/ex2.mjs 31/31.
- Went wrong: the full event shows "Full" instead of a number, which no criterion asked for.
- Changed by hand: AC-2 now says a full event shows "Full"; wrote the Spec vs result note.


## 2026-11-05 · Step 6 with Gemini CLI: does the agent read AGENTS.md
- Goal: ask Gemini what the "Always ask before" list says.
- Delegated: one question, nothing else.
- Checkpoints: the footer showed "1 AGENTS.md file · 1 MCP server", so the file was loaded.
- Went wrong: no answer; /stats shows 8 requests to gemini-3.8-flash with 0 tokens (quota). Switching to gemma-4-31b-it also hung.
- Changed by hand: nothing; repeated the check with Copilot.

## 2026-11-05 · Step 6 with GitHub Copilot: does the agent read AGENTS.md
- Goal: the same question, in Copilot Chat Agent mode.
- Delegated: one question, nothing else.
- Checkpoints: Copilot listed all nine lines, from "deleting files or folders" to "sending user data to a third-party model", matching the file.
- Went wrong: nothing.
- Changed by hand: nothing.
## 2026-11-22 · Exercise 3: signing up for an event and cancelling (Slice 2)
- Agent: GitHub Copilot, Agent mode, Manual permissions.
- Goal: AC-16 to AC-23 in SPEC.md, through every layer: migration, service, API, authorization, UI, then the MCP tools and the model feature.
- Autonomy: Copilot may read any file and write files only inside the one step I give it. It stops after each step and does not start the next one.
- Must stop and ask me: before every terminal command, before installing or removing a package, before changing an existing migration or a test that already passes, before touching .env, AGENTS.md or SPEC.md, and before any git command.
- Checkpoints: I read the plan before any code; after each step I run npm test, read git diff --staged and commit only if fail is 0; after the migration I apply it to an empty database; after the authorization step I check 401 and 403 with curl.

### Plan (reviewed before any code)
1. Migrations: migrations/001_initial_schema.sql (existing tables, CREATE TABLE IF NOT EXISTS), migrations/002_registrations.sql (registrations, primary key (user_id, event_id)), src/db/migrate.js (ordered runner with a history table), npm script db:migrate, src/db/setup.js runs migrations before the seed. Tests: runner order, history table, skipping an applied migration, with a fake client.
2. Service: src/data/registrations.js (transactional SQL), src/services/registrations.js with register(user, eventId) and cancel(user, eventId, userId); 401 without a user, 404 missing event, 409 full / started / already signed up, 403 cancelling someone else. Free-place check and insert in one transaction. Tests AC-16 to AC-22 with a fake data layer and a fixed clock.
3. Routes: createApp accepts its services; POST /api/events/:id/registrations and DELETE /api/events/:id/registrations/:userId; routes only map results and ServiceError to status codes. API tests AC-16 to AC-22 start the app on a random port with in-memory fakes and the built-in fetch.
4. UI: isRegistered in src/data/events.js and src/services/events.js; Sign up / Cancel in views/events.html and public/events.js through a small pure function. Tests AC-23 on that function.
- Changed during review: (1) the first plan's API tests needed a real PostgreSQL, which CI does not have, so createApp now takes its services and the tests use in-memory fakes; (2) the migration test no longer needs a database; (3) migrations use IF NOT EXISTS so they also apply to my existing local database; (4) AC-23 is tested through a pure function, because a browser test would need a new package; (5) the extra change to the events list is limited to an isRegistered field.
### Checkpoint: status codes by hand (step 7)
- member signs up for an event with free places: 201; organizer signs up for a full event: 409 "This event is full"; no cookie: 401.
- organizer cancels the member's registration: 403; no cookie: 401; member cancels their own: 204.
- Found: the seeded "Build an MCP server" was dated 14 days after the seed, so by now it had already started and sign-up gave 409 "This event has already started". The code was right; the seed data aged. I moved the event forward in my local database with an UPDATE.

## Какво направи агентът без моя поръчка
- Created src/mcp-services.js outside mcp-server/ and test/, although its plan said it would touch no other folder. Kept: it builds the services in one place, so the MCP server never requires src/data or src/db.
- Changed test/events.service.test.js, a test that already passed, without asking: it added an isRegistered check and removed no assertion. Kept.
- Changed the npm script db:setup in package.json so it no longer runs db:migrate first, because setup.js now runs the migrations itself. Kept.
- Tried to create a file named test-placeholder in the repository root, which no step asked for. I answered Skip; it does not exist.
- Changed src/services/registrations.js again in the last step to add listForOrganizer for AC-8. Kept, it was in the plan.
- Left src/db/schema.sql in place although nothing uses it any more; the migrations replaced it. Kept for now, to remove in Exercise 4.
- The architecture note in SPEC.md was drafted by Claude from my code after the push; I checked every file name in it against the code.
## 2026-11-22 · Exercise 4: secrets and environment
- Agent: GitHub Copilot, Agent mode, Manual permissions.
- Step 1: Copilot listed every variable the code reads (DATABASE_URL, SESSION_SECRET, PORT, GEMINI_API_KEY, MODEL_NAME, MCP_EMAIL, MCP_PASSWORD) and added the startup check in src/server.js. I checked it: SESSION_SECRET= npm start stops with "missing SESSION_SECRET: see .env.example". I rewrote .env.example myself and removed MCP_TOKEN, which nothing reads.
- Found: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are read nowhere: GitHub sign-in is not built yet.
- Step 2, the agent's claim: "no literal credentials found".
- Step 2, my own search: git log -p | grep found the seed passwords member-pass and organizer-pass (src/db/setup.js, AGENTS.md, tests) and postgres:postgres for the local Docker database in .env.example, which the agent's report did not mention. None of them is a key for an outside service, so nothing had to be rotated; the seed accounts must never exist with these passwords in the production database.