/** @typedef {import('../../types.ts').Match} Match */
/** @typedef {import('../../types.ts').Team} Team */
/** @typedef {import('../../types.ts').StandingRow} StandingRow */

import { calculateGroupStandings } from '../../standings.js';
import {
  getLevel1BEntrants,
  buildLevel1BStandings,
  buildS1QualifierSourceMap,
} from './advancement.js';
import { getLevel3Matches, getPyramidSemiFinalMatches } from './roundFilters.js';
import { rankEntrantsByRoundTypes } from './seeding.js';

/**
 * @param {Match[]} matches
 * @param {string[]} roundTypes
 * @returns {Set<number>}
 */
function collectParticipantIds(matches, roundTypes) {
  const ids = new Set();
  for (const match of matches) {
    if (!roundTypes.includes(match.round_type)) continue;
    if (match.team1_id != null) ids.add(match.team1_id);
    if (match.team2_id != null) ids.add(match.team2_id);
  }
  return ids;
}

/**
 * @param {Team[]} teams
 * @param {Match[]} matches
 * @param {string[]} roundTypes
 * @returns {Team[]}
 */
export function getRoundTypeEntrants(teams, matches, roundTypes) {
  const ids = collectParticipantIds(matches, roundTypes);
  return teams.filter((t) => ids.has(t.id));
}

/**
 * @param {StandingRow} row
 * @param {{ sourceGroup?: string | null, groupRank?: number | null, exitStage?: string | null }} [extra]
 */
function withMeta(row, extra = {}) {
  return {
    ...row,
    sourceGroup: extra.sourceGroup ?? row.sourceGroup ?? null,
    groupRank: extra.groupRank ?? row.groupRank ?? null,
    exitStage: extra.exitStage ?? row.exitStage ?? null,
  };
}

/**
 * Flatten S1 pool players into one overall table (pool tables stay separate in the UI).
 * @param {Team[]} teams
 * @param {Match[]} matches
 * @param {Record<string, StandingRow[]>} [s1StandingsByPool]
 * @returns {StandingRow[]}
 */
export function buildS1OverallStandings(teams, matches, s1StandingsByPool = {}) {
  /** @type {Map<number, { sourceGroup: string, groupRank: number }>} */
  const sourceMap = new Map();
  for (const [poolId, rows] of Object.entries(s1StandingsByPool || {})) {
    rows.forEach((row, index) => {
      sourceMap.set(row.id, { sourceGroup: poolId, groupRank: row.rank ?? index + 1 });
    });
  }

  for (const match of matches) {
    if (match.round_type !== 'S1' || !match.pool) continue;
    for (const teamId of [match.team1_id, match.team2_id]) {
      if (teamId == null || sourceMap.has(teamId)) continue;
      sourceMap.set(teamId, { sourceGroup: String(match.pool), groupRank: null });
    }
  }

  const entrantIds = new Set([
    ...sourceMap.keys(),
    ...collectParticipantIds(matches, ['S1']),
  ]);
  const entrants = teams.filter((t) => entrantIds.has(t.id));
  if (entrants.length === 0) return [];

  return rankEntrantsByRoundTypes(
    entrants.map((t) => ({ id: t.id, team_name: t.team_name })),
    matches,
    ['S1']
  ).map((row) => {
    const source = sourceMap.get(row.id);
    return withMeta(row, {
      sourceGroup: source?.sourceGroup ?? null,
      groupRank: source?.groupRank ?? null,
    });
  });
}

/**
 * Overall S2 table for all Tier-1 (or otherwise S2) participants.
 * @param {Team[]} teams
 * @param {Match[]} matches
 * @returns {StandingRow[]}
 */
export function buildS2OverallStandings(teams, matches) {
  const entrants = getRoundTypeEntrants(teams, matches, ['S2']);
  if (entrants.length === 0) {
    const tier1 = teams.filter((t) => t.tier === 1);
    if (tier1.length === 0) return [];
    return calculateGroupStandings(tier1, matches.filter((m) => m.round_type === 'S2'), {
      roundTypes: ['S2'],
    }).map((row) => withMeta(row));
  }
  return rankEntrantsByRoundTypes(
    entrants.map((t) => ({ id: t.id, team_name: t.team_name })),
    matches,
    ['S2']
  ).map((row) => withMeta(row));
}

