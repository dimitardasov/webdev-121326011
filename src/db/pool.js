const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Run: cp -n .env.example .env');
}

// One pool for the whole process. Only the data layer and the setup script use it.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
