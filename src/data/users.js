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

async function findIdentity(provider, providerUserId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.password_hash
       FROM user_identities i
       JOIN users u ON u.id = i.user_id
      WHERE i.provider = $1 AND i.provider_user_id = $2`,
    [provider, providerUserId],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

async function linkIdentity(provider, providerUserId, userId) {
  await pool.query(
    `INSERT INTO user_identities (provider, provider_user_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, provider_user_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [provider, providerUserId, userId],
  );
}

async function createProviderUser({ email, name }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1, $2, NULL, 'member')
     RETURNING id, email, name, role, password_hash`,
    [email, name],
  );
  return toUser(rows[0]);
}

module.exports = {
  findByEmail,
  findById,
  findIdentity,
  linkIdentity,
  createProviderUser,
};
