/** @typedef {import('../../types.ts').TierPyramidConfig} TierPyramidConfig */
/** @typedef {import('./groupAssignment.js').TieredTeam} TieredTeam */
/** @typedef {import('./groupAssignment.js').BalancedS1Group} BalancedS1Group */

import { assignS1Groups, partitionTeamsByTier } from './groupAssignment.js';
import { normalizeTierPyramidConfig, validateTierPyramidSetup } from './config.js';
import { roundRobinMatchCount } from './config.js';
import { buildRoundRobinRounds } from '../../roundRobinScheduling.js';

/**
 * @typedef {{
 *   team1_id: number,
 *   team2_id: number,
 *   pool: string | null,
 *   round_type: string,
 *   pyramid_stage: 'S1' | 'S2' | 'L1B' | 'L2' | 'L3' | 'Final',
 *   stage_sequence?: number | null,
 * }} PyramidFixture
 */

/**
 * Round-robin fixtures in circle-method round order (one match per player per wave).
 * @param {TieredTeam[]} groupTeams
 * @param {{ round_type: string, pool: string | null, pyramid_stage: PyramidFixture['pyramid_stage'] }} options
 * @returns {PyramidFixture[]}
 */
export function generatePyramidRoundRobin(groupTeams, options) {
  const teamIds = groupTeams.map((t) => t.id);
  const rounds = buildRoundRobinRounds(teamIds);
  const fixtures = [];

  for (const round of rounds) {
    for (const pair of round) {
      fixtures.push({
        team1_id: pair.team1_id,
        team2_id: pair.team2_id,
        pool: options.pool,
        round_type: options.round_type,
        pyramid_stage: options.pyramid_stage,
        stage_sequence: null,
      });
    }
  }

  return fixtures;
}

/**
 * @param {BalancedS1Group[]} groups
 * @returns {PyramidFixture[]}
 */
export function generateS1Matches(groups) {
  const fixtures = [];
  for (const group of groups) {
    fixtures.push(
      ...generatePyramidRoundRobin(group.teams, {
        round_type: 'S1',
        pool: group.id,
        pyramid_stage: 'S1',
      })
    );
  }
  return fixtures;
}

/**
 * @param {TieredTeam[]} tier1Teams
 * @returns {PyramidFixture[]}
 */
export function generateS2Matches(tier1Teams) {
  return generatePyramidRoundRobin(tier1Teams, {
    round_type: 'S2',
    pool: null,
    pyramid_stage: 'S2',
  });
}

/**
 * @typedef {{ tierAssignments?: import('./config.js').TierAssignment[] }} Level1Options
 */

/**
 * Build S1 groups and all Level 1 (S1 + S2) fixtures.
 * @param {TieredTeam[]} participants — teams with `tier` set
 * @param {Partial<TierPyramidConfig>} [partialConfig]
 * @param {Level1Options & { random?: () => number }} [options]
 */
export function buildTierPyramidLevel1Fixtures(participants, partialConfig = {}, options = {}) {
  const config = normalizeTierPyramidConfig(partialConfig);
  const tierAssignments =
    options.tierAssignments ??
    participants.map((team) => ({
      teamId: team.id,
      tier: /** @type {1 | 2 | 3} */ (team.tier),
    }));

  const setupErrors = validateTierPyramidSetup(participants.length, tierAssignments, config);
  if (setupErrors.length > 0) {
    throw new Error(setupErrors.join(' '));
  }

  const { tier1, tier2, tier3 } = partitionTeamsByTier(participants);
  const s1Groups = assignS1Groups(tier2, tier3, config.s1GroupCount, options.random ?? Math.random);
  const s1Fixtures = generateS1Matches(s1Groups);
  const s2Fixtures = generateS2Matches(tier1);

  return {
    config,
    s1Groups,
    fixtures: [...s1Fixtures, ...s2Fixtures],
    matchCounts: {
      s1: s1Fixtures.length,
      s2: s2Fixtures.length,
      level1Total: s1Fixtures.length + s2Fixtures.length,
    },
    tierSummary: {
      tier1: tier1.map((t) => t.id),
      tier2: tier2.map((t) => t.id),
      tier3: tier3.map((t) => t.id),
    },
  };
}

/**
 * @param {Partial<TierPyramidConfig>} [partialConfig]
 */
export function countLevel1Matches(partialConfig = {}) {
  const config = normalizeTierPyramidConfig(partialConfig);
  const s1Matches = config.s1GroupCount * roundRobinMatchCount(config.s1GroupSize);
  const s2Matches = roundRobinMatchCount(config.tier1Count);
  return {
    s1: s1Matches,
    s2: s2Matches,
    level1Total: s1Matches + s2Matches,
  };
}
