import {
  buildDivisionOverview,
  getDivisionTeamsWithPlayers,
} from './tournamentOverviewService.js';

const VALID_DIVISIONS = ['Expert', 'Intermediate', 'Women'];

const DIVISION_LABELS = {
  Expert: 'Expert Division',
  Intermediate: 'Intermediate Division',
  Women: 'Women Division',
};

/**
 * @param {import('mysql2/promise').Pool} db
 */
export async function ensureTournamentArchivesTable(db) {
  await db.query(
    `CREATE TABLE IF NOT EXISTS tournament_archives (
      id INT PRIMARY KEY AUTO_INCREMENT,
      division ENUM('Expert', 'Intermediate', 'Women') NOT NULL,
      name VARCHAR(200) NOT NULL,
      completed_at DATETIME NOT NULL,
      archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      champion_team_name VARCHAR(150) NULL,
      runner_up_team_name VARCHAR(150) NULL,
      participant_count INT DEFAULT 0,
      snapshot_json JSON NOT NULL,
      INDEX idx_division (division),
      INDEX idx_completed_at (completed_at),
      INDEX idx_archived_at (archived_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

/**
 * @param {object} finalMatch
 */
function getFinalResult(finalMatch) {
  if (!finalMatch?.winner_team_id) {
    return { champion: null, runnerUp: null };
  }

  const champion =
    finalMatch.winner_team_id === finalMatch.team1_id
      ? finalMatch.team1_name
      : finalMatch.team2_name;
  const runnerUp =
    finalMatch.winner_team_id === finalMatch.team1_id
      ? finalMatch.team2_name
      : finalMatch.team1_name;

  return { champion, runnerUp };
}

/**
 * @param {string} division
 * @param {Date} completedAt
 */
function buildArchiveName(division, completedAt) {
  const label = DIVISION_LABELS[division] || division;
  const dateStr = completedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${label} — ${dateStr}`;
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function archiveCompletedDivision(db, division) {
  if (!VALID_DIVISIONS.includes(division)) {
    throw Object.assign(new Error('Invalid division'), { statusCode: 400 });
  }

  await ensureTournamentArchivesTable(db);

  const overview = await buildDivisionOverview(db, division, { healThirdPlace: false });

  if (overview.status !== 'Completed') {
    throw Object.assign(
      new Error(`Cannot archive ${division} division: tournament status is "${overview.status}", expected "Completed"`),
      { statusCode: 400 }
    );
  }

  const teams = await getDivisionTeamsWithPlayers(db, division);
  const finalMatch = overview.matches.find((m) => m.round_type === 'Final');
  const { champion, runnerUp } = getFinalResult(finalMatch);
  const completedAt = finalMatch?.updated_at
    ? new Date(finalMatch.updated_at)
    : new Date();

  const snapshot = {
    ...overview,
    teams,
    finalResult: {
      championTeamName: champion,
      runnerUpTeamName: runnerUp,
      finalMatch: finalMatch
        ? {
            id: finalMatch.id,
            team1_name: finalMatch.team1_name,
            team2_name: finalMatch.team2_name,
            score_team1: finalMatch.score_team1,
            score_team2: finalMatch.score_team2,
            winner_team_id: finalMatch.winner_team_id,
            scheduled_date: finalMatch.scheduled_date,
          }
        : null,
    },
    archivedFrom: 'live',
  };

  const name = buildArchiveName(division, completedAt);
  const participantCount = overview.config?.participantCount || teams.length;

  const [insertResult] = await db.execute(
    `INSERT INTO tournament_archives
      (division, name, completed_at, champion_team_name, runner_up_team_name, participant_count, snapshot_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      division,
      name,
      completedAt,
      champion,
      runnerUp,
      participantCount,
      JSON.stringify(snapshot),
    ]
  );

  await clearDivisionTournamentData(db, division);

  return {
    archiveId: insertResult.insertId,
    division,
    name,
    championTeamName: champion,
    runnerUpTeamName: runnerUp,
    participantCount,
    completedAt,
  };
}

/**
 * Remove division teams (matches cascade). Players are preserved for the next season.
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function clearDivisionTournamentData(db, division) {
  await db.execute('DELETE FROM teams WHERE division = ?', [division]);
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {{ division?: string }} [filters]
 */
export async function listTournamentArchives(db, filters = {}) {
  await ensureTournamentArchivesTable(db);

  const params = [];
  let where = '';
  if (filters.division) {
    if (!VALID_DIVISIONS.includes(filters.division)) {
      throw Object.assign(new Error('Invalid division'), { statusCode: 400 });
    }
    where = 'WHERE division = ?';
    params.push(filters.division);
  }

  const [rows] = await db.execute(
    `SELECT
      id,
      division,
      name,
      completed_at,
      archived_at,
      champion_team_name,
      runner_up_team_name,
      participant_count
    FROM tournament_archives
    ${where}
    ORDER BY completed_at DESC, archived_at DESC`,
    params
  );

  return rows;
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {number} id
 */
export async function getTournamentArchiveById(db, id) {
  await ensureTournamentArchivesTable(db);

  const [rows] = await db.execute(
    `SELECT
      id,
      division,
      name,
      completed_at,
      archived_at,
      champion_team_name,
      runner_up_team_name,
      participant_count,
      snapshot_json
    FROM tournament_archives
    WHERE id = ?`,
    [id]
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
  const snapshot =
    typeof row.snapshot_json === 'string'
      ? JSON.parse(row.snapshot_json)
      : row.snapshot_json;

  return {
    id: row.id,
    division: row.division,
    name: row.name,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    championTeamName: row.champion_team_name,
    runnerUpTeamName: row.runner_up_team_name,
    participantCount: row.participant_count,
    snapshot,
  };
}
