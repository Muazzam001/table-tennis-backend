import {
  buildDivisionOverview,
  getDivisionTeamsWithPlayers,
} from './tournamentOverviewService.js';
import { resolveDivisionParam } from '@shared/tournament/divisions.js';
import {
  VALID_DIVISIONS,
  getTournamentDivisionLabel,
} from '@shared/tournament/competitionFormat.js';

const DIVISION_LABELS = Object.fromEntries(
  VALID_DIVISIONS.map((d) => [d, getTournamentDivisionLabel(d)])
);

/**
 * tournament_archives is created by Supabase migration 001_initial_schema.sql.
 * @param {import('../utils/pgAdapter.js').createPgPool} _db
 */
export async function ensureTournamentArchivesTable(_db) {
  // no-op — schema managed by Supabase migrations
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
 * @param {object} thirdPlaceMatch
 */
function getThirdPlaceResult(thirdPlaceMatch) {
  if (!thirdPlaceMatch?.winner_team_id) return null;
  return thirdPlaceMatch.winner_team_id === thirdPlaceMatch.team1_id
    ? thirdPlaceMatch.team1_name
    : thirdPlaceMatch.team2_name;
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
  const normalized = resolveDivisionParam(division);
  if (!normalized) {
    throw Object.assign(new Error('Invalid division'), { statusCode: 400 });
  }
  division = normalized;

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
  const thirdPlaceMatch = overview.matches.find((m) => m.round_type === 'Third Place');
  const { champion, runnerUp } = getFinalResult(finalMatch);
  const thirdPlace = getThirdPlaceResult(thirdPlaceMatch);
  const completedAt = finalMatch?.updated_at
    ? new Date(finalMatch.updated_at)
    : new Date();

  const snapshot = {
    ...overview,
    teams,
    finalResult: {
      championTeamName: champion,
      runnerUpTeamName: runnerUp,
      thirdPlaceTeamName: thirdPlace,
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
    const normalized = resolveDivisionParam(filters.division);
    if (!normalized) {
      throw Object.assign(new Error('Invalid division'), { statusCode: 400 });
    }
    where = 'WHERE division = ?';
    params.push(normalized);
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
