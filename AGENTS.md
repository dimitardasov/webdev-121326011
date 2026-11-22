# Instructions for the agent

Read this file at the start of every session. Keep it short and correct; update it when the project changes.

## Project
Club Events for the Informatics Club: members sign in, see upcoming events and sign up for those with free places; organizers create events and see who signed up.
See `SPEC.md` for goals, non-goals and acceptance criteria. Build only what a criterion asks for, and nothing listed under Non-goals.

## Commands
<!-- How to install, run, test. Keep these exact and working. -->
- Install: `npm install && cp -n .env.example .env`
- Run: `npm run db:start && npm run db:setup && npm start`, then open the forwarded port 3000
- Test: `npm test`
- Coverage: `node --test --experimental-test-coverage --test-coverage-include='src/**' --test-coverage-exclude='test/**'`
- MCP server: `npm run --silent mcp`
- Seeded accounts (local only): `member@club.test` / `member-pass`, `organizer@club.test` / `organizer-pass`

## Conventions
<!-- Folder layout, naming, where business rules live, how errors are returned to the client. -->
- CommonJS (`require`), Node 22, no build step.
- `src/routes/` HTTP route handlers, `src/services/` rules, `src/data/` SQL, `src/db/` pool, schema and seed, `src/lib/` helpers with no rules (password hashing).
- `views/` holds the HTML pages, served by a route so that a page can require sign-in; `public/` holds only CSS and browser JavaScript.
- A service is created by a factory that receives its data modules (`createEventService({ events })`), so tests pass fakes and never need a database.
- A service refuses an action by throwing `ServiceError(status, message)`; the error handler in `src/app.js` turns it into `{ "error": message }` with that status. Any other error becomes 500 with a generic message, and the details go only to the server log.
- SQL always uses parameters (`$1`), never string concatenation.
- Database columns are `snake_case`; JavaScript objects returned by the data layer are `camelCase`.
- Tests live in `test/` and are named `*.test.js`; a test that proves a criterion names its `AC-n` id in its title.

## Layers
<!-- Fill in the file or folder for each layer. -->
- HTTP route handlers: `src/routes/`
- Services: `src/services/`
- Data access: `src/data/`
- Database: PostgreSQL, schema in `src/db/schema.sql`

Requests arrive two ways and both end in the same place:

- HTTP route handler → service → data access → database
- MCP tool → **the same service** → data access → database

A route handler reads the request and turns a result into a status code. A service holds the
rules and knows nothing about HTTP or about MCP. Only the data layer writes SQL. An MCP tool
that talks to the database directly is a second, unguarded way into your data: never add one.

## The model feature
<!-- Provider, env var, and the call site. -->
- The provider is named in exactly one file: `src/model/gemini.js` (not built yet; see "The model feature" in `SPEC.md`).
- The key comes from an environment variable and is never committed or logged.
- Every call has a timeout and a deterministic fallback, so the app still works when the provider is down or rate-limited.
- The model's output is re-checked against real data before anything is saved or shown.
- Tests never call the provider: they pass in a fake client.

## The MCP server
<!-- Where it lives and how it authenticates. -->
- Lives in `mcp-server/`, grew out of Exercise 1. It still serves the Exercise 1 lecture tools until the project tools in `SPEC.md` are built.
- Every tool calls a service function; none touches the data layer or the database directly.
- It carries a user, and enforces exactly the same authorization rules as the HTTP API.
- Adding a tool means adding a row to the table in `SPEC.md` too.

## Tests and coverage
- Every acceptance criterion in `SPEC.md` has an id like `AC-3`, and a test whose title contains that id.
- The coverage gate runs in CI: 100% of the service layer, 80% overall.
- A test is evidence. Changing a test so the code passes destroys the evidence.

## Always ask before
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`
- changing an authentication or authorization rule
- adding, renaming or removing an MCP tool
- changing a coverage threshold
- sending user data to a third-party model
- changing the rule that refuses a sign-up for a full event, or the unique key on `registrations`
- deleting rows from the database, dropping a table or resetting the database
- writing a new migration or running one against any database other than the local one

## Never
- commit secrets, passwords, API keys or an OAuth client secret
- weaken or delete a test to make it pass
- lower a coverage threshold or switch off a CI job to make the build green
- add an MCP tool that reaches past the service layer
- log a prompt that contains somebody's personal data
