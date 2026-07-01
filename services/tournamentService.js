import {
  distributeIntoGroups,
  generateGroupStageMatches,
  calculateGroupStandings,
  getQualifiedTeams,
  generateGroupsQuarterFinalPairings,
  generateLegacyQuarterFinalPairings,
  generateSemiFinalPairings,
  generateFinalPairing,
  generateThirdPlacePairing,
  deriveTournamentStatus,
  getNextKnockoutRound,
  getTournamentConfig,
  buildConfigFromCounts,
  scheduleFixtures,
} from '@shared/tournament/index.js';
import { parseTournamentDivision } from '@shared/tournament/divisions.js';

export {
  distributeIntoGroups,
  generateGroupStageMatches,
  calculateGroupStandings,
  getQualifiedTeams,
  generateGroupsQuarterFinalPairings,
  generateLegacyQuarterFinalPairings,
  generateSemiFinalPairings,
  generateFinalPairing,
  generateThirdPlacePairing,
  deriveTournamentStatus,
  getNextKnockoutRound,
  getTournamentConfig,
  buildConfigFromCounts,
  scheduleFixtures,
};

/**
 * Build groups map from qualifying matches (teams per pool).
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function getGroupsFromMatches(db, division) {
  const [rows] = await db.execute(
    `SELECT DISTINCT m.pool, t.id, t.team_name
     FROM matches m
     INNER JOIN teams t ON (t.id = m.team1_id OR t.id = m.team2_id)
     WHERE m.round_type = 'Qualifying' AND m.division = ? AND m.pool IS NOT NULL
     ORDER BY m.pool, t.id`,
    [division]
  );

  /** @type {Record<string, { id: number, team_name: string }[]>} */
  const groups = {};
  for (const row of rows) {
    if (!groups[row.pool]) groups[row.pool] = [];
    if (!groups[row.pool].some((t) => t.id === row.id)) {
      groups[row.pool].push({ id: row.id, team_name: row.team_name });
    }
  }
  return groups;
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function countPlayersForDivision(db, division) {
  const { category } = parseTournamentDivision(division);
  const [[{ count }]] = await db.query(
    'SELECT COUNT(*) AS count FROM players WHERE is_active = TRUE AND category = ?',
    [category]
  );
  return Number(count);
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function getDivisionMatches(db, division) {
  const [rows] = await db.execute(
    `SELECT m.*, t1.team_name AS team1_name, t2.team_name AS team2_name
     FROM matches m
     INNER JOIN teams t1 ON m.team1_id = t1.id
     INNER JOIN teams t2 ON m.team2_id = t2.id
     WHERE m.division = ?
     ORDER BY m.scheduled_date ASC`,
    [division]
  );
  return rows;
}

/**
 * Detect tournament format from existing qualifying matches.
 * @param {object[]} matches
 */
export function detectFormat(matches, groups = null) {
  const pools = getGroupOrderFromMatches(matches);
  if (pools.length === 1) return 'single-group';
  if (pools.length === 2) {
    if (groups) {
      const sizes = pools.map((p) => groups[p]?.length || 0);
      if (sizes.every((s) => s >= 4)) return 'pools-2';
    }
    const poolMatchCounts = pools.map(
      (p) => matches.filter((m) => m.pool === p && m.round_type === 'Qualifying').length
    );
    if (poolMatchCounts.some((count) => count >= 6)) return 'pools-2';
  }
  return 'groups';
}

export function getGroupOrderFromMatches(matches) {
  return [...new Set(matches.filter((m) => m.pool).map((m) => m.pool))].sort();
}

/**
 * @param {object} pairing
 */
export function normalizePairing(pairing) {
  const team1Id = pairing.team1.id;
  const team2Id = pairing.team2.id;
  return {
    team1_id: team1Id < team2Id ? team1Id : team2Id,
    team2_id: team1Id < team2Id ? team2Id : team1Id,
    round_type: pairing.round_type,
    pool: null,
    label: pairing.label,
  };
}
