/**
 * Generate round-robin fixtures within a group.
 * Every participant plays every other participant exactly once.
 * @param {import('./types.ts').Team[]} groupTeams
 * @param {string} poolId
 * @returns {{ team1_id: number, team2_id: number, pool: string, round_type: string }[]}
 */
export function generateRoundRobinMatches(groupTeams, poolId) {
  const fixtures = [];
  for (let i = 0; i < groupTeams.length; i += 1) {
    for (let j = i + 1; j < groupTeams.length; j += 1) {
      fixtures.push({
        team1_id: groupTeams[i].id,
        team2_id: groupTeams[j].id,
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
