import pg from 'pg';
import { getPgClientConfig, resolvePostgresUrl } from '../utils/pgConnection.js';
import { isServerless } from '../utils/runtime.js';

const { Pool } = pg;

const TABLES_WITHOUT_SERIAL_ID = new Set(['division_settings']);

function convertPlaceholders(sql, params) {
  let index = 0;
  const converted = sql.replace(/\?/g, () => `$${++index}`);
  return { sql: converted, params };
}

function normalizeSql(sql) {
  return sql
    .replace(/`([^`]+)`/g, '"$1"')
    .replace(/\bTRUE\b/gi, 'TRUE')
    .replace(/\bFALSE\b/gi, 'FALSE');
}

function isInsert(sql) {
  return /^\s*INSERT\s+/i.test(sql.trim());
}

function isUpdateOrDelete(sql) {
  return /^\s*(UPDATE|DELETE)\s+/i.test(sql.trim());
}

function getInsertTableName(sql) {
  const match = sql.match(/INSERT\s+INTO\s+("?[\w]+"?)/i);
  if (!match) return null;
  return match[1].replace(/"/g, '');
}

function ensureReturningId(sql) {
  if (!isInsert(sql) || /RETURNING\s+/i.test(sql)) {
    return sql;
  }
  const table = getInsertTableName(sql);
  if (table && TABLES_WITHOUT_SERIAL_ID.has(table)) {
    return sql;
  }
  return `${sql.replace(/;?\s*$/, '')} RETURNING id`;
}

async function executeOnClient(client, sql, params = []) {
  const normalized = normalizeSql(sql);
  const { sql: pgSql, params: pgParams } = convertPlaceholders(normalized, params);
  const finalSql = ensureReturningId(pgSql);

  const result = await client.query(finalSql, pgParams);

  if (isInsert(finalSql) && result.rows.length > 0 && result.rows[0].id !== undefined) {
    return [{ insertId: Number(result.rows[0].id), affectedRows: result.rowCount ?? 1 }];
  }

  if (isInsert(finalSql)) {
    return [{ insertId: 0, affectedRows: result.rowCount ?? 0 }];
  }

  if (isUpdateOrDelete(finalSql)) {
    return [{ insertId: 0, affectedRows: result.rowCount ?? 0 }];
  }

  return [result.rows];
}

class PgConnection {
  constructor(client) {
    this.client = client;
  }

  execute(sql, params) {
    return executeOnClient(this.client, sql, params);
  }

  query(sql, params) {
    return executeOnClient(this.client, sql, params);
  }

  async beginTransaction() {
    await this.client.query('BEGIN');
  }

  async commit() {
    await this.client.query('COMMIT');
  }

  async rollback() {
    await this.client.query('ROLLBACK');
  }

  release() {
    this.client.release();
  }
}

function getPoolMaxSize() {
  if (process.env.PG_POOL_MAX) {
    const parsed = Number.parseInt(process.env.PG_POOL_MAX, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  // One connection per serverless instance avoids exhausting Supabase pool limits
  return isServerless ? 1 : 10;
}

export function createPgPool(connectionString) {
  const url = connectionString || resolvePostgresUrl();
  if (!url) throw new Error('No PostgreSQL connection URL configured');

  const pool = new Pool({
    ...getPgClientConfig(url),
    max: getPoolMaxSize(),
  });

  const adapter = {
    async execute(sql, params) {
      const client = await pool.connect();
      try {
        return await executeOnClient(client, sql, params);
      } finally {
        client.release();
      }
    },

    async query(sql, params) {
      return adapter.execute(sql, params);
    },

    async getConnection() {
      const client = await pool.connect();
      return new PgConnection(client);
    },

    async end() {
      await pool.end();
    },
  };

  return adapter;
}

export function getPgConnectionErrorMessage(error) {
  if (!error) return 'Unknown connection error';

  const code = error.code || '';
  const message = error.message || '';

  if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
    return 'PostgreSQL server is not running or not reachable. Check DATABASE_URL.';
  }
  if (code === 'ETIMEDOUT' || message.includes('ETIMEDOUT')) {
    return 'Connection timeout. Check DATABASE_URL and network access.';
  }
  if (code === '28P01' || message.includes('password authentication failed')) {
    return 'Access denied. Check DATABASE_URL credentials.';
  }
  if (code === '3D000' || message.includes('does not exist')) {
    return 'Database does not exist. Run Supabase migrations first.';
  }
  if (code === '42P01') {
    return 'Required table does not exist. Run Supabase migrations first.';
  }

  return `Failed to connect to PostgreSQL: ${message}`;
}
