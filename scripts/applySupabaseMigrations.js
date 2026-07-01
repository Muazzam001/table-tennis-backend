// Apply Supabase/PostgreSQL migrations from supabase/migrations/
// Usage: npm run db:migrate

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { createPgClient, resolvePostgresUrl } from '../utils/pgConnection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries.filter((f) => f.endsWith('.sql')).sort();
}

async function main() {
  const databaseUrl = resolvePostgresUrl();
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL or SUPABASE_DB_PASSWORD');
    console.error('Get the connection string from Supabase Dashboard → Project Settings → Database');
    process.exit(1);
  }

  const client = createPgClient(databaseUrl);

  await client.connect();
  console.log('Connected to PostgreSQL');

  await client.query(`
    CREATE TABLE IF NOT EXISTS supabase_migration_log (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = await listMigrationFiles();
  for (const file of files) {
    const [applied] = (
      await client.query('SELECT 1 FROM supabase_migration_log WHERE filename = $1', [file])
    ).rows;

    if (applied) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`  apply ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO supabase_migration_log (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  await client.end();
  console.log('\n✓ Migrations complete');
}

main().catch((error) => {
  console.error('\n❌ Migration failed:', error.message);
  process.exit(1);
});
