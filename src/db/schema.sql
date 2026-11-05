-- Club Events schema. Safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  -- NULL for a person who has only ever signed in with GitHub.
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'organizer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per external login. Keyed by the provider's own id, never by email,
-- so a changed email at the provider cannot move a login to another account.
CREATE TABLE IF NOT EXISTS user_identities (
  provider         TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS clubs (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  club_id     INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at   TIMESTAMPTZ NOT NULL,
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  created_by  INTEGER NOT NULL REFERENCES users(id)
);

-- The many-to-many link between users and events.
CREATE TABLE IF NOT EXISTS registrations (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS events_starts_at ON events (starts_at);
