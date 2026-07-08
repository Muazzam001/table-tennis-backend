/** @typedef {import('../../types.ts').TierPyramidConfig} TierPyramidConfig */

import { isPowerOfTwo } from '../../constants.js';

/** Semi-finals always pair exactly four teams (two matches). */
export const PYRAMID_SEMIFINAL_TEAM_COUNT = 4;

/** Final and third-place matches are always two teams each. */
export const PYRAMID_FINALIST_COUNT = 2;

/** @type {TierPyramidConfig} */
export const DEFAULT_TIER_PYRAMID_CONFIG = {
  format: 'tier-pyramid',
  tier1Count: 8,
  tier2Count: 12,
  tier3Count: 12,
  s1GroupCount: 4,
  s1GroupSize: 6,
  s1QualifiersPerGroup: 4,
  l1bAdvanceCount: 4,
  s2AdvanceCount: 4,
  s2DropCount: 4,
  l2AdvanceCount: 4,
  l3AdvanceCount: 2,
  auto_advance: false,
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
    l1bAdvanceCount: Number(
      partial.l1bAdvanceCount ?? DEFAULT_TIER_PYRAMID_CONFIG.l1bAdvanceCount
    ),
    s2AdvanceCount: Number(
      partial.s2AdvanceCount ?? partial.s3AdvanceCount ?? DEFAULT_TIER_PYRAMID_CONFIG.s2AdvanceCount
    ),
    s2DropCount: Number(
      partial.s2DropCount ?? partial.s3DropCount ?? DEFAULT_TIER_PYRAMID_CONFIG.s2DropCount
    ),
    l2AdvanceCount: Number(partial.l2AdvanceCount ?? DEFAULT_TIER_PYRAMID_CONFIG.l2AdvanceCount),
    l3AdvanceCount: Number(partial.l3AdvanceCount ?? DEFAULT_TIER_PYRAMID_CONFIG.l3AdvanceCount),
    auto_advance: Boolean(partial.auto_advance ?? DEFAULT_TIER_PYRAMID_CONFIG.auto_advance),
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
  const normalized = normalizeTierPyramidConfig(config);
  const s1Entrants = normalized.tier2Count + normalized.tier3Count;
  const s1Matches = countS1RoundRobinMatches(normalized);
  const s2Matches = roundRobinMatchCount(normalized.tier1Count);
  const l1bEntrants = normalized.s1GroupCount * normalized.s1QualifiersPerGroup;
  let l1bMatches = 0;
  let l1bRoundWinners = l1bEntrants;
  while (l1bRoundWinners > normalized.l1bAdvanceCount) {
    const roundMatches = Math.floor(l1bRoundWinners / 2);
    if (roundMatches < 1) break;
    l1bMatches += roundMatches;
    l1bRoundWinners = roundMatches;
  }
  const l2Matches = normalized.l2AdvanceCount;
  const l3QfMatches = Math.min(normalized.s2AdvanceCount, normalized.l2AdvanceCount);
  const semifinalMatches = 2;
  const finalMatches = 1;
  const thirdPlaceMatches = 1;

  return {
    s1: s1Matches,
    s2: s2Matches,
    level1b: l1bMatches,
    level2: l2Matches,
    level3: l3QfMatches,
    semifinals: semifinalMatches,
    final: finalMatches,
    thirdPlace: thirdPlaceMatches,
    level1Total: s1Matches + s2Matches,
    total: s1Matches + s2Matches + l1bMatches + l2Matches + l3QfMatches + semifinalMatches + finalMatches + thirdPlaceMatches,
    s1Entrants,
    l1bEntrants,
    level2Entrants: normalized.l1bAdvanceCount + normalized.s2DropCount,
    level3Entrants: normalized.s2AdvanceCount + normalized.l2AdvanceCount,
    semifinalEntrants: PYRAMID_SEMIFINAL_TEAM_COUNT,
    s2AdvanceToL3: normalized.s2AdvanceCount,
    l2AdvanceToL3: normalized.l2AdvanceCount,
  };
}

/**
 * S1 round-robin total allowing uneven group sizes across pools.
 * @param {TierPyramidConfig} config
 */
export function countS1RoundRobinMatches(config) {
  const normalized = normalizeTierPyramidConfig(config);
  const s1Entrants = normalized.tier2Count + normalized.tier3Count;
  const baseSize = Math.floor(s1Entrants / normalized.s1GroupCount);
  const extraGroups = s1Entrants % normalized.s1GroupCount;
  let total = 0;
  for (let index = 0; index < normalized.s1GroupCount; index += 1) {
    const groupSize = baseSize + (index < extraGroups ? 1 : 0);
    total += roundRobinMatchCount(groupSize);
  }
  return total;
}

