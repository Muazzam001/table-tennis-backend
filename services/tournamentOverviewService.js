import {
  getDivisionMatches,
  getGroupsFromMatches,
  detectFormat,
  countPlayersForDivision,
} from './tournamentService.js';
import { buildKnockoutBracket, inferSingleGroupTeamCount } from '@shared/tournament/knockout.js';
import {
  calculateGroupStandings,
  deriveTournamentStatus,
} from '@shared/tournament/index.js';
import {
  getTournamentSetupOptions,
  getPoolIds,
  resolveQualifiersPerGroup,
} from '@shared/tournament/constants.js';
import { ensureThirdPlaceMatch } from './matchProgressionService.js';

/**
 * Build the full tournament overview payload for a division (live data).
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {{ healThirdPlace?: boolean }} [options]
 */
export async function buildDivisionOverview(db, division, { healThirdPlace = true } = {}) {
  if (healThirdPlace) {
    try {
      await ensureThirdPlaceMatch(db, division);
    } catch (healError) {
      console.error('Third place auto-heal skipped:', healError.message);
    }
  }

  const matches = await getDivisionMatches(db, division);
  const groups = await getGroupsFromMatches(db, division);
  const groupOrder = Object.keys(groups).sort();
  const format = detectFormat(matches, groups);
  const teamCount =
    inferSingleGroupTeamCount(matches, format) ??
    Object.values(groups).reduce((sum, t) => sum + t.length, 0);
  const qualifiersPerGroup = resolveQualifiersPerGroup(teamCount, groupOrder.length || 1, format);

  const config =
    groupOrder.length > 0
      ? {
          format,
          isSingleGroup: format === 'single-group',
          participantCount: teamCount,
          groupCount: groupOrder.length,
          groupSize: groupOrder.length > 0 ? Object.values(groups)[0]?.length || 0 : 0,
          qualifiersPerGroup,
          poolIds: groupOrder.length > 0 ? groupOrder : getPoolIds(4),
        }
      : null;

  /** @type {Record<string, object[]>} */
  const standings = {};
  for (const [poolId, teams] of Object.entries(groups)) {
    const poolMatches = matches.filter((m) => m.pool === poolId);
    standings[poolId] = calculateGroupStandings(teams, poolMatches);
  }

  const status = deriveTournamentStatus(matches, { format, teamCount });
  const bracket = buildKnockoutBracket(matches, format);

  const playerCount = await countPlayersForDivision(db, division);
  const [teamRows] = await db.execute(
    'SELECT COUNT(*) as count FROM teams WHERE division = ?',
    [division]
  );
  const setupOptions = getTournamentSetupOptions(teamRows[0].count, playerCount);

  return {
    division,
    config,
    format,
    status,
    groups: Object.entries(groups).map(([id, teams]) => ({ id, teams })),
    standings,
    bracket,
    matches,
    setupOptions,
  };
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function getDivisionTeamsWithPlayers(db, division) {
  const [rows] = await db.execute(
    `SELECT
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
    INNER JOIN players p2 ON t.player2_id = p2.id
    WHERE t.division = ?
    ORDER BY t.id`,
    [division]
  );
  return rows;
}
