import fs from 'fs/promises';
import path from 'path';
import { createPgClient, resolvePostgresUrl } from '../../utils/pgConnection.js';
import { MIGRATION_TABLES, SERIAL_ID_TABLES, getExportDir } from './config.js';
import { transformRow } from './transform.js';

const BATCH_SIZE = 200;

/**
 * @param {import('pg').Client} client
 * @param {string} table
 * @param {Record<string, unknown>} row
 */
async function insertRow(client, table, row) {
  const columns = Object.keys(row);
  const values = Object.values(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const colList = columns.map((c) => `"${c}"`).join(', ');

  if (table === 'division_settings') {
    await client.query(
      `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})
       ON CONFLICT (division) DO UPDATE SET
         competition_format = EXCLUDED.competition_format,
         tournament_format = EXCLUDED.tournament_format,
         format_config = EXCLUDED.format_config,
         updated_at = EXCLUDED.updated_at`,
      values
    );
    return;
  }

  if (table === 'schema_migrations') {
    await client.query(
      `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})
       ON CONFLICT (version) DO NOTHING`,
      values
    );
    return;
  }

  await client.query(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`, values);
}

/**
 * @param {import('pg').Client} client
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 */
async function insertBatch(client, table, rows) {
  if (!rows.length) return;

  if (table === 'division_settings' || table === 'schema_migrations') {
    for (const row of rows) {
      await insertRow(client, table, row);
    }
    return;
  }

  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(', ');

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const chunk = rows.slice(offset, offset + BATCH_SIZE);
    const values = [];
    const tupleSql = chunk
      .map((row, rowIndex) => {
        const placeholders = columns
          .map((col, colIndex) => {
            values.push(row[col]);
            return `$${rowIndex * columns.length + colIndex + 1}`;
          })
          .join(', ');
        return `(${placeholders})`;
      })
      .join(', ');

    await client.query(`INSERT INTO "${table}" (${colList}) VALUES ${tupleSql}`, values);
  }
}

/**
 * Drop progression log rows whose FK targets are missing (stale MySQL audit data).
 * @param {import('pg').Client} client
 * @param {Record<string, unknown>[]} rows
 */
async function filterProgressionLogRows(client, rows) {
  const { rows: teamRows } = await client.query('SELECT id FROM teams');
  const { rows: matchRows } = await client.query('SELECT id FROM matches');
  const teamIds = new Set(teamRows.map((r) => r.id));
  const matchIds = new Set(matchRows.map((r) => r.id));

  const valid = [];
  const skipped = [];

  for (const row of rows) {
    if (!teamIds.has(row.team_id)) {
      skipped.push({ table: 'tournament_progression_log', row, reason: `orphan team_id ${row.team_id}` });
      continue;
    }
    if (row.triggered_by_match_id != null && !matchIds.has(row.triggered_by_match_id)) {
      skipped.push({
        table: 'tournament_progression_log',
        row,
        reason: `orphan triggered_by_match_id ${row.triggered_by_match_id}`,
      });
      continue;
    }
    valid.push(row);
  }

  return { valid, skipped };
}

/**
 * @param {{ inputDir?: string, truncate?: boolean, tables?: string[] }} [options]
 */
export async function importPostgresData(options = {}) {
  const inputDir = path.resolve(process.cwd(), options.inputDir || getExportDir());
  const databaseUrl = resolvePostgresUrl();
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL or SUPABASE_DB_PASSWORD');
  }

  const tables = options.tables || MIGRATION_TABLES;
  const client = createPgClient(databaseUrl);

  await client.connect();

  const results = {
    imported: {},
    failed: [],
    skipped: [],
  };

  try {
    if (options.truncate !== false) {
      console.log('  Truncating target tables (CASCADE)...');
      const tableList = tables.map((t) => `"${t}"`).join(', ');
      await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    }

    for (const table of tables) {
      const filePath = path.join(inputDir, `${table}.json`);
      let rows;
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        rows = JSON.parse(raw);
      } catch {
        console.log(`  skip  ${table} (no export file)`);
        results.imported[table] = { inserted: 0, skipped: true };
        continue;
      }

      let transformed = rows.map((rawRow) => transformRow(table, rawRow));
      let skippedCount = 0;

      if (table === 'tournament_progression_log') {
        const filtered = await filterProgressionLogRows(client, transformed);
        transformed = filtered.valid;
        skippedCount = filtered.skipped.length;
        results.skipped.push(...filtered.skipped);
        if (skippedCount > 0) {
          console.log(`  filter ${table}: skipped ${skippedCount} orphan row(s)`);
        }
      }

      let inserted = 0;
      let failed = 0;

      await client.query('BEGIN');
      try {
        await insertBatch(client, table, transformed);
        inserted = transformed.length;

        if (SERIAL_ID_TABLES.includes(table)) {
          await client.query(`
            SELECT setval(
              pg_get_serial_sequence('${table}', 'id'),
              COALESCE((SELECT MAX(id) FROM "${table}"), 1),
              (SELECT MAX(id) IS NOT NULL FROM "${table}")
            )
          `);
        }

        await client.query('COMMIT');
      } catch (tableError) {
        await client.query('ROLLBACK');
        throw tableError;
      }

      results.imported[table] = {
        inserted,
        failed,
        skipped: skippedCount,
        total: rows.length,
      };
      console.log(
        `  import ${table}: ${inserted}/${rows.length}` +
          (skippedCount ? ` (${skippedCount} orphans skipped)` : '')
      );
    }
  } finally {
    await client.end();
  }

  return results;
}

/**
 * @param {{ failuresPath: string }} options
 */
export async function retryFailedImports(options) {
  const databaseUrl = resolvePostgresUrl();
  if (!databaseUrl) throw new Error('Missing DATABASE_URL or SUPABASE_DB_PASSWORD');

  const raw = await fs.readFile(options.failuresPath, 'utf8');
  const failures = JSON.parse(raw);

  const client = createPgClient(databaseUrl);
  await client.connect();

  const stillFailed = [];
  let succeeded = 0;

  try {
    for (const item of failures) {
      try {
        await insertRow(client, item.table, item.row);
        succeeded += 1;
      } catch (error) {
        stillFailed.push({ ...item, error: error.message, code: error.code });
      }
    }
  } finally {
    await client.end();
  }

  return { succeeded, stillFailed };
}
