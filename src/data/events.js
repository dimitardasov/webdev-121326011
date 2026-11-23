const pool = require('../db/pool');

// Events that start after `since`, soonest first, each with how many people signed up.
async function listStartingAfter(since, userId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.starts_at, e.capacity, count(r.user_id)::int AS registered,
            COALESCE(bool_or(r.user_id = $2), false) AS is_registered
       FROM events e
       LEFT JOIN registrations r ON r.event_id = e.id
      WHERE e.starts_at > $1
      GROUP BY e.id
      ORDER BY e.starts_at`,
    [since, userId],
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    capacity: row.capacity,
    registered: row.registered,
    isRegistered: row.is_registered,
  }));
}

async function createEvent({ title, description, startsAt, capacity, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO events (club_id, title, description, starts_at, capacity, created_by)
     SELECT id, $1, $2, $3, $4, $5
       FROM clubs
      WHERE name = 'Informatics Club'
     RETURNING id, title, description, starts_at, capacity, created_by`,
    [title, description, startsAt, capacity, createdBy],
  );
  const row = rows[0];
  if (!row) throw new Error('Informatics Club not found.');
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    capacity: row.capacity,
    createdBy: row.created_by,
  };
}

module.exports = { listStartingAfter, createEvent };
