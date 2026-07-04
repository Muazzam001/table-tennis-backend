import {
  getDivisionMatches,
  getGroupsFromMatches,
  detectFormat,
  countPlayersForDivision,
} from './tournamentService.js';
import { sqlCount } from '../utils/sql.js';
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
import { getDivisionSettings } from './divisionSettingsService.js';
import { getTierAssignments } from './tierPyramidService.js';
import { getPyramidProgressionLog } from './tierPyramidProgressionService.js';
import { resolveDivisionParam } from '@shared/tournament/divisions.js';
import { isTierPyramidFormat } from '@shared/tournament/formats/registry.js';
import {
  derivePyramidTournamentStatus,
  deriveLevel1bStatus,
  getS1GroupsFromMatches,
  rankEntrantsByRoundTypes,
} from '@shared/tournament/formats/tierPyramid/index.js';

/**
 * Build the full tournament overview payload for a division (live data).
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {{ healThirdPlace?: boolean }} [options]
 */
export async function buildDivisionOverview(db, division, { healThirdPlace = true } = {}) {
  division = resolveDivisionParam(division) || division;
  const divisionSettings = await getDivisionSettings(db, division);

  if (isTierPyramidFormat(divisionSettings.tournament_format)) {
    if (healThirdPlace) {
      try {
        await ensureThirdPlaceMatch(db, division);
      } catch (healError) {
        console.error('Third place auto-heal skipped:', healError.message);
      }
    }

    const [matches, tierState, progressionLog] = await Promise.all([
      getDivisionMatches(db, division),
      getTierAssignments(db, division),
      getPyramidProgressionLog(db, division, 50),
    ]);
    const config = tierState.config;
    const teams = tierState.teams.map((t) => ({ id: t.id, team_name: t.team_name, tier: t.tier }));
    const s1Groups = getS1GroupsFromMatches(matches, teams);

    /** @type {Record<string, object[]>} */
    const standings = {};
    for (const [poolId, poolTeams] of Object.entries(s1Groups)) {
      const poolMatches = matches.filter((m) => m.pool === poolId && m.round_type === 'S1');
      standings[poolId] = calculateGroupStandings(poolTeams, poolMatches, { roundTypes: ['S1'] });
    }

    const tier1Teams = teams.filter((t) => t.tier === 1);
    const s2Standings =
      tier1Teams.length > 0
        ? calculateGroupStandings(
            tier1Teams,
            matches.filter((m) => m.round_type === 'S2'),
            { roundTypes: ['S2'] }
          )
        : [];

    const l1bEntrants = tierState.teams.filter(
      (t) => t.pyramid_stage === 'L1B' || t.advancement_source?.startsWith('S1-')
    );
    const l1bStandings = l1bEntrants.length
      ? rankEntrantsByRoundTypes(
          l1bEntrants.map((t) => ({ id: t.id, team_name: t.team_name })),
          matches,
          ['S1', 'Level 1B']
        ).map((row) => {
          const entrant = tierState.teams.find((t) => t.id === row.id);
          const sourceMatch = entrant?.advancement_source?.match(/^S1-([A-Z])-(\d+)$/);
          return {
            ...row,
            sourceGroup: sourceMatch ? sourceMatch[1] : null,
            groupRank: sourceMatch ? Number(sourceMatch[2]) : null,
          };
        })
      : [];

    const level1bStatus = deriveLevel1bStatus(matches, divisionSettings);
    const status = derivePyramidTournamentStatus(matches, config, { level1bStatus });

    return {
      division,
      format: 'tier-pyramid',
      tournament_format: divisionSettings.tournament_format,
      config,
      status,
      pyramid: {
        config,
        entrants: tierState.teams,
        tierAssignments: tierState.tierAssignments,
        s1Groups: Object.entries(s1Groups).map(([id, poolTeams]) => ({ id, teams: poolTeams })),
        standings,
        s2Standings,
        l1bStandings,
        level1bStatus,
        progressionLog,
      },
      groups: Object.entries(s1Groups).map(([id, poolTeams]) => ({ id, teams: poolTeams })),
      standings,
      matches,
    };
  }

  if (healThirdPlace) {
    try {
      await ensureThirdPlaceMatch(db, division);
    } catch (healError) {
      console.error('Third place auto-heal skipped:', healError.message);
    }
  }

  const [matches, groups, playerCount, [teamRows]] = await Promise.all([
    getDivisionMatches(db, division),
    getGroupsFromMatches(db, division),
    countPlayersForDivision(db, division),
    db.execute('SELECT COUNT(*) as count FROM teams WHERE division = ?', [division]),
  ]);
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

  const setupOptions = getTournamentSetupOptions(sqlCount(teamRows), playerCount);

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
