import { JSON_COLUMNS, BOOLEAN_COLUMNS } from './config.js';

/**
 * Normalize a MySQL row for PostgreSQL insert.
 * @param {string} table
 * @param {Record<string, unknown>} row
 */
export function transformRow(table, row) {
  const out = { ...row };

  for (const col of BOOLEAN_COLUMNS[table] || []) {
    if (col in out && out[col] != null) {
      out[col] = Boolean(out[col]);
    }
  }

  for (const col of JSON_COLUMNS[table] || []) {
    if (col in out && out[col] != null && typeof out[col] === 'string') {
      try {
        out[col] = JSON.parse(out[col]);
      } catch {
        // keep string; PG may reject invalid JSON
      }
    }
  }

  // MySQL DATETIME / TIMESTAMP → ISO strings for pg
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) {
      out[key] = value.toISOString();
    }
  }

  return out;
}

/**
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 */
export function transformRows(table, rows) {
  return rows.map((row) => transformRow(table, row));
}
