const TOURNAMENT_TABLES = ['statistics', 'matches', 'teams', 'players'];

/**
 * @param {import('../utils/pgAdapter.js').PgConnection} connection
 * @param {string} tableName
 */
async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ?`,
    [tableName]
  );
  return rows.length > 0;
}

/**
 * @param {import('../utils/pgAdapter.js').PgConnection} connection
 * @param {string} tableName
 */
async function getRowCount(connection, tableName) {
  const [rows] = await connection.query(`SELECT COUNT(*)::int AS count FROM "${tableName}"`);
  return Number(rows[0]?.count ?? 0);
}

/**
 * @param {import('../utils/pgAdapter.js').PgConnection} connection
 * @param {string} tableName
 */
async function clearTableAndResetSequence(connection, tableName) {
  await connection.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
  const rowCount = await getRowCount(connection, tableName);
  if (rowCount !== 0) {
    throw new Error(`Failed to clear table ${tableName}: ${rowCount} row(s) remain`);
  }
  return { rowCount: 0, method: 'truncate' };
}

/**
 * Clear tournament tables and reset ID sequences.
 * @param {import('../utils/pgAdapter.js').PgConnection} connection
 * @param {{ includePlayers?: boolean }} [options]
 */
export async function resetTournamentData(connection, { includePlayers = true } = {}) {
  const tables = includePlayers
    ? [...TOURNAMENT_TABLES]
    : TOURNAMENT_TABLES.filter((t) => t !== 'players');

  const tablesCleared = [];
  const verification = {};

  for (const table of tables) {
    if (!(await tableExists(connection, table))) {
      console.warn(`Skipping missing table: ${table}`);
      continue;
    }

    verification[table] = await clearTableAndResetSequence(connection, table);
    tablesCleared.push(table);
  }

  if (tablesCleared.length === 0) {
    throw new Error('No tournament tables found to reset. Run npm run db:migrate first.');
  }

  return { tablesCleared, verification, autoIncrementReset: true };
}

/**
 * @param {ReturnType<import('../utils/pgAdapter.js').createPgPool>} poolInstance
 * @param {{ includePlayers?: boolean }} [options]
 */
export async function truncateTournamentTablesWithPool(poolInstance, options = {}) {
  const connection = await poolInstance.getConnection();
  try {
    return await resetTournamentData(connection, options);
  } finally {
    connection.release();
  }
}
