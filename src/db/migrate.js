const fs = require('node:fs');
const path = require('node:path');

async function runMigrations(client, migrationsDir = path.join(__dirname, '..', '..', 'migrations')) {
  await client.query('BEGIN');
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    );

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));
    const migrations = fs
      .readdirSync(migrationsDir)
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort((a, b) => a.localeCompare(b));

    for (const name of migrations) {
      if (applied.has(name)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [name],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const pool = require('./pool');
  try {
    await runMigrations(pool);
    console.log('Migrations are ready.');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { runMigrations };
