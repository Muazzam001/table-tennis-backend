import { getPoolIds } from '../../constants.js';
import { shuffleArray } from '../../groupGeneration.js';

/**
 * Serpentine distribution across groups (1→A, 2→B, …, then reverse).
 * @template T
 * @param {T[]} items
 * @param {number} groupCount
 * @returns {T[][]}
 */
export function serpentineDistribute(items, groupCount) {
  if (groupCount < 1) {
    throw new Error('groupCount must be at least 1');
  }
  if (items.length % groupCount !== 0) {
    throw new Error(`Cannot serpentine ${items.length} items into ${groupCount} equal groups`);
  }

  /** @type {T[][]} */
  const groups = Array.from({ length: groupCount }, () => []);

  for (let i = 0; i < items.length; i += 1) {
    const posInRound = i % groupCount;
    const snakeRound = Math.floor(i / groupCount);
    const groupIndex =
      snakeRound % 2 === 0 ? posInRound : groupCount - 1 - posInRound;
    groups[groupIndex].push(items[i]);
  }

  return groups;
}

/**
 * @typedef {import('../../types.ts').Team & { tier?: number }} TieredTeam
 */

/**
 * @typedef {{ id: string, teams: TieredTeam[], tier2Teams: TieredTeam[], tier3Teams: TieredTeam[] }} BalancedS1Group
 */

/**
 * Balance Tier 2 and Tier 3 players across S1 groups (e.g. 3+3 per group).
 * @param {TieredTeam[]} tier2Teams
 * @param {TieredTeam[]} tier3Teams
 * @param {number} groupCount
 * @param {() => number} [random]
 * @returns {BalancedS1Group[]}
 */
export function assignBalancedS1Groups(tier2Teams, tier3Teams, groupCount, random = Math.random) {
  if (tier2Teams.length % groupCount !== 0) {
    throw new Error(
      `Tier 2 count (${tier2Teams.length}) must be divisible by group count (${groupCount})`
    );
  }
  if (tier3Teams.length % groupCount !== 0) {
    throw new Error(
      `Tier 3 count (${tier3Teams.length}) must be divisible by group count (${groupCount})`
    );
  }

  const tier2PerGroup = tier2Teams.length / groupCount;
  const tier3PerGroup = tier3Teams.length / groupCount;
  if (tier2PerGroup !== tier3PerGroup) {
    throw new Error(
      `Balanced groups require equal Tier 2 and Tier 3 per group (got ${tier2PerGroup} vs ${tier3PerGroup})`
    );
  }

  const poolIds = getPoolIds(groupCount);
  const shuffledT2 = shuffleArray(tier2Teams, random);
  const shuffledT3 = shuffleArray(tier3Teams, random);
  const t2Groups = serpentineDistribute(shuffledT2, groupCount);
  const t3Groups = serpentineDistribute(shuffledT3, groupCount);

  return poolIds.map((id, index) => ({
    id,
    teams: [...t2Groups[index], ...t3Groups[index]],
    tier2Teams: t2Groups[index],
    tier3Teams: t3Groups[index],
  }));
}

/**
 * Split entrants by tier field.
 * @param {TieredTeam[]} teams
 */
export function partitionTeamsByTier(teams) {
  const tier1 = [];
  const tier2 = [];
  const tier3 = [];

  for (const team of teams) {
    if (team.tier === 1) tier1.push(team);
    else if (team.tier === 2) tier2.push(team);
    else if (team.tier === 3) tier3.push(team);
  }

  return { tier1, tier2, tier3 };
}
