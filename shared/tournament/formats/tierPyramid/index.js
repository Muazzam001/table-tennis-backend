/**
 * Tier Pyramid format strategy (Phase 1: config + validation skeleton).
 * Match generation and advancement are added in later phases.
 */

import {
  DEFAULT_TIER_PYRAMID_CONFIG,
  PYRAMID_SEMIFINAL_TEAM_COUNT,
  PYRAMID_FINALIST_COUNT,
  getPyramidSemifinalEntrantCount,
  validatePyramidKnockoutFinaleRules,
  getDefaultTierPyramidConfig,
  normalizeTierPyramidConfig,
  validateTierPyramidConfig,
  validateTierAssignments,
  validateTierPyramidSetup,
  getTierPyramidSetupOptions,
  countTierPyramidMatches,
  countS1RoundRobinMatches,
  roundRobinMatchCount,
  suggestTierPyramidConfigs,
  deriveTierPyramidConfigFromTierCounts,
  deriveTierPyramidConfigFromAssignments,
  resolveTierPyramidConfigForAssignments,
  countTiersFromAssignments,
  getTierPyramidSetupFromRoster,
} from './config.js';
import {
  buildLevel2Fixtures,
  buildLevel3QuarterFinalFixtures,
  buildLevel3FirstRoundPlan,
  buildLevel3SemiFinalFixtures,
  buildFinalFixture,
  buildThirdPlaceFixture,
  tryBuildThirdPlaceFixture,
  computeS1Advancement,
  computeS2Advancement,
  computeLevel1BAdvancement,
  computeLevel1BRound1Advancement,
  buildLevel1BRound2Fixtures,
  getLevel1BRoundMatches,
  getLevel1BRoundCount,
  isLevel1BRound1Complete,
  needsLevel1BRound2,
  computeBracketStageAdvancement,
  isPyramidStageComplete,
  isS1Complete,
  isLevel1BComplete,
  isLevel1Complete,
  hasRoundType,
  hasAdvancementWithPrefix,
  deriveLevel1bStatus,
  derivePyramidTournamentStatus,
  getS1GroupsFromMatches,
  getLevel1BEntrants,
  buildS1QualifierSourceMap,
  buildLevel1BStandings,
  buildLevel1BFixtures,
} from './advancement.js';
import { buildTierPyramidLevel1Fixtures } from './matchGeneration.js';
import {
  rankEntrantsByCumulativeWins,
  generateSeededBracketPairings,
  getOrderedBracketResults,
} from './seeding.js';
import {
  buildPyramidRankingsBundle,
  buildS1OverallStandings,
  buildS2OverallStandings,
  buildLevel1Standings,
  buildLevel2Standings,
  buildLevel3Standings,
  buildPyramidFlowRankings,
  getLevel2Entrants,
  getLevel3Entrants,
  getPyramidFlowExit,
  getRoundTypeEntrants,
} from './rankings.js';

export const TIER_PYRAMID_FORMAT_KEY = 'tier-pyramid';

/** @type {import('../registry.js').FormatStrategy} */
export const tierPyramidStrategy = {
  key: TIER_PYRAMID_FORMAT_KEY,

  getDefaultConfig() {
    return getDefaultTierPyramidConfig();
  },

  normalizeConfig(partial) {
    return normalizeTierPyramidConfig(partial);
  },

  /**
   * @param {number} participantCount
   * @param {{ tierAssignments?: import('./config.js').TierAssignment[], config?: object }} [options]
   * @returns {string[]}
   */
  validateSetup(participantCount, options = {}) {
    const config = normalizeTierPyramidConfig(options.config ?? {});
    if (options.tierAssignments?.length) {
      return validateTierPyramidSetup(participantCount, options.tierAssignments, config);
    }
    return validateTierPyramidConfig(config, participantCount);
  },

  getSetupOptions(teamCount, options = {}) {
    return getTierPyramidSetupOptions(teamCount, options.config ?? {});
  },

  countMatches(config) {
    return countTierPyramidMatches(normalizeTierPyramidConfig(config));
  },

  /**
   * @param {import('./groupAssignment.js').TieredTeam[]} participants
   * @param {object} [options]
   */
  buildLevel1Fixtures(participants, options = {}) {
    return buildTierPyramidLevel1Fixtures(participants, options.config ?? {}, options);
  },

  deriveStatus(matches, options = {}) {
    return derivePyramidTournamentStatus(matches, options.config ?? {});
  },
};