/**
 * Level 1 field ranking = Level 1B knockout among S1 qualifiers.
 * @param {Team[]} teams
 * @param {Match[]} matches
 * @param {{
 *   s1StandingsByPool?: Record<string, StandingRow[]>,
 *   s1QualifiersPerGroup?: number,
 * }} [options]
 */
export function buildLevel1Standings(teams, matches, options = {}) {
  return buildLevel1BStandings(teams, matches, options).map((row) => withMeta(row));
}

/**
 * @param {Team[]} teams
 * @param {Match[]} matches
 */
export function getLevel2Entrants(teams, matches) {
  const fromMatches = getRoundTypeEntrants(teams, matches, ['Level 2']);
  if (fromMatches.length > 0) return fromMatches;
  return teams.filter(
    (t) =>
      t.advancement_source?.startsWith('L1B-adv-') || t.advancement_source?.startsWith('S2-drop-')
  );
}

/**
 * Complete Level 2 ranking for every team that entered Level 2.
 * @param {Team[]} teams
 * @param {Match[]} matches
 */
export function buildLevel2Standings(teams, matches) {
  const entrants = getLevel2Entrants(teams, matches);
  if (entrants.length === 0) return [];

  return rankEntrantsByRoundTypes(
    entrants.map((t) => ({ id: t.id, team_name: t.team_name })),
    matches,
    ['Level 2']
  ).map((row) => {
    const team = teams.find((t) => t.id === row.id);
    const source = team?.advancement_source || null;
    return withMeta(row, {
      sourceGroup: source?.startsWith('L1B-adv-')
        ? 'L1B'
        : source?.startsWith('S2-drop-')
          ? 'S2'
          : null,
      groupRank: source?.match(/(\d+)$/) ? Number(source.match(/(\d+)$/)[1]) : null,
    });
  });
}

/**
 * @param {Team[]} teams
 * @param {Match[]} matches
 */
export function getLevel3Entrants(teams, matches) {
  const ids = collectParticipantIds(matches, ['Level 3']);
  for (const match of getPyramidSemiFinalMatches(matches)) {
    if (match.team1_id != null) ids.add(match.team1_id);
    if (match.team2_id != null) ids.add(match.team2_id);
  }
  if (ids.size > 0) return teams.filter((t) => ids.has(t.id));

  return teams.filter(
    (t) => t.advancement_source === 'L2-win' || t.advancement_source?.startsWith('S2-top-')
  );
}

/**
 * Complete Level 3 ranking (crossover + path through semis when played).
 * @param {Team[]} teams
 * @param {Match[]} matches
 */
export function buildLevel3Standings(teams, matches) {
  const entrants = getLevel3Entrants(teams, matches);
  if (entrants.length === 0) return [];

  return rankEntrantsByRoundTypes(
    entrants.map((t) => ({ id: t.id, team_name: t.team_name })),
    matches,
    ['Level 3', 'Semi Final', 'Third Place', 'Final']
  ).map((row) => {
    const team = teams.find((t) => t.id === row.id);
    const source = team?.advancement_source || null;
    return withMeta(row, {
      sourceGroup: source === 'L2-win' ? 'L2' : source?.startsWith('S2-top-') ? 'S2' : null,
      groupRank: source?.match(/(\d+)$/) ? Number(source.match(/(\d+)$/)[1]) : null,
    });
  });
}

/**
 * @param {Match[]} matches
 * @param {number} teamId
 */
function teamLostMatch(match, teamId) {
  if (!match || match.status !== 'Completed' || !match.winner_team_id) return false;
  return (
    (match.team1_id === teamId || match.team2_id === teamId) && match.winner_team_id !== teamId
  );
}

/**
 * @param {Match[]} matches
 * @param {number} teamId
 */
