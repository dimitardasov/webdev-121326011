const HEALTH_TIMEOUT_MS = 2000;

async function checkDatabase() {
  const pool = require('../db/pool');
  await pool.query({ text: 'SELECT 1', query_timeout: HEALTH_TIMEOUT_MS });
}

module.exports = { checkDatabase, HEALTH_TIMEOUT_MS };
