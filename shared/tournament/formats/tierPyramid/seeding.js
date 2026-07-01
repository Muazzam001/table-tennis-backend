/** @typedef {import('../../types.ts').Match} Match */
/** @typedef {import('../../types.ts').StandingRow} StandingRow */
/** @typedef {import('../../types.ts').Team} Team */

import { calculateGroupStandings } from '../../standings.js';
import { buildCrossoverRoundWithByes, buildFirstKnockoutRoundWithByes } from './bracket.js';

/**
 * Rank entrants using cumulative wins across all completed tournament matches.
 * @param {Team[]} entrants
 * @param {Match[]} allMatches
 * @returns {StandingRow[]}
 */
export function rankEntrantsByCumulativeWins(entrants, allMatches) {
  const entrantIds = new Set(entrants.map((t) => t.id));
  const relevant = allMatches.filter(
    (m) =>
      entrantIds.has(m.team1_id) &&
      entrantIds.has(m.team2_id) &&
      m.status === 'Completed' &&
      m.winner_team_id
  );
  return calculateGroupStandings(entrants, relevant, { includeAllRoundTypes: true });
}

/**
 * Split Level 2 entrants into S1 group winners and S2 tier-1 drop-outs.
 * @param {Team[]} teams
 */
export function partitionLevel2Entrants(teams) {
  const s1Winners = teams.filter((t) => t.advancement_source?.startsWith('S1-'));
  const s2Drops = teams.filter((t) => t.advancement_source?.startsWith('S2-drop-'));

  if (s1Winners.length + s2Drops.length === teams.length) {
    return { s1Winners, s2Drops };
  }

  return {
    s1Winners: teams.filter((t) => t.tier !== 1),
    s2Drops: teams.filter((t) => t.tier === 1),
  };
}

/**
 * Split Level 3 entrants into Level 2 winners and S2 tier-1 qualifiers.
 * @param {Team[]} teams
 */
export function partitionLevel3Entrants(teams) {
  const l2Winners = teams.filter((t) => t.advancement_source === 'L2-win');
  const s2Top = teams.filter((t) => t.advancement_source?.startsWith('S2-top-'));

  if (l2Winners.length + s2Top.length === teams.length) {
    return { l2Winners, s2Top };
  }

  return {
    l2Winners: teams.filter((t) => t.tier !== 1),
    s2Top: teams.filter((t) => t.tier === 1),
  };
}

/**
 * @typedef {{
 *   label: string,
 *   team1_id: number,
 *   team2_id: number,
 *   team1: object,
 *   team2: object,
 *   round_type: string,
 *   pyramid_stage: string,
 *   stage_sequence: number,
 *   pool: null,
 * }} PyramidPairingFixture
 */

/**
 * @typedef {{
 *   fixtures: PyramidPairingFixture[],
 *   byeEntrants: object[],
 * }} PyramidKnockoutRoundPlan
 */

/**
 * @param {object[]} rankedPool
 * @param {Match[]} allMatches
 * @param {string} roundType
 */
function rankPoolByAdvancementSource(rankedPool, allMatches, roundType) {
  const ranked = rankEntrantsByCumulativeWins(rankedPool, allMatches);
  if (ranked.length === rankedPool.length) return ranked;
  return [...rankedPool].sort((a, b) => {
    const rankA = Number.parseInt(a.advancement_source?.match(/(\d+)$/)?.[1] ?? '999', 10);
    const rankB = Number.parseInt(b.advancement_source?.match(/(\d+)$/)?.[1] ?? '999', 10);
    if (rankA !== rankB) return rankA - rankB;
    return a.id - b.id;
  });
}

/**
 * Build crossover knockout fixtures between two pools (supports unequal sizes + byes).
 * @param {Team[]} poolA
 * @param {Team[]} poolB
 * @param {Match[]} allMatches
 * @param {{ stage: string, roundType: string, labelPrefix?: string, rankRoundType?: string }} options
 * @returns {PyramidKnockoutRoundPlan}
 */
