import {
  VALID_LEAGUES,
  isValidCompetitionFormat,
} from '@shared/tournament/competitionFormat.js';

const DEFAULT_FORMAT = 'doubles';

const TEAM_SELECT = `
  SELECT
    t.id,
    t.team_name,
    t.league,
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
export async function ensureLeagueSettingsTable(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS league_settings (
      league ENUM('Expert', 'Intermediate', 'Women') PRIMARY KEY,
      competition_format ENUM('doubles', 'singles') NOT NULL DEFAULT 'doubles',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  for (const league of VALID_LEAGUES) {
    await db.execute(
      'INSERT IGNORE INTO league_settings (league, competition_format) VALUES (?, ?)',
      [league, DEFAULT_FORMAT]
    );
  }
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} league
 */
export async function getCompetitionFormat(db, league) {
  await ensureLeagueSettingsTable(db);
  const [rows] = await db.execute(
    'SELECT competition_format FROM league_settings WHERE league = ?',
    [league]
  );
  return rows[0]?.competition_format || DEFAULT_FORMAT;
}

/**
 * @param {import('mysql2/promise').Pool} db
 */
export async function getAllLeagueSettings(db) {
  await ensureLeagueSettingsTable(db);
  const [rows] = await db.execute(
    'SELECT league, competition_format, updated_at FROM league_settings ORDER BY FIELD(league, "Expert", "Intermediate", "Women")'
  );
  return rows;
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} league
 * @param {string} competitionFormat
 */
export async function setCompetitionFormat(db, league, competitionFormat) {
  if (!VALID_LEAGUES.includes(league)) {
    throw Object.assign(new Error('Invalid league'), { statusCode: 400 });
  }
  if (!isValidCompetitionFormat(competitionFormat)) {
    throw Object.assign(new Error('Invalid competition format'), { statusCode: 400 });
  }

  await ensureLeagueSettingsTable(db);

  const [teams] = await db.execute(
    'SELECT COUNT(*) AS count FROM teams WHERE league = ?',
    [league]
  );
  if (Number(teams[0].count) > 0) {
    const currentFormat = await getCompetitionFormat(db, league);
    if (currentFormat !== competitionFormat) {
      throw Object.assign(
        new Error('Cannot change format while teams exist for this league. Delete teams first.'),
        { statusCode: 400 }
      );
    }
  }

  await db.execute(
    `INSERT INTO league_settings (league, competition_format)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE competition_format = VALUES(competition_format)`,
    [league, competitionFormat]
  );

  return getCompetitionFormat(db, league);
}

export { TEAM_SELECT };
