// Creates the tables and, on an empty database, the seed data that slice 1 is checked against.
//   npm run db:setup
const pool = require('./pool');
const { runMigrations } = require('./migrate');
const { hashPassword } = require('../lib/passwords');

async function main() {
  await runMigrations(pool);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) {
    console.log('Tables are ready. Seed skipped: the database already has users.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertUser = 'INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id';
    const organizer = (await client.query(insertUser, ['organizer@club.test', 'Olga Organizer', hashPassword('organizer-pass'), 'organizer'])).rows[0].id;
    const member = (await client.query(insertUser, ['member@club.test', 'Mihail Member', hashPassword('member-pass'), 'member'])).rows[0].id;
    const club = (await client.query("INSERT INTO clubs (name) VALUES ('Informatics Club') RETURNING id")).rows[0].id;

    const insertEvent = `INSERT INTO events (club_id, title, description, starts_at, capacity, created_by)
      VALUES ($1, $2, $3, now() + $4::interval, $5, $6) RETURNING id`;
    await client.query(insertEvent, [club, 'Intro to Git', 'Branches, commits and pull requests.', '7 days', 20, organizer]);
    await client.query(insertEvent, [club, 'Build an MCP server', 'Exercise 1, together.', '14 days', 15, organizer]);
    const full = (await client.query(insertEvent, [club, 'Board games night', 'Only one table.', '21 days', 1, organizer])).rows[0].id;
    // A past event: slice 1 must not show it.
    await client.query(insertEvent, [club, 'Welcome meetup', 'The first meeting of the year.', '-10 days', 30, organizer]);

    // The member takes the only place at board games night, so it shows 0 free places.
    await client.query('INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)', [member, full]);
    await client.query('COMMIT');
    console.log('Tables are ready and seeded: 2 users, 1 club, 3 upcoming events, 1 past event.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