function teamPlayed(match, teamId) {
  return match && (match.team1_id === teamId || match.team2_id === teamId);
}

/**
 * Assign tournament-flow exit band (lower = better finish).
 * @param {number} teamId
 * @param {Match[]} matches
 * @returns {{ band: number, exitStage: string } | null}
 */
export function getPyramidFlowExit(teamId, matches) {
  const finalMatch = matches.find((m) => m.round_type === 'Final');
  if (finalMatch?.status === 'Completed' && finalMatch.winner_team_id) {
    if (finalMatch.winner_team_id === teamId) return { band: 1, exitStage: 'Champion' };
    if (teamPlayed(finalMatch, teamId)) return { band: 2, exitStage: 'Runner-up' };
  } else if (finalMatch && teamPlayed(finalMatch, teamId)) {
    return { band: 2, exitStage: 'Finalist' };
  }

  const thirdPlace = matches.find((m) => m.round_type === 'Third Place');
  if (thirdPlace?.status === 'Completed' && thirdPlace.winner_team_id) {
    if (thirdPlace.winner_team_id === teamId) return { band: 3, exitStage: 'Third place' };
    if (teamPlayed(thirdPlace, teamId)) return { band: 4, exitStage: 'Fourth place' };
  } else if (thirdPlace && teamPlayed(thirdPlace, teamId)) {
    return { band: 3, exitStage: 'Third-place match' };
  }

  const sfMatches = getPyramidSemiFinalMatches(matches);
  const playedSf = sfMatches.filter((m) => teamPlayed(m, teamId));
  if (playedSf.length > 0) {
    const lostSf = playedSf.some((m) => teamLostMatch(m, teamId));
    if (lostSf) return { band: 4, exitStage: 'Semi-finalist' };
    if (playedSf.some((m) => m.status !== 'Completed' || !m.winner_team_id)) {
      return { band: 3, exitStage: 'Semi-finals' };
    }
  }

  const l3Matches = getLevel3Matches(matches).filter((m) => teamPlayed(m, teamId));
  if (l3Matches.length > 0) {
    if (l3Matches.some((m) => teamLostMatch(m, teamId))) {
      return { band: 5, exitStage: 'Level 3' };
    }
    if (l3Matches.some((m) => m.status !== 'Completed' || !m.winner_team_id)) {
      return { band: 5, exitStage: 'Level 3' };
    }
  }

  const l2Matches = matches.filter((m) => m.round_type === 'Level 2' && teamPlayed(m, teamId));
  if (l2Matches.length > 0) {
    if (l2Matches.some((m) => teamLostMatch(m, teamId))) {
      return { band: 6, exitStage: 'Level 2' };
    }
    if (l2Matches.some((m) => m.status !== 'Completed' || !m.winner_team_id)) {
      return { band: 6, exitStage: 'Level 2' };
    }
  }

  const l1bMatches = matches.filter((m) => m.round_type === 'Level 1B' && teamPlayed(m, teamId));
  if (l1bMatches.length > 0) {
    return { band: 7, exitStage: 'Level 1' };
  }

  const s2Matches = matches.filter((m) => m.round_type === 'S2' && teamPlayed(m, teamId));
  if (s2Matches.length > 0) {
    return { band: 9, exitStage: 'S2' };
  }

  const s1Matches = matches.filter((m) => m.round_type === 'S1' && teamPlayed(m, teamId));
  if (s1Matches.length > 0) {
    return { band: 10, exitStage: 'S1' };
  }

  return null;
}

/**
 * Tournament flow ranking: deepest progress first, then within-band match performance.
 * @param {Team[]} teams
 * @param {Match[]} matches
 * @param {{
 *   s1StandingsByPool?: Record<string, StandingRow[]>,
 *   s1QualifiersPerGroup?: number,
 * }} [options]
 */
