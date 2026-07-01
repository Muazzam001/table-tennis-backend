/**
 * Idempotent schema helpers for Tier Pyramid columns (migration 016).
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
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').Connection} db
 * @param {string} tableName
 */
async function tableExists(db, tableName) {
  const [rows] = await db.execute(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

/**
 * @param {import('mysql2/promise').Pool} db
 */
export async function ensureTierPyramidSchema(db) {
  const changes = [];

  if (!(await columnExists(db, 'division_settings', 'tournament_format'))) {
    await db.execute(`
      ALTER TABLE division_settings
        ADD COLUMN tournament_format ENUM(
          'groups', 'single-group', 'pools-2', 'tier-pyramid'
        ) NOT NULL DEFAULT 'groups' AFTER competition_format
    `);
    changes.push('Added division_settings.tournament_format');
  }

  if (!(await columnExists(db, 'division_settings', 'format_config'))) {
    await db.execute(`
      ALTER TABLE division_settings
        ADD COLUMN format_config JSON NULL COMMENT 'Tier sizes, group count, qualifiers, etc.'
        AFTER tournament_format
    `);
    changes.push('Added division_settings.format_config');
  }

  const [formatColRows] = await db.execute(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'division_settings' AND COLUMN_NAME = 'tournament_format'
     LIMIT 1`
  );
  const formatColumnType = formatColRows[0]?.COLUMN_TYPE || '';
  const expectedFormatEnum =
    "enum('groups','single-group','pools-2','tier-pyramid')";
  if (formatColumnType && formatColumnType !== expectedFormatEnum) {
    await db.execute(
      `UPDATE division_settings SET tournament_format = 'groups' WHERE tournament_format = 'tiered-3'`
    );
    await db.execute(`
      ALTER TABLE division_settings
      MODIFY tournament_format ENUM('groups', 'single-group', 'pools-2', 'tier-pyramid')
      NOT NULL DEFAULT 'groups'
    `);
    changes.push('Upgraded division_settings.tournament_format enum');
  }

  const teamColumns = [
    {
      name: 'tier',
      sql: `ADD COLUMN tier TINYINT UNSIGNED NULL COMMENT '1, 2, or 3 for tier-pyramid' AFTER division`,
    },
    {
      name: 'pyramid_stage',
      sql: `ADD COLUMN pyramid_stage ENUM(
        'registered', 'S1', 'S2', 'L2', 'L3', 'final', 'champion', 'eliminated'
      ) NULL AFTER tier`,
    },
    {
      name: 'pyramid_status',
      sql: `ADD COLUMN pyramid_status ENUM(
        'active', 'advanced', 'eliminated', 'withdrawn'
      ) NULL DEFAULT 'active' AFTER pyramid_stage`,
    },
    {
      name: 'advancement_source',
      sql: `ADD COLUMN advancement_source VARCHAR(50) NULL AFTER pyramid_status`,
    },
  ];

  for (const col of teamColumns) {
    if (!(await columnExists(db, 'teams', col.name))) {
      await db.execute(`ALTER TABLE teams ${col.sql}`);
      changes.push(`Added teams.${col.name}`);
    }
  }

  if (!(await columnExists(db, 'matches', 'pyramid_stage'))) {
    await db.execute(`
      ALTER TABLE matches
        ADD COLUMN pyramid_stage ENUM('S1', 'S2', 'L2', 'L3', 'Final') NULL AFTER pool,
        ADD COLUMN stage_sequence INT NULL COMMENT 'Bracket slot index within stage' AFTER pyramid_stage
    `);
    changes.push('Added matches.pyramid_stage and stage_sequence');
  }

  if (!(await tableExists(db, 'tournament_progression_log'))) {
    await db.execute(`
      CREATE TABLE tournament_progression_log (
        id INT PRIMARY KEY AUTO_INCREMENT,
        division ENUM('Men', 'Women') NOT NULL,
        team_id INT NOT NULL,
        from_stage VARCHAR(20) NOT NULL,
        to_stage VARCHAR(20) NOT NULL,
        from_status VARCHAR(20) NOT NULL,
        to_status VARCHAR(20) NOT NULL,
        reason ENUM('auto', 'manual_override', 'withdrawal', 'regeneration') NOT NULL,
        triggered_by_match_id INT NULL,
        admin_user_id INT NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_division (division),
        INDEX idx_team (team_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (triggered_by_match_id) REFERENCES matches(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    changes.push('Created tournament_progression_log');
  }

  await migrateS3StageToS2(db, changes);

  return { applied: changes.length > 0, changes };
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} tableName
 * @param {string} columnName
 */
async function getColumnType(db, tableName, columnName) {
  const [rows] = await db.execute(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows[0]?.COLUMN_TYPE || '';
}

/**
 * Upgrade legacy S3 pyramid stage labels to S2 (migration 020).
 * @param {import('mysql2/promise').Pool} db
 * @param {string[]} changes
 */
async function migrateS3StageToS2(db, changes) {
  const roundTypeCol = await getColumnType(db, 'matches', 'round_type');
  const teamStageCol = await getColumnType(db, 'teams', 'pyramid_stage');
  const matchStageCol = await getColumnType(db, 'matches', 'pyramid_stage');

  const needsDataMigration =
    roundTypeCol.includes("'S3'") ||
    teamStageCol.includes("'S3'") ||
    matchStageCol.includes("'S3'");

  if (needsDataMigration) {
    if (roundTypeCol.includes("'S3'") && !roundTypeCol.includes("'S2'")) {
      await db.execute(`
        ALTER TABLE matches
          MODIFY round_type ENUM(
            'Qualifying', 'Quarter Final', 'Semi Final', 'Final', 'Third Place',
            'S1', 'S3', 'S2', 'Level 2', 'Level 3'
          ) NOT NULL DEFAULT 'Qualifying'
      `);
    }

    if (teamStageCol.includes("'S3'") && !teamStageCol.includes("'S2'")) {
      await db.execute(`
        ALTER TABLE teams
          MODIFY pyramid_stage ENUM(
            'registered', 'S1', 'S3', 'S2', 'L2', 'L3', 'final', 'champion', 'eliminated'
          ) NULL
      `);
    }

    if (matchStageCol.includes("'S3'") && !matchStageCol.includes("'S2'")) {
      await db.execute(`
        ALTER TABLE matches
          MODIFY pyramid_stage ENUM('S1', 'S3', 'S2', 'L2', 'L3', 'Final') NULL
      `);
    }

    await db.execute(`UPDATE matches SET round_type = 'S2' WHERE round_type = 'S3'`);
    await db.execute(`UPDATE matches SET pyramid_stage = 'S2' WHERE pyramid_stage = 'S3'`);
    await db.execute(`UPDATE teams SET pyramid_stage = 'S2' WHERE pyramid_stage = 'S3'`);
    await db.execute(
      `UPDATE teams SET advancement_source = REPLACE(advancement_source, 'S3-', 'S2-')
       WHERE advancement_source LIKE 'S3-%'`
    );
    await db.execute(
      `UPDATE tournament_progression_log SET from_stage = 'S2' WHERE from_stage = 'S3'`
    );
    await db.execute(`UPDATE tournament_progression_log SET to_stage = 'S2' WHERE to_stage = 'S3'`);
    await db.execute(
      `UPDATE division_settings
       SET format_config = REPLACE(
         REPLACE(format_config, '"s3AdvanceCount"', '"s2AdvanceCount"'),
         '"s3DropCount"', '"s2DropCount"'
       )
       WHERE tournament_format = 'tier-pyramid' AND format_config IS NOT NULL`
    );

    changes.push('Renamed Tier Pyramid stage S3 → S2');
  }

  try {
    await db.execute(`
      ALTER TABLE teams
        MODIFY pyramid_stage ENUM(
          'registered', 'S1', 'S2', 'L2', 'L3', 'final', 'champion', 'eliminated'
        ) NULL
    `);
    await db.execute(`
      ALTER TABLE matches
        MODIFY round_type ENUM(
          'Qualifying', 'Quarter Final', 'Semi Final', 'Final', 'Third Place',
          'S1', 'S2', 'Level 2', 'Level 3'
        ) NOT NULL DEFAULT 'Qualifying'
    `);
    await db.execute(`
      ALTER TABLE matches
        MODIFY pyramid_stage ENUM('S1', 'S2', 'L2', 'L3', 'Final') NULL
    `);
  } catch {
    // Already on latest enum
  }
}
