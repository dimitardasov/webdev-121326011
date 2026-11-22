const test = require('node:test');
const assert = require('node:assert/strict');
const { runMigrations } = require('../src/db/migrate');

function fakeClient(appliedNames = []) {
  const calls = [];
  return {
    calls,
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql === 'SELECT name FROM schema_migrations') {
        return { rows: appliedNames.map((name) => ({ name })) };
      }
      return { rows: [] };
    },
  };
}

test('migration runner applies migrations in numeric order and records history', async () => {
  const client = fakeClient();

  await runMigrations(client);

  const migrations = client.calls
    .map((call) => call.sql)
    .filter((sql) => sql.includes('CREATE TABLE IF NOT EXISTS users') || sql.includes('CREATE TABLE IF NOT EXISTS registrations'));

  assert.equal(migrations.length, 2);
  assert.match(migrations[0], /CREATE TABLE IF NOT EXISTS users/);
  assert.match(migrations[1], /CREATE TABLE IF NOT EXISTS registrations/);
  assert.match(migrations[1], /PRIMARY KEY \(user_id, event_id\)/);

  const historyCalls = client.calls.filter((call) => call.sql.includes('INSERT INTO schema_migrations'));
  assert.deepEqual(historyCalls.map((call) => call.parameters[0]), [
    '001_initial_schema.sql',
    '002_registrations.sql',
  ]);
  assert.ok(client.calls.some((call) => call.sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')));
});

test('migration runner skips migrations already in the history table', async () => {
  const client = fakeClient(['001_initial_schema.sql']);

  await runMigrations(client);

  assert.equal(
    client.calls.some((call) => call.sql.includes('CREATE TABLE IF NOT EXISTS users')),
    false,
  );
  assert.equal(
    client.calls.some((call) => call.sql.includes('CREATE TABLE IF NOT EXISTS registrations')),
    true,
  );
  const historyCalls = client.calls.filter((call) => call.sql.includes('INSERT INTO schema_migrations'));
  assert.deepEqual(historyCalls.map((call) => call.parameters[0]), ['002_registrations.sql']);
});
