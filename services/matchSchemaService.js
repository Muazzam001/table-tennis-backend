/**
 * Idempotent schema helpers for match columns.
 */

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').Connection} db
 * @param {string} tableName
 * @param {string} columnName
 */
async function columnExists(db, tableName, columnName) {
  const [rows] = await db.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

/**
 * @param {import('mysql2/promise').Pool} db
 */
export async function ensureMatchSchema(db) {
  const changes = [];

  if (!(await columnExists(db, 'matches', 'set_game_scores'))) {
    await db.execute(`
      ALTER TABLE matches
        ADD COLUMN set_game_scores JSON NULL
        COMMENT 'Array of {team1, team2} game points per set played'
        AFTER score_team2
    `);
    changes.push('Added matches.set_game_scores');
  }

  if (!(await columnExists(db, 'matches', 'game_point_format'))) {
    await db.execute(`
      ALTER TABLE matches
        ADD COLUMN game_point_format TINYINT UNSIGNED NOT NULL DEFAULT 11
        COMMENT '11 or 21 point games when result was recorded'
        AFTER set_game_scores
    `);
    changes.push('Added matches.game_point_format');
  }

  return changes;
}
