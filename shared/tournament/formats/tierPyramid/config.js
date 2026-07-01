/** @typedef {import('../../types.ts').TierPyramidConfig} TierPyramidConfig */

import { isPowerOfTwo } from '../../constants.js';

/** @type {TierPyramidConfig} */
export const DEFAULT_TIER_PYRAMID_CONFIG = {
  format: 'tier-pyramid',
  tier1Count: 8,
  tier2Count: 12,
  tier3Count: 12,
  s1GroupCount: 4,
  s1GroupSize: 6,
  s1QualifiersPerGroup: 1,
  s2AdvanceCount: 4,
  s2DropCount: 4,
  l2AdvanceCount: 4,
  l3AdvanceCount: 2,
};

/**
 * @param {Partial<TierPyramidConfig>} [overrides]
 * @returns {TierPyramidConfig}
 */
export function getDefaultTierPyramidConfig(overrides = {}) {
  return normalizeTierPyramidConfig({ ...DEFAULT_TIER_PYRAMID_CONFIG, ...overrides });
}

/**
 * @param {Partial<TierPyramidConfig>} partial
 * @returns {TierPyramidConfig}
 */
export function normalizeTierPyramidConfig(partial) {
  return {
    format: 'tier-pyramid',
    tier1Count: Number(partial.tier1Count ?? DEFAULT_TIER_PYRAMID_CONFIG.tier1Count),
    tier2Count: Number(partial.tier2Count ?? DEFAULT_TIER_PYRAMID_CONFIG.tier2Count),
    tier3Count: Number(partial.tier3Count ?? DEFAULT_TIER_PYRAMID_CONFIG.tier3Count),
    s1GroupCount: Number(partial.s1GroupCount ?? DEFAULT_TIER_PYRAMID_CONFIG.s1GroupCount),
    s1GroupSize: Number(partial.s1GroupSize ?? DEFAULT_TIER_PYRAMID_CONFIG.s1GroupSize),
    s1QualifiersPerGroup: Number(
      partial.s1QualifiersPerGroup ?? DEFAULT_TIER_PYRAMID_CONFIG.s1QualifiersPerGroup
    ),
    s2AdvanceCount: Number(
      partial.s2AdvanceCount ?? partial.s3AdvanceCount ?? DEFAULT_TIER_PYRAMID_CONFIG.s2AdvanceCount
    ),
    s2DropCount: Number(
      partial.s2DropCount ?? partial.s3DropCount ?? DEFAULT_TIER_PYRAMID_CONFIG.s2DropCount
    ),
    l2AdvanceCount: Number(partial.l2AdvanceCount ?? DEFAULT_TIER_PYRAMID_CONFIG.l2AdvanceCount),
    l3AdvanceCount: Number(partial.l3AdvanceCount ?? DEFAULT_TIER_PYRAMID_CONFIG.l3AdvanceCount),
  };
}

/**
 * Round-robin match count for n players.
 * @param {number} n
 */
export function roundRobinMatchCount(n) {
  if (!Number.isInteger(n) || n < 2) return 0;
  return (n * (n - 1)) / 2;
}

/**
 * Estimated match counts per pyramid stage.
 * @param {TierPyramidConfig} config
 */
export function countTierPyramidMatches(config) {
  const s1Entrants = config.tier2Count + config.tier3Count;
  const s1Matches =
    config.s1GroupCount * roundRobinMatchCount(config.s1GroupSize);
  const s2Matches = roundRobinMatchCount(config.tier1Count);
  const l2Matches = config.l2AdvanceCount;
  const l3Matches = config.l2AdvanceCount + config.l3AdvanceCount;
  const finalMatches = 1;

  return {
    s1: s1Matches,
    s2: s2Matches,
    level2: l2Matches,
    level3: l3Matches,
    final: finalMatches,
    level1Total: s1Matches + s2Matches,
    total: s1Matches + s2Matches + l2Matches + l3Matches + finalMatches,
    s1Entrants,
    level2Entrants: config.s1GroupCount * config.s1QualifiersPerGroup + config.s2DropCount,
    level3Entrants: config.s2AdvanceCount + config.l2AdvanceCount,
  };
}