export {
  DEFAULT_TIER_PYRAMID_CONFIG,
  PYRAMID_SEMIFINAL_TEAM_COUNT,
  PYRAMID_FINALIST_COUNT,
  getPyramidSemifinalEntrantCount,
  validatePyramidKnockoutFinaleRules,
  getDefaultTierPyramidConfig,
  normalizeTierPyramidConfig,
  validateTierPyramidConfig,
  validateTierAssignments,
  validateTierPyramidSetup,
  getTierPyramidSetupOptions,
  countTierPyramidMatches,
  countS1RoundRobinMatches,
  roundRobinMatchCount,
  suggestTierPyramidConfigs,
  deriveTierPyramidConfigFromTierCounts,
  deriveTierPyramidConfigFromAssignments,
  resolveTierPyramidConfigForAssignments,
  countTiersFromAssignments,
  getTierPyramidSetupFromRoster,
};
export {
  assignBalancedS1Groups,
  assignImbalancedS1Groups,
  assignS1Groups,
  partitionTeamsByTier,
  serpentineDistribute,
} from './groupAssignment.js';
export {
  buildTierPyramidLevel1Fixtures,
  generateS1Matches,
  generateS2Matches,
  generatePyramidRoundRobin,
  countLevel1Matches,
} from './matchGeneration.js';
export {
  computeS1Advancement,
  computeS2Advancement,
  computeLevel1BAdvancement,
  computeLevel1BRound1Advancement,
  buildLevel1BRound2Fixtures,
  getLevel1BRoundMatches,
  getLevel1BRoundCount,
  isLevel1BRound1Complete,
  needsLevel1BRound2,
  computeBracketStageAdvancement,
  isPyramidStageComplete,
  isS1Complete,
  isLevel1BComplete,
  isLevel1Complete,
  hasRoundType,
  hasAdvancementWithPrefix,
  deriveLevel1bStatus,
  derivePyramidTournamentStatus,
  getS1GroupsFromMatches,
  getLevel1BEntrants,
  buildS1QualifierSourceMap,
  buildLevel1BStandings,
  buildLevel1BFixtures,
  buildLevel2Fixtures,
  buildLevel3QuarterFinalFixtures,
  buildLevel3FirstRoundPlan,
  buildLevel3SemiFinalFixtures,
  buildFinalFixture,
  buildThirdPlaceFixture,
  tryBuildThirdPlaceFixture,
} from './advancement.js';
export {
  buildCrossoverRoundWithByes,
  buildFirstKnockoutRoundWithByes,
  buildSemiFinalPairingsFromRound,
  crossoverPairingSlots,
  nextPowerOfTwo,
  seededBracketSlots,
} from './bracket.js';
export {
  rankEntrantsByCumulativeWins,
  rankEntrantsByRoundTypes,
  generateSeededBracketPairings,
  getOrderedBracketResults,
  generateLevel2CrossoverPairings,
  generateLevel3CrossoverPairings,
  buildLevel3CrossoverRound,
  buildPyramidCrossoverRound,
  buildLevel1BPairings,
  partitionLevel2Entrants,
  partitionLevel3Entrants,
} from './seeding.js';
export {
  buildPyramidRankingsBundle,
  buildS1OverallStandings,
  buildS2OverallStandings,
  buildLevel1Standings,
  buildLevel2Standings,
  buildLevel3Standings,
  buildPyramidFlowRankings,
  getLevel2Entrants,
  getLevel3Entrants,
  getPyramidFlowExit,
  getRoundTypeEntrants,
} from './rankings.js';
export {
  isPyramidLevel3Match,
  isPyramidSemiFinalMatch,
  isLegacyLevel3SemiFinalMatch,
  isLevel3QuarterFinalMatch,
  isLevel3SemiFinalMatch,
  getLevel3Matches,
  getLevel3QuarterFinalMatches,
  getPyramidSemiFinalMatches,
  filterMatchesForPyramidRound,
} from './roundFilters.js';
export {
  buildPyramidKnockoutSlotPlanFromDivision,
  computePyramidKnockoutSlotPlan,
  deriveCourtConfigFromMatches,
  findLatestScheduledMatch,
  resolvePyramidMatchSchedule,
} from './scheduling.js';
