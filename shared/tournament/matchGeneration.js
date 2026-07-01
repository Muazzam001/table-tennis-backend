import { buildRoundRobinRounds } from './roundRobinScheduling.js';

/**
 * Generate round-robin fixtures within a group (circle-method round order).
 * @param {import('./types.ts').Team[]} groupTeams
 * @param {string} poolId
 * @returns {{ team1_id: number, team2_id: number, pool: string, round_type: string }[]}
 */
export function generateRoundRobinMatches(groupTeams, poolId) {
  const teamIds = groupTeams.map((t) => t.id);
  const rounds = buildRoundRobinRounds(teamIds);
  const fixtures = [];

  for (const round of rounds) {
    for (const pair of round) {
      fixtures.push({
        team1_id: pair.team1_id,
        team2_id: pair.team2_id,
        pool: poolId,
        round_type: 'Qualifying',
      });
    }
  }

  return fixtures;
}

/**
 * @param {Record<string, import('./types.ts').Team[]>} groups
 */
export function generateGroupStageMatches(groups) {
  const matches = [];
  for (const [poolId, teams] of Object.entries(groups)) {
    matches.push(...generateRoundRobinMatches(teams, poolId));
  }
  return matches;
}

/**
 * Total qualifying fixtures for an even split into equal groups (full round-robin per group).
 * @param {number} teamCount
 * @param {number} groupCount
 */
export function countQualifyingMatches(teamCount, groupCount) {
  if (!Number.isInteger(teamCount) || !Number.isInteger(groupCount) || groupCount < 1) {
    return 0;
  }
  if (teamCount % groupCount !== 0) return 0;
  const groupSize = teamCount / groupCount;
  const perGroup = (groupSize * (groupSize - 1)) / 2;
  return groupCount * perGroup;
}
