const TOURNAMENT_TABLES = ['statistics', 'matches', 'teams', 'players'];

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} tableName
 */
async function tableExists(connection, tableName) {
  const dbName = process.env.DB_NAME;
  const [rows] = await connection.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, tableName]
  );
  return rows.length > 0;
}

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} tableName
 */
async function getRowCount(connection, tableName) {
  const [[{ count }]] = await connection.query(
    `SELECT COUNT(*) AS count FROM \`${tableName}\``
  );
  return Number(count);
}

/**
 * InnoDB can report a stale AUTO_INCREMENT in SHOW TABLE STATUS after DELETE.
 * Insert and remove a row with id=1 to re-anchor the counter on an empty table.
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} tableName
 */
async function reanchorAutoIncrement(connection, tableName) {
  const rowCount = await getRowCount(connection, tableName);
  if (rowCount > 0) {
    return;
  }

  switch (tableName) {
    case 'players':
      await connection.query(
        `INSERT INTO players (id, name, email, expertise_level)
         VALUES (1, '__reset__', CONCAT('__reset__', REPLACE(UUID(), '-', ''), '@local'), 'Expert')`
      );
      await connection.query(`DELETE FROM players WHERE id = 1`);
      break;
    case 'teams': {
      const [playerRows] = await connection.query(
        `SELECT id FROM players ORDER BY id LIMIT 2`
      );
      if (playerRows.length < 2) {
        break;
      }
      await connection.query(
        `INSERT INTO teams (id, team_name, player1_id, player2_id, division)
         VALUES (1, '__reset__', ?, ?, 'Expert')`,
        [playerRows[0].id, playerRows[1].id]
      );
      await connection.query(`DELETE FROM teams WHERE id = 1`);
      break;
    }
    case 'matches': {
      const [teamRows] = await connection.query(
        `SELECT id FROM teams ORDER BY id LIMIT 2`
      );
      if (teamRows.length < 2) {
        break;
      }
      await connection.query(
        `INSERT INTO matches (id, team1_id, team2_id, scheduled_date, venue, division)
         VALUES (1, ?, ?, NOW(), 'Reset', 'Expert')`,
        [teamRows[0].id, teamRows[1].id]
      );
      await connection.query(`DELETE FROM matches WHERE id = 1`);
      break;
    }
    case 'statistics': {
      const [playerRows] = await connection.query(`SELECT id FROM players ORDER BY id LIMIT 1`);
      const [teamRows] = await connection.query(`SELECT id FROM teams ORDER BY id LIMIT 1`);
      if (!playerRows.length || !teamRows.length) {
        break;
      }
      await connection.query(
        `INSERT INTO statistics (id, player_id, team_id)
         VALUES (1, ?, ?)`,
        [playerRows[0].id, teamRows[0].id]
      );
      await connection.query(`DELETE FROM statistics WHERE id = 1`);
      break;
    }
    default:
      break;
  }

  await connection.query(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1`);
}

/**
 * Empty a table and reset AUTO_INCREMENT to 1.
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} tableName
 */
async function clearTableAndResetAutoIncrement(connection, tableName) {
  let method = 'truncate';

  try {
    await connection.query(`TRUNCATE TABLE \`${tableName}\``);
  } catch (truncateError) {
    console.warn(`TRUNCATE ${tableName} failed (${truncateError.code}), using DELETE:`, truncateError.message);
    method = 'delete';
    await connection.query(`DELETE FROM \`${tableName}\``);
    await connection.query(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1`);
    await reanchorAutoIncrement(connection, tableName);
  }

  const rowCount = await getRowCount(connection, tableName);
  if (rowCount !== 0) {
    throw new Error(`Failed to clear table ${tableName}: ${rowCount} row(s) remain`);
  }

  return { rowCount: 0, method };
}

/**
 * Clear tournament tables and reset AUTO_INCREMENT to 1.
 * Tables are cleared child-first; players last so TRUNCATE can succeed with FK checks off.
 * @param {import('mysql2/promise').Connection} connection
 * @param {{ includePlayers?: boolean }} [options]
 */
export async function resetTournamentData(connection, { includePlayers = true } = {}) {
  const tables = includePlayers
    ? [...TOURNAMENT_TABLES]
    : TOURNAMENT_TABLES.filter((t) => t !== 'players');

  const tablesCleared = [];
  const verification = {};

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query('SET UNIQUE_CHECKS = 0');

  try {
    for (const table of tables) {
      if (!(await tableExists(connection, table))) {
        console.warn(`Skipping missing table: ${table}`);
        continue;
      }

      verification[table] = await clearTableAndResetAutoIncrement(connection, table);
      tablesCleared.push(table);
    }
  } finally {
    await connection.query('SET UNIQUE_CHECKS = 1');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  if (tablesCleared.length === 0) {
    throw new Error('No tournament tables found to reset. Run database setup or schema.sql first.');
  }

  return { tablesCleared, verification, autoIncrementReset: true };
}

/**
 * @param {import('mysql2/promise').Pool} poolInstance
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
