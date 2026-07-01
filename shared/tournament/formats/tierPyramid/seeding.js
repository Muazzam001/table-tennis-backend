/** @typedef {import('../../types.ts').Match} Match */
/** @typedef {import('../../types.ts').StandingRow} StandingRow */
/** @typedef {import('../../types.ts').Team} Team */

import { calculateGroupStandings } from '../../standings.js';

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
 * Crossover pairings for Level 3: Level 2 winners vs S2 tier-1 qualifiers.
 * Uses legacy 2-pool crossover (A1 vs B4, A2 vs B3, A3 vs B2, A4 vs B1).
 * @param {Team[]} l2Winners
 * @param {Team[]} s2Top
 * @param {Match[]} allMatches
 * @param {{ stage: string, roundType: string, labelPrefix?: string }} options
 */
export function generateLevel3CrossoverPairings(l2Winners, s2Top, allMatches, options) {
  const { stage, roundType, labelPrefix = 'L3-QF' } = options;
  const poolSize = 4;

  if (l2Winners.length !== poolSize || s2Top.length !== poolSize) {
    throw new Error(
      `Level 3 crossover requires ${poolSize} Level 2 winners and ${poolSize} S2 qualifiers ` +
        `(got ${l2Winners.length} and ${s2Top.length})`
    );
  }

  const l2Matches = allMatches.filter((m) => m.round_type === 'Level 2');
  const rankedL2 = rankEntrantsByCumulativeWins(l2Winners, l2Matches);

  const rankedS2Top = [...s2Top].sort((a, b) => {
    const rankA = Number.parseInt(a.advancement_source?.match(/S2-top-(\d+)/)?.[1] ?? '999', 10);
    const rankB = Number.parseInt(b.advancement_source?.match(/S2-top-(\d+)/)?.[1] ?? '999', 10);
    if (rankA !== rankB) return rankA - rankB;
    return a.id - b.id;
  });

  const crossoverSlots = [
    [0, 3],
    [1, 2],
    [2, 1],
    [3, 0],
  ];

  return crossoverSlots.map(([l2Idx, s2Idx], index) => ({
    label: `${labelPrefix}${index + 1}`,
    team1_id: rankedL2[l2Idx].id,
    team2_id: rankedS2Top[s2Idx].id,
    team1: rankedL2[l2Idx],
    team2: rankedS2Top[s2Idx],
    round_type: roundType,
    pyramid_stage: stage,
    stage_sequence: index,
    pool: null,
  }));
}

/**
 * Crossover pairings for Level 2: S1 group winners vs S2 tier-1 drop-outs.
 * Uses legacy 2-pool crossover (A1 vs B4, A2 vs B3, A3 vs B2, A4 vs B1).
 * @param {Team[]} s1Winners
 * @param {Team[]} s2Drops
 * @param {Match[]} allMatches
 * @param {{ stage: string, roundType: string, labelPrefix?: string }} options
 */
export function generateLevel2CrossoverPairings(s1Winners, s2Drops, allMatches, options) {
  const { stage, roundType, labelPrefix = 'L2-' } = options;
  const poolSize = 4;

  if (s1Winners.length !== poolSize || s2Drops.length !== poolSize) {
    throw new Error(
      `Level 2 crossover requires ${poolSize} S1 winners and ${poolSize} S2 drop-outs ` +
        `(got ${s1Winners.length} and ${s2Drops.length})`
    );
  }

  const s1Matches = allMatches.filter((m) => m.round_type === 'S1');
  const rankedS1 = rankEntrantsByCumulativeWins(s1Winners, s1Matches);

  const rankedS2 = [...s2Drops].sort((a, b) => {
    const rankA = Number.parseInt(a.advancement_source?.match(/S2-drop-(\d+)/)?.[1] ?? '999', 10);
    const rankB = Number.parseInt(b.advancement_source?.match(/S2-drop-(\d+)/)?.[1] ?? '999', 10);
    if (rankA !== rankB) return rankA - rankB;
    return a.id - b.id;
  });

  const crossoverSlots = [
    [0, 3],
    [1, 2],
    [2, 1],
    [3, 0],
  ];

  return crossoverSlots.map(([s1Idx, s2Idx], index) => ({
    label: `${labelPrefix}${index + 1}`,
    team1_id: rankedS1[s1Idx].id,
    team2_id: rankedS2[s2Idx].id,
    team1: rankedS1[s1Idx],
    team2: rankedS2[s2Idx],
    round_type: roundType,
    pyramid_stage: stage,
    stage_sequence: index,
    pool: null,
  }));
}

/**
 * Standard bracket pairings for 8 teams (seeds 1–8).
 * @param {StandingRow[]} seededStandings — sorted best to worst
 * @param {{ stage: string, roundType: string, labelPrefix?: string }} options
 */
export function generateSeededBracketPairings(seededStandings, options) {
  const { stage, roundType, labelPrefix = stage } = options;
  if (seededStandings.length !== 8) {
    throw new Error(`Seeded bracket requires 8 teams (got ${seededStandings.length})`);
  }

  const slots = [
    [0, 7],
    [3, 4],
    [1, 6],
    [2, 5],
  ];

  return slots.map(([a, b], index) => ({
    label: `${labelPrefix}${index + 1}`,
    team1_id: seededStandings[a].id,
    team2_id: seededStandings[b].id,
    team1: seededStandings[a],
    team2: seededStandings[b],
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
