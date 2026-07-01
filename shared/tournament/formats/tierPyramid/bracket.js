/**
 * Bracket sizing and single-elimination pairing helpers for tier pyramid knockouts.
 */

import { PYRAMID_SEMIFINAL_TEAM_COUNT } from './config.js';

/**
 * @param {number} n
 */
export function nextPowerOfTwo(n) {
  if (!Number.isFinite(n) || n < 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard seeded bracket first-round pairings for n teams (n must be power of 2).
 * @param {number} n
 * @returns {[number, number][]}
 */
export function seededBracketSlots(n) {
  if (n < 2 || n % 2 !== 0) {
    throw new Error(`seededBracketSlots requires an even team count (got ${n})`);
  }
  if (n === 2) return [[0, 1]];

  const inner = seededBracketSlots(n / 2);
  const slots = [];
  for (const [a, b] of inner) {
    slots.push([a, n - 1 - b]);
    slots.push([n - 1 - a, b]);
  }
  return slots;
}

/**
 * Crossover pairings between two ranked pools of equal size.
 * @param {number} poolSize
 * @returns {[number, number][]}
 */
export function crossoverPairingSlots(poolSize) {
  if (poolSize < 1) return [];
  const slots = [];
  for (let i = 0; i < poolSize; i += 1) {
    slots.push([i, poolSize - 1 - i]);
  }
  return slots;
}

/**
 * First knockout round with optional byes for top seeds.
 * @template T
 * @param {T[]} rankedEntrants — best to worst
 * @returns {{ fixtures: { team1: T, team2: T, seedIndex: number }[], byeEntrants: T[], nextRoundCount: number }}
 */
export function buildFirstKnockoutRoundWithByes(rankedEntrants) {
  const n = rankedEntrants.length;
  if (n < 2) {
    throw new Error(`Knockout round requires at least 2 entrants (got ${n})`);
  }

  const bracketSize = nextPowerOfTwo(n);
  const byeCount = bracketSize - n;
  const byeEntrants = rankedEntrants.slice(0, byeCount);
  const playing = rankedEntrants.slice(byeCount);

  if (playing.length % 2 !== 0) {
    throw new Error(`Unexpected odd playing count after byes (${playing.length})`);
  }

  const slots = seededBracketSlots(playing.length);
  const fixtures = slots.map(([a, b], seedIndex) => ({
    team1: playing[a],
    team2: playing[b],
    seedIndex,
  }));

  return {
    fixtures,
    byeEntrants,
    nextRoundCount: byeEntrants.length + fixtures.length,
  };
}

/**
 * Pair two ranked pools using crossover; surplus entrants on the larger side receive byes.
 * @template T
 * @param {T[]} poolA
 * @param {T[]} poolB
 * @returns {{ fixtures: { team1: T, team2: T, seedIndex: number }[], byeEntrants: T[] }}
 */
export function buildCrossoverRoundWithByes(poolA, poolB) {
  if (poolA.length === 0 || poolB.length === 0) {
    throw new Error('Crossover requires at least one entrant in each pool');
  }

  if (poolA.length === poolB.length) {
    const slots = crossoverPairingSlots(poolA.length);
    return {
      fixtures: slots.map(([a, b], seedIndex) => ({
        team1: poolA[a],
        team2: poolB[b],
        seedIndex,
      })),
      byeEntrants: [],
    };
  }

  const [smaller, larger, smallerIsA] =
    poolA.length < poolB.length ? [poolA, poolB, true] : [poolB, poolA, false];
  const slots = crossoverPairingSlots(smaller.length);
  const fixtures = slots.map(([smallIdx, largeIdx], seedIndex) => {
    const team1 = smallerIsA ? poolA[smallIdx] : poolB[smallIdx];
    const team2 = smallerIsA ? poolB[largeIdx] : poolA[largeIdx];
    return { team1, team2, seedIndex };
  });

  const matchedLargeIndices = new Set(slots.map(([, largeIdx]) => largeIdx));
  const byeEntrants = larger.filter((_, index) => !matchedLargeIndices.has(index));

  return { fixtures, byeEntrants };
}

/**
 * Build semi-final fixtures from ordered first-round winners plus bye entrants.
 * @template {{ id: number, team_name?: string }}
 * @param {T[]} byeEntrants
 * @param {T[]} roundWinners — in stage_sequence order
 */
export function buildSemiFinalPairingsFromRound(byeEntrants, roundWinners) {
  const entrants = [...byeEntrants, ...roundWinners];
  if (entrants.length !== PYRAMID_SEMIFINAL_TEAM_COUNT) {
    throw new Error(
      `Semi-finals require exactly ${PYRAMID_SEMIFINAL_TEAM_COUNT} teams (got ${entrants.length}: ${byeEntrants.length} bye(s) + ${roundWinners.length} winner(s)).`
    );
  }

  return [
    { team1: entrants[0], team2: entrants[1], seedIndex: 0 },
    { team1: entrants[2], team2: entrants[3], seedIndex: 1 },
  ];
}
