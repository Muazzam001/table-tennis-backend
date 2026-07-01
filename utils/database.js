import 'dotenv/config';
import { createPgPool, getPgConnectionErrorMessage } from './pgAdapter.js';
import { resolvePostgresUrl } from './pgConnection.js';

const databaseUrl = resolvePostgresUrl();

if (!databaseUrl) {
  console.error('Missing DATABASE_URL or SUPABASE_DB_PASSWORD.');
  console.error('Get credentials from Supabase Dashboard → Project Settings → Database.');
  if (process.env.VERCEL !== '1') {
    process.exit(1);
  }
}

const pool = databaseUrl ? createPgPool(databaseUrl) : null;

if (pool) {
  pool
    .execute('SELECT 1 AS ok')
    .then(() => {
      const hostLabel = databaseUrl.replace(/:[^:@/]+@/, ':***@');
      console.log('✓ Database connected successfully (PostgreSQL / Supabase)');
      console.log(`  URL: ${hostLabel}`);
    })
    .catch((err) => {
      console.error('\n❌ Database connection failed');
      console.error(`  ${getPgConnectionErrorMessage(err)}`);
      console.error(`\n  Technical details:`);
      console.error(`    Error code: ${err.code || 'N/A'}`);
      console.error(`    Error message: ${err.message || 'N/A'}`);
      console.error('\n  If using direct db.*.supabase.co on IPv4, set SUPABASE_POOLER_HOST in .env');
    });
}

function requirePool() {
  if (!pool) {
    throw new Error('Database not configured. Set DATABASE_URL_POOLER or SUPABASE_DB_PASSWORD on Vercel.');
  }
  return pool;
}

export default new Proxy(
  {},
  {
    get(_target, prop) {
      const value = requirePool()[prop];
      return typeof value === 'function' ? value.bind(requirePool()) : value;
    },
  }
);
