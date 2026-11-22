async function withEventTransaction(eventId, operation) {
  const pool = require('../db/pool');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, starts_at, capacity
         FROM events
        WHERE id = $1
        FOR UPDATE`,
      [eventId],
    );
    const row = rows[0];
    const event = row
      ? { id: row.id, startsAt: row.starts_at, capacity: row.capacity }
      : null;

    const transaction = {
      event,
      async countRegistrations() {
        const result = await client.query(
          'SELECT count(*)::int AS count FROM registrations WHERE event_id = $1',
          [eventId],
        );
        return result.rows[0].count;
      },
      async hasRegistration(userId) {
        const result = await client.query(
          'SELECT 1 FROM registrations WHERE user_id = $1 AND event_id = $2',
          [userId, eventId],
        );
        return result.rowCount > 0;
      },
      async insertRegistration(userId) {
        const result = await client.query(
          `INSERT INTO registrations (user_id, event_id)
           VALUES ($1, $2)
           RETURNING created_at`,
          [userId, eventId],
        );
        return { createdAt: result.rows[0].created_at };
      },
      async deleteRegistration(userId) {
        const result = await client.query(
          'DELETE FROM registrations WHERE user_id = $1 AND event_id = $2',
          [userId, eventId],
        );
        return result.rowCount > 0;
      },
    };

    const result = await operation(transaction);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { withEventTransaction };
