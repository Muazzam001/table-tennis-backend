/**
 * Idempotent upgrade: rename legacy `league` table/columns/indexes to `division`.
 * Safe to run on every startup and after SQL migrations.
 */

const TABLES_WITH_DIVISION_COLUMN = [
  'division_settings',
  'teams',
  'matches',
  'team_pairing_rules',
  'tournament_archives',
];

/**
 * @param {import('mysql2/promise').Connection | import('mysql2/promise').PoolConnection} connection
 * @param {string} tableName
 */
async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

/**
 * @param {import('mysql2/promise').Connection | import('mysql2/promise').PoolConnection} connection
 * @param {string} tableName
 * @param {string} columnName
 */
async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

/**
 * @param {import('mysql2/promise').Connection | import('mysql2/promise').PoolConnection} connection
 */
async function renameLegacySettingsTable(connection) {
  const hasLegacy = await tableExists(connection, 'league_settings');
  const hasCurrent = await tableExists(connection, 'division_settings');
  if (!hasLegacy || hasCurrent) {
    return false;
  }
  await connection.query('RENAME TABLE league_settings TO division_settings');
  return true;
}

/**
 * @param {import('mysql2/promise').Connection | import('mysql2/promise').PoolConnection} connection
 * @param {string} tableName
 */
async function dropLeagueColumn(connection, tableName) {
  if (!(await columnExists(connection, tableName, 'league'))) {
    return false;
  }

  const [indexes] = await connection.query(
    `SELECT DISTINCT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'idx_league'`,
    [tableName]
  );
  for (const row of indexes) {
    await connection.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${row.INDEX_NAME}\``);
  }

  await connection.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`league\``);
  return true;
}

/**
 * @param {import('mysql2/promise').Connection | import('mysql2/promise').PoolConnection} connection
 * @param {string} tableName
 */
async function reconcileDuplicateDivisionColumns(connection, tableName) {
  if (!(await tableExists(connection, tableName))) {
    return false;
  }
  if (!(await columnExists(connection, tableName, 'league'))) {
    return false;
  }
  if (!(await columnExists(connection, tableName, 'division'))) {
    return false;
  }

  await connection.query(
    `UPDATE \`${tableName}\` SET division = league WHERE league IS NOT NULL`
  );

  return dropLeagueColumn(connection, tableName);
}

/**
 * @param {import('mysql2/promise').Connection | import('mysql2/promise').PoolConnection} connection
 * @param {string} tableName
 */
async function renameLeagueColumn(connection, tableName) {
  if (!(await tableExists(connection, tableName))) {
    return false;
  }
  if (!(await columnExists(connection, tableName, 'league'))) {
    return false;
  }
  if (await columnExists(connection, tableName, 'division')) {
    return false;
  }

  const [columns] = await connection.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'league'`,
    [tableName]
  );
  if (!columns.length) {
    return false;
  }

  const { COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA } = columns[0];
  const nullability = IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
  let defaultClause = '';
  if (COLUMN_DEFAULT !== null && COLUMN_DEFAULT !== undefined) {
    defaultClause = `DEFAULT '${COLUMN_DEFAULT}'`;
  } else if (IS_NULLABLE === 'YES') {
    defaultClause = 'DEFAULT NULL';
  }
  const extra = EXTRA ? ` ${EXTRA}` : '';

  await connection.query(
    `ALTER TABLE \`${tableName}\` CHANGE \`league\` \`division\` ${COLUMN_TYPE} ${nullability}${defaultClause ? ` ${defaultClause}` : ''}${extra}`
  );
  return true;
}

/**
 * @param {import('mysql2/promise').Connection | import('mysql2/promise').PoolConnection} connection
 * @param {string} tableName
 */
async function renameLegacyDivisionIndexes(connection, tableName) {
  if (!(await tableExists(connection, tableName))) {
    return false;
  }

  const [legacyIndexes] = await connection.query(
    `SELECT DISTINCT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'idx_league'`,
    [tableName]
  );
  if (!legacyIndexes.length) {
    return false;
  }

  const [currentIndexes] = await connection.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'idx_division'
     LIMIT 1`,
    [tableName]
  );

  if (currentIndexes.length === 0) {
    await connection.query(`ALTER TABLE \`${tableName}\` RENAME INDEX idx_league TO idx_division`);
  } else {
    await connection.query(`ALTER TABLE \`${tableName}\` DROP INDEX idx_league`);
  }
  return true;
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').Connection} db
 * @returns {Promise<{ applied: boolean, changes: string[] }>}
 */
export async function ensureDivisionSchema(db) {
  const ownsConnection = typeof db.getConnection === 'function';
  const connection = ownsConnection ? await db.getConnection() : db;
  const changes = [];

  try {
    if (await renameLegacySettingsTable(connection)) {
      changes.push('Renamed table league_settings → division_settings');
    }

    for (const tableName of TABLES_WITH_DIVISION_COLUMN) {
      if (await reconcileDuplicateDivisionColumns(connection, tableName)) {
        changes.push(`Merged and removed duplicate ${tableName}.league column`);
        await renameLegacyDivisionIndexes(connection, tableName);
        continue;
      }

      if (await renameLeagueColumn(connection, tableName)) {
        changes.push(`Renamed column ${tableName}.league → division`);
      }
      if (await renameLegacyDivisionIndexes(connection, tableName)) {
        changes.push(`Renamed index ${tableName}.idx_league → idx_division`);
      }
    }

    return { applied: changes.length > 0, changes };
  } finally {
    if (ownsConnection) {
      connection.release();
    }
  }
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').Connection} db
 * @returns {Promise<{ ok: boolean, legacyColumns: { table: string, column: string }[] }>}
 */
export async function auditDivisionSchema(db) {
  const ownsConnection = typeof db.getConnection === 'function';
  const connection = ownsConnection ? await db.getConnection() : db;

  try {
    const [legacyColumns] = await connection.query(
      `SELECT TABLE_NAME AS \`table\`, COLUMN_NAME AS \`column\`
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND COLUMN_NAME = 'league'
       ORDER BY TABLE_NAME`
    );

    const [legacyTables] = await connection.query(
      `SELECT TABLE_NAME AS \`table\`
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'league_settings'`
    );

    const legacy = [
      ...legacyColumns.map((row) => ({ table: row.table, column: row.column })),
      ...legacyTables.map((row) => ({ table: row.table, column: '(table)' })),
    ];

    return { ok: legacy.length === 0, legacyColumns: legacy };
  } finally {
    if (ownsConnection) {
      connection.release();
    }
  }
}