/**
 * Validate tier pyramid configuration math.
 * @param {Partial<TierPyramidConfig>} partial
 * @param {number} [participantCount]
 * @returns {string[]}
 */
export function validateTierPyramidConfig(partial, participantCount = null) {
  const config = normalizeTierPyramidConfig(partial);
  const errors = [];
  const totalTiers = config.tier1Count + config.tier2Count + config.tier3Count;

  if (config.tier1Count < 2) {
    errors.push('Tier 1 requires at least 2 players.');
  }
  if (config.tier2Count < 1 || config.tier3Count < 1) {
    errors.push('Tier 2 and Tier 3 each require at least 1 player.');
  }

  if (participantCount != null && totalTiers !== participantCount) {
    errors.push(
      `Tier counts (${config.tier1Count}+${config.tier2Count}+${config.tier3Count}=${totalTiers}) must equal participant count (${participantCount}).`
    );
  }

  const s1Capacity = config.s1GroupCount * config.s1GroupSize;
  const s1Entrants = config.tier2Count + config.tier3Count;
  if (s1Entrants !== s1Capacity) {
    errors.push(
      `Tier 2 + Tier 3 (${s1Entrants}) must fill S1 groups (${config.s1GroupCount}×${config.s1GroupSize}=${s1Capacity}).`
    );
  }

  if (config.tier1Count !== config.s2AdvanceCount + config.s2DropCount) {
    errors.push(
      `Tier 1 count (${config.tier1Count}) must equal S2 advance (${config.s2AdvanceCount}) + drop (${config.s2DropCount}).`
    );
  }

  const s1Qualifiers = config.s1GroupCount * config.s1QualifiersPerGroup;
  if (s1Qualifiers !== config.l2AdvanceCount) {
    errors.push(
      `S1 qualifiers (${s1Qualifiers}) must equal Level 2 advance slots from S1 (${config.l2AdvanceCount}).`
    );
  }

  if (config.s2DropCount !== config.l2AdvanceCount) {
    errors.push(
      `S2 drop count (${config.s2DropCount}) must equal Level 2 S2-loser slots (${config.l2AdvanceCount}).`
    );
  }

  const level2Entrants = s1Qualifiers + config.s2DropCount;
  if (!isPowerOfTwo(level2Entrants) || level2Entrants < 4) {
    errors.push(`Level 2 requires a power-of-2 bracket size ≥ 4 (got ${level2Entrants}).`);
  }

  const level3Entrants = config.s2AdvanceCount + config.l2AdvanceCount;
  if (!isPowerOfTwo(level3Entrants) || level3Entrants < 4) {
    errors.push(`Level 3 requires a power-of-2 bracket size ≥ 4 (got ${level3Entrants}).`);
  }

  if (config.l3AdvanceCount !== 2) {
    errors.push(`Level 3 must advance exactly 2 players to the Final (got ${config.l3AdvanceCount}).`);
  }

  if (config.s1GroupSize < 2) {
    errors.push('S1 group size must be at least 2.');
  }

  if (config.s1QualifiersPerGroup < 1) {
    errors.push('S1 must advance at least 1 player per group.');
  }

  if (config.tier2Count % config.s1GroupCount !== 0) {
    errors.push(
      `Tier 2 count (${config.tier2Count}) must be divisible by S1 group count (${config.s1GroupCount}) for balanced assignment.`
    );
  }

  if (config.tier3Count % config.s1GroupCount !== 0) {
    errors.push(
      `Tier 3 count (${config.tier3Count}) must be divisible by S1 group count (${config.s1GroupCount}) for balanced assignment.`
    );
  }

  const tier2PerGroup = config.tier2Count / config.s1GroupCount;
  const tier3PerGroup = config.tier3Count / config.s1GroupCount;
  if (tier2PerGroup !== tier3PerGroup) {
    errors.push(
      `Balanced S1 groups require equal Tier 2 and Tier 3 per group (got ${tier2PerGroup} vs ${tier3PerGroup}).`
    );
  }

  return errors;
}

