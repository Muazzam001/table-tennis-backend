import pg from 'pg';
import { isServerless } from './runtime.js';

const DEFAULT_PROJECT_REF = 'zhbyslleexcktjpcdjxq';
const DEFAULT_POOLER_HOST = 'aws-1-ap-northeast-1.pooler.supabase.com';

/**
 * Build pooler URL (IPv4-compatible) from env parts.
 */
export function buildPoolerUrl() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const ref = process.env.SUPABASE_PROJECT_REF || DEFAULT_PROJECT_REF;
  const host = process.env.SUPABASE_POOLER_HOST || DEFAULT_POOLER_HOST;
  const port = process.env.SUPABASE_POOLER_PORT || (isServerless ? '6543' : '5432');
  const database = process.env.SUPABASE_DB_NAME || 'postgres';

  if (!password) return null;

  const base = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  return port === '6543' && !base.includes('pgbouncer=') ? `${base}?pgbouncer=true` : base;
}

/**
 * Prefer pooler URL for Supabase (IPv4). Falls back to DATABASE_URL.
 */
export function resolvePostgresUrl() {
  if (process.env.DATABASE_URL_POOLER) {
    return process.env.DATABASE_URL_POOLER;
  }

  const pooler = buildPoolerUrl();
  const direct = process.env.DATABASE_URL;

  // Direct db.*.supabase.co is IPv6-only — prefer pooler when password is available
  if (pooler && (!direct || direct.includes('db.') && direct.includes('.supabase.co'))) {
    return pooler;
  }

  if (direct) return direct;

  const host = process.env.SUPABASE_DB_HOST;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const user = process.env.SUPABASE_DB_USER || 'postgres';
  const database = process.env.SUPABASE_DB_NAME || 'postgres';
  const port = process.env.SUPABASE_DB_PORT || '5432';

  if (host && password) {
    return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  return pooler;
}

/**
 * pg.Client / Pool options with Supabase-friendly SSL.
 * Strips sslmode from URL to avoid verify-full overriding rejectUnauthorized.
 */
export function getPgClientConfig(connectionString) {
  const cleanUrl = connectionString
    .replace(/[?&]sslmode=[^&]*/g, '')
    .replace(/\?&/, '?')
    .replace(/\?$/, '');

  const isSupabase =
    connectionString.includes('supabase.co') || connectionString.includes('pooler.supabase.com');

  return {
    connectionString: cleanUrl,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  };
}

/**
 * @param {string} [connectionString]
 */
export function createPgClient(connectionString) {
  const url = connectionString || resolvePostgresUrl();
  if (!url) throw new Error('No PostgreSQL connection URL configured');
  return new pg.Client(getPgClientConfig(url));
}

export { DEFAULT_POOLER_HOST, DEFAULT_PROJECT_REF };