/**
 * Teams entering semi-finals after Level 3 crossover (larger of S2 qualifiers vs L2 winners).
 * @param {Partial<TierPyramidConfig>} partial
 */
export function getPyramidSemifinalEntrantCount(partial) {
  const config = normalizeTierPyramidConfig(partial);
  return Math.max(config.s2AdvanceCount, config.l2AdvanceCount);
}

/**
 * Non-negotiable knockout finale rules: SF = 4 teams, Final & Third Place = 2 teams.
 * @param {Partial<TierPyramidConfig>} partial
 * @returns {string[]}
 */
export function validatePyramidKnockoutFinaleRules(partial) {
  const config = normalizeTierPyramidConfig(partial);
  const errors = [];
  const semifinalTeams = getPyramidSemifinalEntrantCount(config);

  if (semifinalTeams !== PYRAMID_SEMIFINAL_TEAM_COUNT) {
    errors.push(
      `Semi-finals require exactly ${PYRAMID_SEMIFINAL_TEAM_COUNT} teams (max of S2 advance ${config.s2AdvanceCount} and L2 slots ${config.l2AdvanceCount} is ${semifinalTeams}).`
    );
  }

  if (config.l3AdvanceCount !== PYRAMID_FINALIST_COUNT) {
    errors.push(
      `Final requires exactly ${PYRAMID_FINALIST_COUNT} finalists (l3AdvanceCount must be ${PYRAMID_FINALIST_COUNT}).`
    );
  }

  return errors;
}

/**
 * Validate tier pyramid configuration math.
 * @param {Partial<TierPyramidConfig>} partial
 * @param {number|null} [participantCount]
 * @param {{ relaxed?: boolean }} [options]
 * @returns {string[]}
 */
export function validateTierPyramidConfig(partial, participantCount = null, options = {}) {
  const relaxed = options.relaxed !== false;
  const config = normalizeTierPyramidConfig(partial);
  const errors = [];
  const totalTiers = config.tier1Count + config.tier2Count + config.tier3Count;

  if (config.tier1Count < 2) {
    errors.push('Tier 1 requires at least 2 players.');
  }
  if (config.tier2Count < 1 || config.tier3Count < 1) {
    errors.push('Tier 2 and Tier 3 each require at least 1 player.');
  }

  const participantTotal =
    participantCount == null || participantCount === '' ? null : Number(participantCount);
  if (
    participantTotal != null &&
    Number.isFinite(participantTotal) &&
    totalTiers !== participantTotal
  ) {
    errors.push(
      `Tier counts (${config.tier1Count}+${config.tier2Count}+${config.tier3Count}=${totalTiers}) must equal participant count (${participantTotal}).`
    );
  }

  const s1Entrants = config.tier2Count + config.tier3Count;
  const minS1GroupSize = Math.ceil(s1Entrants / config.s1GroupCount);
  const s1Capacity = config.s1GroupCount * config.s1GroupSize;

  if (relaxed) {
    if (config.s1GroupSize < minS1GroupSize) {
      errors.push(
        `S1 group size (${config.s1GroupSize}) is too small for ${s1Entrants} entrants across ${config.s1GroupCount} groups (need ≥ ${minS1GroupSize}).`
      );
    }
    if (s1Entrants < config.s1GroupCount * 2) {
      errors.push(`S1 requires at least 2 entrants per group (${config.s1GroupCount} groups).`);
    }
  } else if (s1Entrants !== s1Capacity) {
    errors.push(
      `Tier 2 + Tier 3 (${s1Entrants}) must fill S1 groups (${config.s1GroupCount}×${config.s1GroupSize}=${s1Capacity}).`
    );
  }

  if (config.tier1Count !== config.s2AdvanceCount + config.s2DropCount) {
    errors.push(
      `Tier 1 count (${config.tier1Count}) must equal S2 advance (${config.s2AdvanceCount}) + drop (${config.s2DropCount}).`
    );
  }

  const l1bEntrants = config.s1GroupCount * config.s1QualifiersPerGroup;
  if (l1bEntrants < config.l1bAdvanceCount) {
    errors.push(
      `S1 qualifiers (${l1bEntrants}) must be at least Level 1B advance count (${config.l1bAdvanceCount}).`
    );
  }

  if (config.l1bAdvanceCount !== config.l2AdvanceCount) {
    errors.push(
      `Level 1B advance count (${config.l1bAdvanceCount}) must equal Level 2 advance slots (${config.l2AdvanceCount}).`
    );
  }

  if (config.s2DropCount !== config.l2AdvanceCount) {
    errors.push(
      `S2 drop count (${config.s2DropCount}) must equal Level 2 S2-loser slots (${config.l2AdvanceCount}).`
    );
  }

  const level2Entrants = config.l1bAdvanceCount + config.s2DropCount;
  if (relaxed) {
    if (level2Entrants < 2) {
      errors.push(`Level 2 requires at least 2 entrants (got ${level2Entrants}).`);
    }
  } else if (!isPowerOfTwo(level2Entrants) || level2Entrants < 4) {
    errors.push(`Level 2 requires a power-of-2 bracket size ≥ 4 (got ${level2Entrants}).`);
  }

  const level3Entrants = config.s2AdvanceCount + config.l2AdvanceCount;
  if (relaxed) {
    if (level3Entrants < PYRAMID_SEMIFINAL_TEAM_COUNT) {
      errors.push(
        `Level 3 requires at least ${PYRAMID_SEMIFINAL_TEAM_COUNT} entrants before semi-finals (got ${level3Entrants}).`
      );
    }
  } else if (!isPowerOfTwo(level3Entrants) || level3Entrants < 4) {
    errors.push(`Level 3 requires a power-of-2 bracket size ≥ 4 (got ${level3Entrants}).`);
  }

  errors.push(...validatePyramidKnockoutFinaleRules(config));

  if (config.s1GroupSize < 2) {
    errors.push('S1 group size must be at least 2.');
  }

  if (config.s1QualifiersPerGroup < 1) {
    errors.push('S1 must advance at least 1 player per group.');
  }

  if (!relaxed) {
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
  }

  return errors;
}