/**
 * @typedef {{ teamId: number, tier: 1 | 2 | 3 }} TierAssignment
 */

/**
 * Validate tier assignments against config.
 * @param {TierAssignment[]} tierAssignments
 * @param {Partial<TierPyramidConfig>} [partial]
 * @returns {string[]}
 */
export function validateTierAssignments(tierAssignments, partial = {}) {
  const config = normalizeTierPyramidConfig(partial);
  const errors = [];

  if (!Array.isArray(tierAssignments) || tierAssignments.length === 0) {
    errors.push('Tier assignments are required for Tier Pyramid format.');
    return errors;
  }

  const counts = { 1: 0, 2: 0, 3: 0 };
  const seenTeamIds = new Set();

  for (const assignment of tierAssignments) {
    const { teamId, tier } = assignment;
    if (!Number.isInteger(teamId) || teamId < 1) {
      errors.push(`Invalid team id: ${teamId}`);
      continue;
    }
    if (seenTeamIds.has(teamId)) {
      errors.push(`Duplicate tier assignment for team ${teamId}.`);
    }
    seenTeamIds.add(teamId);

    if (![1, 2, 3].includes(tier)) {
      errors.push(`Team ${teamId} has invalid tier ${tier} (must be 1, 2, or 3).`);
      continue;
    }
    counts[tier]++;
  }

  if (counts[1] !== config.tier1Count) {
    errors.push(`Expected ${config.tier1Count} Tier 1 players, got ${counts[1]}.`);
  }
  if (counts[2] !== config.tier2Count) {
    errors.push(`Expected ${config.tier2Count} Tier 2 players, got ${counts[2]}.`);
  }
  if (counts[3] !== config.tier3Count) {
    errors.push(`Expected ${config.tier3Count} Tier 3 players, got ${counts[3]}.`);
  }

  return errors;
}

/**
 * Full setup validation for tier pyramid tournaments.
 * @param {number} participantCount
 * @param {TierAssignment[]} tierAssignments
 * @param {Partial<TierPyramidConfig>} [partial]
 * @returns {string[]}
 */
export function validateTierPyramidSetup(participantCount, tierAssignments, partial = {}) {
  const configErrors = validateTierPyramidConfig(partial, participantCount);
  const assignmentErrors = validateTierAssignments(tierAssignments, partial);
  return [...configErrors, ...assignmentErrors];
}

/**
 * Setup options payload for API/UI (Phase 1).
 * @param {number} teamCount
 * @param {Partial<TierPyramidConfig>} [partial]
 */
export function getTierPyramidSetupOptions(teamCount, partial = {}) {
  const config = normalizeTierPyramidConfig(partial);
  const configErrors = validateTierPyramidConfig(config, teamCount);
  const matchCounts = countTierPyramidMatches(config);

  const isDefaultSize =
    teamCount ===
    DEFAULT_TIER_PYRAMID_CONFIG.tier1Count +
      DEFAULT_TIER_PYRAMID_CONFIG.tier2Count +
      DEFAULT_TIER_PYRAMID_CONFIG.tier3Count;

  return {
    format: 'tier-pyramid',
    teamCount,
    config,
    isValid: configErrors.length === 0,
    isDefaultSize,
    matchCounts,
    tierRequirements: {
      tier1: config.tier1Count,
      tier2: config.tier2Count,
      tier3: config.tier3Count,
    },
    errors: configErrors,
    rejectionReason:
      configErrors.length > 0
        ? configErrors[0]
        : !isDefaultSize && teamCount !== config.tier1Count + config.tier2Count + config.tier3Count
          ? `Tier Pyramid with custom config expects ${config.tier1Count + config.tier2Count + config.tier3Count} teams (got ${teamCount}).`
          : null,
  };
}