export function buildPyramidFlowRankings(teams, matches, options = {}) {
  if (!teams.length) return [];

  const exits = teams
    .map((team) => {
      const exit = getPyramidFlowExit(team.id, matches);
      if (!exit) return null;
      return { team, ...exit };
    })
    .filter(Boolean);

  if (exits.length === 0) return [];

  const performance = calculateGroupStandings(
    exits.map((e) => ({ id: e.team.id, team_name: e.team.team_name })),
    matches,
    { includeAllRoundTypes: true }
  );
  const perfById = new Map(performance.map((row) => [row.id, row]));

  const qualifierSource = buildS1QualifierSourceMap(
    options.s1StandingsByPool || {},
    options.s1QualifiersPerGroup ?? 4
  );

  const sorted = [...exits].sort((a, b) => {
    if (a.band !== b.band) return a.band - b.band;
    const pa = perfById.get(a.team.id);
    const pb = perfById.get(b.team.id);
    if ((pb?.points ?? 0) !== (pa?.points ?? 0)) return (pb?.points ?? 0) - (pa?.points ?? 0);
    if ((pb?.set_difference ?? 0) !== (pa?.set_difference ?? 0)) {
      return (pb?.set_difference ?? 0) - (pa?.set_difference ?? 0);
    }
    if ((pb?.matches_won ?? 0) !== (pa?.matches_won ?? 0)) {
      return (pb?.matches_won ?? 0) - (pa?.matches_won ?? 0);
    }
    return a.team.id - b.team.id;
  });

  return sorted.map((entry, index) => {
    const perf = perfById.get(entry.team.id);
    const source = qualifierSource.get(entry.team.id);
    const fromSource = entry.team.advancement_source?.match(/^S1-([A-Z])-(\d+)$/);
    return withMeta(
      {
        id: entry.team.id,
        team_name: entry.team.team_name,
        rank: index + 1,
        matches_played: perf?.matches_played ?? 0,
        matches_won: perf?.matches_won ?? 0,
        matches_lost: perf?.matches_lost ?? 0,
        points: perf?.points ?? 0,
        sets_won: perf?.sets_won ?? 0,
        sets_lost: perf?.sets_lost ?? 0,
        set_difference: perf?.set_difference ?? 0,
        points_won: perf?.points_won ?? 0,
        points_lost: perf?.points_lost ?? 0,
        point_difference: perf?.point_difference ?? 0,
        margin_quality_score: perf?.margin_quality_score ?? 0,
        dominance_score: perf?.dominance_score ?? 0,
        games_won: perf?.games_won ?? 0,
        games_lost: perf?.games_lost ?? 0,
        game_difference: perf?.game_difference ?? 0,
      },
      {
        exitStage: entry.exitStage,
        sourceGroup: fromSource ? fromSource[1] : (source?.sourceGroup ?? null),
        groupRank: fromSource ? Number(fromSource[2]) : (source?.groupRank ?? null),
      }
    );
  });
}

/**
 * Bundle every ranking surface used by the tournament overview.
 * @param {Team[]} teams
 * @param {Match[]} matches
 * @param {{
 *   s1StandingsByPool?: Record<string, StandingRow[]>,
 *   s1QualifiersPerGroup?: number,
 * }} [options]
 */
export function buildPyramidRankingsBundle(teams, matches, options = {}) {
  const s1StandingsByPool = options.s1StandingsByPool || {};
  const s1QualifiersPerGroup = options.s1QualifiersPerGroup ?? 4;

  return {
    s1OverallStandings: buildS1OverallStandings(teams, matches, s1StandingsByPool),
    s2OverallStandings: buildS2OverallStandings(teams, matches),
    level1Standings: buildLevel1Standings(teams, matches, {
      s1StandingsByPool,
      s1QualifiersPerGroup,
    }),
    // Back-compat alias for older clients.
    l1bStandings: buildLevel1Standings(teams, matches, {
      s1StandingsByPool,
      s1QualifiersPerGroup,
    }),
    level2Standings: buildLevel2Standings(teams, matches),
    level3Standings: buildLevel3Standings(teams, matches),
    flowRankings: buildPyramidFlowRankings(teams, matches, {
      s1StandingsByPool,
      s1QualifiersPerGroup,
    }),
  };
}

export { getLevel1BEntrants, buildLevel1BStandings };
