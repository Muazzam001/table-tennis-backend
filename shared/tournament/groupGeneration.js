import { getPoolIds } from './constants.js';

/**
 * Fisher-Yates shuffle (optional seed for deterministic tests).
 * @template T
 * @param {T[]} items
 * @param {() => number} [random]
 * @returns {T[]}
 */
export function shuffleArray(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Randomly distribute participants into groups.
 * @param {import('./types.ts').Team[]} participants
 * @param {number} groupCount
 * @param {() => number} [random]
 * @returns {Record<string, import('./types.ts').Team[]>}
 */
export function distributeIntoGroups(participants, groupCount, random = Math.random) {
  if (participants.length % groupCount !== 0) {
    throw new Error(`Cannot split ${participants.length} participants into ${groupCount} equal groups`);
  }

  const poolIds = getPoolIds(groupCount);
  const shuffled = shuffleArray(participants, random);
  const groupSize = participants.length / groupCount;
  /** @type {Record<string, import('./types.ts').Team[]>} */
  const groups = {};

  for (let g = 0; g < groupCount; g += 1) {
    groups[poolIds[g]] = shuffled.slice(g * groupSize, (g + 1) * groupSize);
  }

  return groups;
}

/**
 * @param {import('./types.ts').Team[]} participants
 * @param {number} groupCount
 * @param {() => number} [random]
 */
export function createGroups(participants, groupCount, random = Math.random) {
  const grouped = distributeIntoGroups(participants, groupCount, random);
  return Object.entries(grouped).map(([id, groupTeams]) => ({
    id,
    teams: groupTeams,
  }));
}