/**
 * @typedef {{ teamId: number, tier: 1 | 2 | 3 }} TierAssignment
 */

/**
 * @param {TierAssignment[]} tierAssignments
 */
export function countTiersFromAssignments(tierAssignments) {
  const counts = { tier1: 0, tier2: 0, tier3: 0 };
  for (const assignment of tierAssignments) {
    if (assignment.tier === 1) counts.tier1 += 1;
    else if (assignment.tier === 2) counts.tier2 += 1;
    else if (assignment.tier === 3) counts.tier3 += 1;
  }
  return counts;
}

/**
 * Resolve pyramid config from actual tier assignments (flexible roster).
 * @param {TierAssignment[]} tierAssignments
 * @param {Partial<TierPyramidConfig>} [savedConfig]
 */
export function resolveTierPyramidConfigForAssignments(tierAssignments, savedConfig = {}) {
  const tierCounts = countTiersFromAssignments(tierAssignments);
  const total = tierCounts.tier1 + tierCounts.tier2 + tierCounts.tier3;

  if (total === 0) {
    return {
      config: null,
      tierCounts,
      errors: ['Tier assignments are required for Tier Pyramid format.'],
      isDerived: false,
    };
  }

  const derived = deriveTierPyramidConfigFromTierCounts(tierCounts);
  if (derived) {
    return { config: derived, tierCounts, errors: [], isDerived: true };
  }

  const suggestions = suggestTierPyramidConfigs(tierCounts, { limit: 1 });
  const hint =
    suggestions.length > 0
      ? ` Closest valid split: ${suggestions[0].config.tier1Count}/${suggestions[0].config.tier2Count}/${suggestions[0].config.tier3Count}.`
      : '';

  return {
    config: null,
    tierCounts,
    errors: [
      `No valid Tier Pyramid configuration for ${tierCounts.tier1}/${tierCounts.tier2}/${tierCounts.tier3} (${total} players).${hint}`,
    ],
    isDerived: false,
  };
}

/**
 * Validate tier assignments against config.
 * @param {TierAssignment[]} tierAssignments
 * @param {Partial<TierPyramidConfig>} [partial]
 * @param {{ flexible?: boolean }} [options]
 * @returns {string[]}
 */
