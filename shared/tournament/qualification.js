import { calculateGroupStandings } from './standings.js';

/**
 * Get top N qualifiers from each group.
 * @param {Record<string, import('./types.ts').Team[]>} groups
 * @param {import('./types.ts').Match[]} matches
 * @param {number} qualifiersPerGroup
 * @returns {Record<string, import('./types.ts').StandingRow[]>}
 */
export function getQualifiedTeams(groups, matches, qualifiersPerGroup) {
  /** @type {Record<string, import('./types.ts').StandingRow[]>} */
  const qualified = {};

  for (const [poolId, teams] of Object.entries(groups)) {
    const poolMatches = matches.filter((m) => m.pool === poolId && m.round_type === 'Qualifying');
    const standings = calculateGroupStandings(teams, poolMatches);
    qualified[poolId] = standings.slice(0, qualifiersPerGroup);
  }

  return qualified;
}

/**
 * Full ranked standings for a pool (all teams, not just qualifiers).
 * @param {Record<string, import('./types.ts').Team[]>} groups
 * @param {import('./types.ts').Match[]} matches
 * @param {string} poolId
 */
export function getFullGroupStandings(groups, matches, poolId) {
  const teams = groups[poolId] || [];
  const poolMatches = matches.filter((m) => m.pool === poolId && m.round_type === 'Qualifying');
  return calculateGroupStandings(teams, poolMatches);
}

/**
 * @param {Record<string, import('./types.ts').StandingRow[]>} qualified
 */
export function isGroupStageComplete(groups, matches, qualifiersPerGroup) {
  for (const [poolId, teams] of Object.entries(groups)) {
    const poolMatches = matches.filter((m) => m.pool === poolId && m.round_type === 'Qualifying');
    if (poolMatches.length === 0) return false;
    if (!poolMatches.every((m) => m.status === 'Completed' && m.winner_team_id)) return false;

    const standings = calculateGroupStandings(teams, poolMatches);
    if (standings.length < qualifiersPerGroup) return false;
  }
  return true;
}
