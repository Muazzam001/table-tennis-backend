import {
  VALID_DIVISIONS,
  isValidCompetitionFormat,
} from '@shared/tournament/competitionFormat.js';
import { ensureDivisionSchema } from './divisionSchemaMigrationService.js';

const DEFAULT_FORMAT = 'doubles';

const TEAM_SELECT = `
  SELECT
    t.id,
    t.team_name,
    t.division,
    t.player1_id,
    t.player2_id,
    p1.name AS player1_name,
    p1.expertise_level AS player1_expertise,
    p1.category AS player1_category,
    p2.name AS player2_name,
    p2.expertise_level AS player2_expertise,
    p2.category AS player2_category,
    t.created_at,
    t.updated_at
  FROM teams t
  INNER JOIN players p1 ON t.player1_id = p1.id
  LEFT JOIN players p2 ON t.player2_id = p2.id
`;

/**
 * @param {import('mysql2/promise').Pool} db
 */
export async function ensureDivisionSettingsTable(db) {
  await ensureDivisionSchema(db);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS division_settings (
      division ENUM('Men', 'Women') PRIMARY KEY,
      competition_format ENUM('doubles', 'singles') NOT NULL DEFAULT 'doubles',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  for (const division of VALID_DIVISIONS) {
    await db.execute(
      'INSERT IGNORE INTO division_settings (division, competition_format) VALUES (?, ?)',
      [division, DEFAULT_FORMAT]
    );
  }
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function getCompetitionFormat(db, division) {
  await ensureDivisionSettingsTable(db);
  const [rows] = await db.execute(
    'SELECT competition_format FROM division_settings WHERE division = ?',
    [division]
  );
  return rows[0]?.competition_format || DEFAULT_FORMAT;
}

/**
 * @param {import('mysql2/promise').Pool} db
 */
export async function getAllDivisionSettings(db) {
  await ensureDivisionSettingsTable(db);
  const order = VALID_DIVISIONS.map((d) => `"${d}"`).join(', ');
  const [rows] = await db.execute(
    `SELECT division, competition_format, updated_at FROM division_settings ORDER BY FIELD(division, ${order})`
  );
  return rows;
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {string} competitionFormat
 */
export async function setCompetitionFormat(db, division, competitionFormat) {
  if (!VALID_DIVISIONS.includes(division)) {
    throw Object.assign(new Error('Invalid division'), { statusCode: 400 });
  }
  if (!isValidCompetitionFormat(competitionFormat)) {
    throw Object.assign(new Error('Invalid competition format'), { statusCode: 400 });
  }

  await ensureDivisionSettingsTable(db);

  const [teams] = await db.execute(
    'SELECT COUNT(*) AS count FROM teams WHERE division = ?',
    [division]
  );
  if (Number(teams[0].count) > 0) {
    const currentFormat = await getCompetitionFormat(db, division);
    if (currentFormat !== competitionFormat) {
      throw Object.assign(
        new Error('Cannot change format while teams exist for this division. Delete teams first.'),
        { statusCode: 400 }
      );
    }
  }

  await db.execute(
    `INSERT INTO division_settings (division, competition_format)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE competition_format = VALUES(competition_format)`,
    [division, competitionFormat]
  );

  return getCompetitionFormat(db, division);
}

export { TEAM_SELECT };