export function validateTierAssignments(tierAssignments, partial = {}, options = {}) {
  const flexible = options.flexible !== false;

  if (!Array.isArray(tierAssignments) || tierAssignments.length === 0) {
    return ['Tier assignments are required for Tier Pyramid format.'];
  }

  const errors = [];
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
    }
  }

  if (errors.length > 0) {
    return errors;
  }

  if (flexible) {
    return resolveTierPyramidConfigForAssignments(tierAssignments, partial).errors;
  }

  const config = normalizeTierPyramidConfig(partial);
  const counts = countTiersFromAssignments(tierAssignments);

  if (counts.tier1 !== config.tier1Count) {
    errors.push(`Expected ${config.tier1Count} Tier 1 players, got ${counts.tier1}.`);
  }
  if (counts.tier2 !== config.tier2Count) {
    errors.push(`Expected ${config.tier2Count} Tier 2 players, got ${counts.tier2}.`);
  }
  if (counts.tier3 !== config.tier3Count) {
    errors.push(`Expected ${config.tier3Count} Tier 3 players, got ${counts.tier3}.`);
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
export function validateTierPyramidSetup(participantCount, tierAssignments, partial = {}, options = {}) {
  const normalizedParticipantCount = Number(participantCount);
  const resolved = resolveTierPyramidConfigForAssignments(tierAssignments, partial);
  if (!resolved.config) {
    return resolved.errors;
  }

  return validateTierPyramidConfig(resolved.config, normalizedParticipantCount, options);
}

const S1_GROUP_COUNT_CANDIDATES = [1, 2, 3, 4, 6, 8];
const L2_ADVANCE_CANDIDATES = [1, 2, 4, 8, 16];

/**
 * @typedef {{ tier1: number, tier2: number, tier3: number }} TierCountShape
 */

/**
 * @param {TierCountShape} tierCounts
 * @param {Partial<TierPyramidConfig>} config
 */
function scoreDerivedConfig(tierCounts, config) {
  const total = tierCounts.tier1 + tierCounts.tier2 + tierCounts.tier3;
  const configTotal = config.tier1Count + config.tier2Count + config.tier3Count;
  let score = 0;
  if (configTotal === total) score += 100;
  score -= Math.abs(config.tier1Count - tierCounts.tier1) * 5;
  score -= Math.abs(config.tier2Count - tierCounts.tier2) * 3;
  score -= Math.abs(config.tier3Count - tierCounts.tier3) * 3;
  if (config.s1GroupSize >= 4 && config.s1GroupSize <= 8) score += 5;
  if (config.s1GroupCount === 4) score += 2;
  if (config.s1QualifiersPerGroup === DEFAULT_TIER_PYRAMID_CONFIG.s1QualifiersPerGroup) score += 2;
  if (
    config.tier1Count === DEFAULT_TIER_PYRAMID_CONFIG.tier1Count &&
    config.tier2Count === DEFAULT_TIER_PYRAMID_CONFIG.tier2Count &&
    config.tier3Count === DEFAULT_TIER_PYRAMID_CONFIG.tier3Count
  ) {
    score += 3;
  }
  return score;
}

/**
 * Build a candidate config from tier counts and structural parameters.
 * @param {TierCountShape} tierCounts
 * @param {number} groupCount
 * @param {number} qualifiersPerGroup
 */
function buildCandidateConfig(tierCounts, groupCount, qualifiersPerGroup) {
  const { tier1, tier2, tier3 } = tierCounts;
  const l1bEntrantCount = groupCount * qualifiersPerGroup;
  const l1bAdvanceCount = 4;
  const l2AdvanceCount = l1bAdvanceCount;
  const s2DropCount = l2AdvanceCount;
  if (tier1 <= s2DropCount) return null;

  const s2AdvanceCount = tier1 - s2DropCount;
  const s1Entrants = tier2 + tier3;
  const s1GroupSize = Math.ceil(s1Entrants / groupCount);

  return normalizeTierPyramidConfig({
    tier1Count: tier1,
    tier2Count: tier2,
    tier3Count: tier3,
    s1GroupCount: groupCount,
    s1GroupSize,
    s1QualifiersPerGroup: qualifiersPerGroup,
    l1bAdvanceCount,
    s2AdvanceCount,
    s2DropCount,
    l2AdvanceCount,
    l3AdvanceCount: 2,
  });
}

/**
 * Suggest valid pyramid configs for a roster shape (relaxed rules).
 * @param {TierCountShape} tierCounts
 * @param {{ relaxed?: boolean, limit?: number }} [options]
 */
export function suggestTierPyramidConfigs(tierCounts, options = {}) {
  const relaxed = options.relaxed !== false;
  const limit = options.limit ?? 5;
  const tier1 = Number(tierCounts.tier1 ?? 0);
  const tier2 = Number(tierCounts.tier2 ?? 0);
  const tier3 = Number(tierCounts.tier3 ?? 0);
  const total = tier1 + tier2 + tier3;
  if (total < 4 || tier1 < 2 || tier2 < 1 || tier3 < 1) {
    return [];
  }

  /** @type {{ config: TierPyramidConfig, score: number }[]} */
  const candidates = [];

  for (const groupCount of S1_GROUP_COUNT_CANDIDATES) {
    for (const qualifiersPerGroup of [1, 2, 4]) {
      const l1bEntrantCount = groupCount * qualifiersPerGroup;
      if (l1bEntrantCount < 4) continue;
      if (qualifiersPerGroup >= 2 && groupCount % 2 !== 0) continue;
      if (4 > tier1 - 1) continue;

      const config = buildCandidateConfig({ tier1, tier2, tier3 }, groupCount, qualifiersPerGroup);
      if (!config) continue;

      if (getPyramidSemifinalEntrantCount(config) !== PYRAMID_SEMIFINAL_TEAM_COUNT) continue;

      const errors = validateTierPyramidConfig(config, total, { relaxed });
      if (errors.length > 0) continue;

      candidates.push({
        config,
        score: scoreDerivedConfig({ tier1, tier2, tier3 }, config),
      });
    }
  }

  const unique = new Map();
  for (const entry of candidates) {
    const key = JSON.stringify(entry.config);
    const existing = unique.get(key);
    if (!existing || entry.score > existing.score) {
      unique.set(key, entry);
    }
  }

  return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Derive the best pyramid config for actual tier counts.
 * @param {TierCountShape} tierCounts
 * @param {{ relaxed?: boolean }} [options]
 * @returns {TierPyramidConfig|null}
 */
export function deriveTierPyramidConfigFromTierCounts(tierCounts, options = {}) {
  const suggestions = suggestTierPyramidConfigs(tierCounts, { ...options, limit: 1 });
  return suggestions[0]?.config ?? null;
}

/**
 * Derive config from tier assignment list.
 * @param {TierAssignment[]} tierAssignments
 * @param {{ relaxed?: boolean }} [options]
 */
export function deriveTierPyramidConfigFromAssignments(tierAssignments, options = {}) {
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const assignment of tierAssignments) {
    if (assignment.tier >= 1 && assignment.tier <= 3) {
      counts[assignment.tier] += 1;
    }
  }
  return deriveTierPyramidConfigFromTierCounts(
    { tier1: counts[1], tier2: counts[2], tier3: counts[3] },
    options
  );
}

/**
 * Setup options from roster tier counts (auto-derives config when needed).
 * @param {TierCountShape} tierCounts
 * @param {Partial<TierPyramidConfig>} [partial]
 * @param {{ relaxed?: boolean }} [options]
 */
export function getTierPyramidSetupFromRoster(tierCounts, partial = {}, options = {}) {
  const tier1 = Number(tierCounts.tier1 ?? 0);
  const tier2 = Number(tierCounts.tier2 ?? 0);
  const tier3 = Number(tierCounts.tier3 ?? 0);
  const teamCount = tier1 + tier2 + tier3;

  const tierAssignments = [];
  let id = 1;
  for (let i = 0; i < tier1; i += 1) tierAssignments.push({ teamId: id++, tier: 1 });
  for (let i = 0; i < tier2; i += 1) tierAssignments.push({ teamId: id++, tier: 2 });
  for (let i = 0; i < tier3; i += 1) tierAssignments.push({ teamId: id++, tier: 3 });

  const resolved =
    teamCount > 0
      ? resolveTierPyramidConfigForAssignments(tierAssignments, partial)
      : { config: null, errors: ['No roster tier counts provided.'], isDerived: false };

  const suggestions =
    resolved.config == null && teamCount > 0
      ? suggestTierPyramidConfigs({ tier1, tier2, tier3 }, options)
      : [];

  const config =
    resolved.config ??
    (suggestions.length > 0 ? suggestions[0].config : normalizeTierPyramidConfig(partial));

  if (!resolved.config && teamCount > 0) {
    return {
      format: 'tier-pyramid',
      teamCount,
      config: normalizeTierPyramidConfig(partial),
      isValid: false,
      isDefaultSize: false,
      isDerived: false,
      matchCounts: null,
      tierRequirements: { tier1, tier2, tier3 },
      suggestedConfigs: suggestions,
      errors: resolved.errors,
      rejectionReason: resolved.errors[0] ?? `No valid Tier Pyramid configuration for ${teamCount} players.`,
    };
  }

  const configErrors = validateTierPyramidConfig(config, teamCount, options);
  const matchCounts = countTierPyramidMatches(config);
  const defaultTotal =
    DEFAULT_TIER_PYRAMID_CONFIG.tier1Count +
    DEFAULT_TIER_PYRAMID_CONFIG.tier2Count +
    DEFAULT_TIER_PYRAMID_CONFIG.tier3Count;

  return {
    format: 'tier-pyramid',
    teamCount,
    config,
    isValid: configErrors.length === 0,
    isDefaultSize: teamCount === defaultTotal && configErrors.length === 0,
    isDerived: resolved.isDerived,
    matchCounts,
    tierRequirements: {
      tier1: tier1 || config.tier1Count,
      tier2: tier2 || config.tier2Count,
      tier3: tier3 || config.tier3Count,
    },
    suggestedConfigs: suggestions,
    errors: configErrors,
    rejectionReason: configErrors.length > 0 ? configErrors[0] : null,
    allowImbalancedTiers: config.tier2Count !== config.tier3Count,
    level2Entrants: matchCounts.level2Entrants,
    level3Entrants: matchCounts.level3Entrants,
    semifinalEntrants: matchCounts.semifinalEntrants,
    s2AdvanceToL3: matchCounts.s2AdvanceToL3,
  };
}

/**
 * Setup options payload for API/UI (Phase 1).
 * @param {number} teamCount
 * @param {Partial<TierPyramidConfig>} [partial]
 * @param {{ tierCounts?: TierCountShape, relaxed?: boolean }} [options]
 */
export function getTierPyramidSetupOptions(teamCount, partial = {}, options = {}) {
  if (options.tierCounts) {
    return getTierPyramidSetupFromRoster(options.tierCounts, partial, options);
  }

  const normalizedTeamCount = Number(teamCount);
  const savedConfig = normalizeTierPyramidConfig(partial);

  if (
    savedConfig.tier1Count + savedConfig.tier2Count + savedConfig.tier3Count !==
    normalizedTeamCount
  ) {
    return {
      format: 'tier-pyramid',
      teamCount: normalizedTeamCount,
      config: savedConfig,
      isValid: false,
      isDefaultSize: false,
      isDerived: false,
      matchCounts: countTierPyramidMatches(savedConfig),
      tierRequirements: {
        tier1: savedConfig.tier1Count,
        tier2: savedConfig.tier2Count,
        tier3: savedConfig.tier3Count,
      },
      suggestedConfigs: [],
      errors: [
        `Saved Tier Pyramid config expects ${savedConfig.tier1Count + savedConfig.tier2Count + savedConfig.tier3Count} teams (got ${normalizedTeamCount}). Assign tiers to derive a matching configuration.`,
      ],
      rejectionReason: `Saved config expects ${savedConfig.tier1Count + savedConfig.tier2Count + savedConfig.tier3Count} teams (got ${normalizedTeamCount}).`,
      allowImbalancedTiers: savedConfig.tier2Count !== savedConfig.tier3Count,
    };
  }

  const configErrors = validateTierPyramidConfig(savedConfig, normalizedTeamCount, options);
  const matchCounts = countTierPyramidMatches(savedConfig);

  const isDefaultSize =
    normalizedTeamCount ===
    DEFAULT_TIER_PYRAMID_CONFIG.tier1Count +
      DEFAULT_TIER_PYRAMID_CONFIG.tier2Count +
      DEFAULT_TIER_PYRAMID_CONFIG.tier3Count;

  return {
    format: 'tier-pyramid',
    teamCount: normalizedTeamCount,
    config: savedConfig,
    isValid: configErrors.length === 0,
    isDefaultSize,
    isDerived: false,
    matchCounts,
    tierRequirements: {
      tier1: savedConfig.tier1Count,
      tier2: savedConfig.tier2Count,
      tier3: savedConfig.tier3Count,
    },
    suggestedConfigs: [],
    errors: configErrors,
    rejectionReason: configErrors.length > 0 ? configErrors[0] : null,
    allowImbalancedTiers: savedConfig.tier2Count !== savedConfig.tier3Count,
    level2Entrants: matchCounts.level2Entrants,
    level3Entrants: matchCounts.level3Entrants,
    semifinalEntrants: matchCounts.semifinalEntrants,
    s2AdvanceToL3: matchCounts.s2AdvanceToL3,
  };
}
