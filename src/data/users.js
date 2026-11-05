const pool = require('../db/pool');

const COLUMNS = 'id, email, name, role, password_hash';

function toUser(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role, passwordHash: row.password_hash };
}

async function findByEmail(email) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email]);
  return rows[0] ? toUser(rows[0]) : null;
}

async function findById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

module.exports = { findByEmail, findById };