export function buildPyramidCrossoverRound(poolA, poolB, allMatches, options) {
  const { stage, roundType, labelPrefix = 'KO-', rankRoundType = roundType } = options;
  const rankedA = rankPoolByAdvancementSource(poolA, allMatches, rankRoundType);
  const rankedB = rankPoolByAdvancementSource(poolB, allMatches, rankRoundType);
  const { fixtures, byeEntrants } = buildCrossoverRoundWithByes(rankedA, rankedB);

  return {
    fixtures: fixtures.map((fixture, index) => ({
      label: `${labelPrefix}${index + 1}`,
      team1_id: fixture.team1.id,
      team2_id: fixture.team2.id,
      team1: fixture.team1,
      team2: fixture.team2,
      round_type: roundType,
      pyramid_stage: stage,
      stage_sequence: index,
      pool: null,
    })),
    byeEntrants,
  };
}

/**
 * Crossover pairings for Level 3: Level 2 winners vs S2 tier-1 qualifiers.
 * @param {Team[]} l2Winners
 * @param {Team[]} s2Top
 * @param {Match[]} allMatches
 * @param {{ stage: string, roundType: string, labelPrefix?: string }} options
 * @returns {PyramidPairingFixture[]}
 */
export function generateLevel3CrossoverPairings(l2Winners, s2Top, allMatches, options) {
  return buildPyramidCrossoverRound(l2Winners, s2Top, allMatches, {
    ...options,
    rankRoundType: 'Level 2',
  }).fixtures;
}

/**
 * Crossover pairings for Level 2: S1 group winners vs S2 tier-1 drop-outs.
 * @param {Team[]} s1Winners
 * @param {Team[]} s2Drops
 * @param {Match[]} allMatches
 * @param {{ stage: string, roundType: string, labelPrefix?: string }} options
 * @returns {PyramidPairingFixture[]}
 */
export function generateLevel2CrossoverPairings(s1Winners, s2Drops, allMatches, options) {
  return buildPyramidCrossoverRound(s1Winners, s2Drops, allMatches, {
    ...options,
    rankRoundType: 'S1',
  }).fixtures;
}

/**
 * Level 3 crossover with bye metadata for semi-final seeding.
 * @param {Team[]} l2Winners
 * @param {Team[]} s2Top
 * @param {Match[]} allMatches
 * @param {{ stage: string, roundType: string, labelPrefix?: string }} options
 * @returns {PyramidKnockoutRoundPlan}
 */
export function buildLevel3CrossoverRound(l2Winners, s2Top, allMatches, options) {
  return buildPyramidCrossoverRound(l2Winners, s2Top, allMatches, {
    ...options,
    rankRoundType: 'Level 2',
  });
}

/**
 * Standard bracket pairings for power-of-2 teams (seeds 1–n).
 * @param {StandingRow[]} seededStandings — sorted best to worst
 * @param {{ stage: string, roundType: string, labelPrefix?: string }} options
 */
export function generateSeededBracketPairings(seededStandings, options) {
  const { stage, roundType, labelPrefix = stage } = options;
  const n = seededStandings.length;
  if (n < 2) {
    throw new Error(`Seeded bracket requires at least 2 teams (got ${n})`);
  }

  const { fixtures } = buildFirstKnockoutRoundWithByes(seededStandings);

  return fixtures.map((fixture, index) => ({
    label: `${labelPrefix}${index + 1}`,
    team1_id: fixture.team1.id,
    team2_id: fixture.team2.id,
    team1: fixture.team1,
    team2: fixture.team2,
    round_type: roundType,
    pyramid_stage: stage,
    stage_sequence: index,
    pool: null,
  }));
}

/**
 * @param {Match[]} matches
 * @param {string} roundType
 */
export function getOrderedBracketResults(matches, roundType) {
  const roundMatches = matches
    .filter((m) => m.round_type === roundType && m.status === 'Completed' && m.winner_team_id)
    .sort((a, b) => {
      const seqA = a.stage_sequence ?? 0;
      const seqB = b.stage_sequence ?? 0;
      if (seqA !== seqB) return seqA - seqB;
      return new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0);
    });

  const winners = roundMatches.map((m) => ({
    id: m.winner_team_id,
    team_name: m.winner_team_id === m.team1_id ? m.team1_name : m.team2_name,
  }));

  const losers = roundMatches.map((m) => {
    const loserId = m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id;
    const loserName = m.winner_team_id === m.team1_id ? m.team2_name : m.team1_name;
    return { id: loserId, team_name: loserName };
  });

  return { matches: roundMatches, winners, losers };
}
