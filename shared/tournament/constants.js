/** @typedef {import('./types.ts').TournamentFormat} TournamentFormat */

export const MIN_TEAMS_PER_GROUP = 2;
export const DEFAULT_QUALIFIERS_PER_GROUP = 2;
export const LEGACY_QUALIFIERS_PER_GROUP = 4;
export const ALLOWED_GROUP_COUNTS = [1, 2, 4, 8, 16];
/** Leagues with at most this many teams (or 14 players) use one round-robin group. */
export const SINGLE_GROUP_MAX_TEAMS = 6;
export const SINGLE_GROUP_MAX_PLAYERS = 14;

export const DEFAULT_GROUP_CONFIG = {
  format: 'groups',
  participantCount: 12,
  groupCount: 4,
  groupSize: 3,
  qualifiersPerGroup: DEFAULT_QUALIFIERS_PER_GROUP,
};

export const LEGACY_POOL_CONFIG = {
  format: 'pools-2',
  participantCount: 8,
  groupCount: 2,
  groupSize: 4,
  qualifiersPerGroup: LEGACY_QUALIFIERS_PER_GROUP,
};

/**
 * @param {number} index
 * @returns {string}
 */
export function getPoolId(index) {
  if (index < 0 || index > 25) {
    throw new Error(`Cannot generate pool id for index ${index} (max 26 groups A–Z)`);
  }
  return String.fromCharCode(65 + index);
}

/**
 * @param {number} groupCount
 * @returns {string[]}
 */
export function getPoolIds(groupCount) {
  return Array.from({ length: groupCount }, (_, i) => getPoolId(i));
}

/**
 * @param {number} n
 */
export function isEven(n) {
  return Number.isInteger(n) && n > 0 && n % 2 === 0;
}

/**
 * @param {number} n
 */
export function isPowerOfTwo(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * @param {number} teamCount
 * @param {number|null} [playerCount]
 */
export function shouldUseSingleGroupFormat(teamCount, playerCount = null) {
  if (!isEven(teamCount) || teamCount < 4) return false;
  const byTeams = teamCount <= SINGLE_GROUP_MAX_TEAMS;
  const byPlayers =
    playerCount != null && playerCount <= SINGLE_GROUP_MAX_PLAYERS;
  return byTeams || byPlayers;
}

/**
 * Knockout teams advancing from a single round-robin group.
 * @param {number} teamCount
 */
export function getSingleGroupKnockoutSlots(teamCount) {
  if (teamCount === 4) return 2;
  if (teamCount === 6) return 4;
  return 0;
}

/**
 * @param {number} participantCount
 * @param {number} groupCount
 * @param {import('./types.ts').TournamentFormat} [format]
 */
export function resolveQualifiersPerGroup(participantCount, groupCount, format = 'groups') {
  if (format === 'single-group' || groupCount === 1) {
    if (participantCount === 4) return 2;
    if (participantCount === 6) return 4;
    return 2;
  }
  if (format === 'pools-2') return LEGACY_QUALIFIERS_PER_GROUP;
  return DEFAULT_QUALIFIERS_PER_GROUP;
}

/**
 * @param {number} participantCount
 * @param {number} [qualifiersPerGroup]
 * @param {number|null} [playerCount]
 * @returns {number[]}
 */
export function getValidGroupCounts(
  participantCount,
  qualifiersPerGroup = DEFAULT_QUALIFIERS_PER_GROUP,
  playerCount = null
) {
  if (!isEven(participantCount) || participantCount < 4) {
    return [];
  }

  if (shouldUseSingleGroupFormat(participantCount, playerCount)) {
    return [1];
  }

  return ALLOWED_GROUP_COUNTS.filter((groupCount) => {
    if (groupCount === 1) return false;
    if (participantCount % groupCount !== 0) return false;
    const groupSize = participantCount / groupCount;
    if (groupSize < MIN_TEAMS_PER_GROUP) return false;
    const knockoutSlots = groupCount * qualifiersPerGroup;
    return isPowerOfTwo(knockoutSlots) && knockoutSlots >= 4;
  });
}

/**
 * @param {number} participantCount
 * @param {number} [qualifiersPerGroup]
 * @returns {number|null}
 */
export function suggestDefaultGroupCount(
  participantCount,
  qualifiersPerGroup = DEFAULT_QUALIFIERS_PER_GROUP,
  playerCount = null
) {
  if (shouldUseSingleGroupFormat(participantCount, playerCount)) {
    return 1;
  }
  const valid = getValidGroupCounts(participantCount, qualifiersPerGroup, playerCount);
  if (valid.length === 0) return null;
  if (valid.includes(4)) return 4;
  return valid[valid.length - 1];
}

/**
 * @param {number} participantCount
 * @param {number} groupCount
 * @param {number} [qualifiersPerGroup]
 * @returns {string[]}
 */
export function validateTournamentSetup(
  participantCount,
  groupCount,
  qualifiersPerGroup = DEFAULT_QUALIFIERS_PER_GROUP,
  playerCount = null
) {
  const errors = [];

  if (!Number.isInteger(participantCount) || participantCount < 4) {
    errors.push('Tournament requires at least 4 teams.');
  } else if (!isEven(participantCount)) {
    errors.push(`Tournament requires an even number of teams (got ${participantCount}). Odd counts are not supported.`);
  }

  if (!Number.isInteger(groupCount) || groupCount < 1) {
    errors.push('Tournament requires at least 1 group.');
  }

  if (groupCount === 1) {
    if (!shouldUseSingleGroupFormat(participantCount, playerCount)) {
      errors.push(
        `Single group is used for ${SINGLE_GROUP_MAX_TEAMS} teams or fewer (${SINGLE_GROUP_MAX_PLAYERS} players or fewer). With ${participantCount} teams, use multiple groups.`
      );
    } else {
      const slots = getSingleGroupKnockoutSlots(participantCount);
      if (slots !== 2 && slots !== 4) {
        errors.push(
          `Single-group knockout supports 4 teams (final only) or 6 teams (semi-finals). Got ${participantCount} teams.`
        );
      }
    }
    return errors;
  }

  if (groupCount < 2) {
    errors.push('Tournament requires at least 2 groups when not using single-group format.');
  }

  if (errors.length === 0 && participantCount % groupCount !== 0) {
    errors.push(`${participantCount} teams cannot be split evenly into ${groupCount} groups.`);
  }

  if (errors.length === 0) {
    const groupSize = participantCount / groupCount;
    if (groupSize < MIN_TEAMS_PER_GROUP) {
      errors.push(`Each group needs at least ${MIN_TEAMS_PER_GROUP} teams (would be ${groupSize} per group).`);
    }
  }

  if (errors.length === 0) {
    const knockoutSlots = groupCount * qualifiersPerGroup;
    if (!isPowerOfTwo(knockoutSlots) || knockoutSlots < 4) {
      errors.push(
        `${groupCount} groups × top ${qualifiersPerGroup} produces ${knockoutSlots} knockout slots, which does not form a valid bracket. Try 2, 4, 8, or 16 groups.`
      );
    }
  }

  if (
    errors.length === 0 &&
    !getValidGroupCounts(participantCount, qualifiersPerGroup, playerCount).includes(groupCount)
  ) {
    errors.push(`${groupCount} groups is not valid for ${participantCount} teams.`);
  }

  return errors;
}

/**
 * @param {TournamentFormat} format
 */
export function getTournamentConfig(format = 'groups') {
  if (format === 'pools-2') return { ...LEGACY_POOL_CONFIG, poolIds: getPoolIds(2) };
  return { ...DEFAULT_GROUP_CONFIG, poolIds: getPoolIds(DEFAULT_GROUP_CONFIG.groupCount) };
}

/**
 * @param {number} participantCount
 * @param {number} groupCount
 * @param {{ format?: TournamentFormat, qualifiersPerGroup?: number }} [options]
 */
export function buildConfigFromCounts(participantCount, groupCount, options = {}) {
  const playerCount = options.playerCount ?? null;
  const format =
    options.format ||
    (groupCount === 1
      ? 'single-group'
      : groupCount === 2 && options.legacy
        ? 'pools-2'
        : 'groups');
  const qualifiersPerGroup = resolveQualifiersPerGroup(participantCount, groupCount, format);

  const errors = validateTournamentSetup(
    participantCount,
    groupCount,
    qualifiersPerGroup,
    playerCount
  );
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  return {
    format,
    participantCount,
    groupCount,
    groupSize: participantCount / groupCount,
    qualifiersPerGroup,
    poolIds: getPoolIds(groupCount),
    isSingleGroup: format === 'single-group' || groupCount === 1,
  };
}

/**
 * Resolve config using all available teams (must be even).
 * @param {number} teamCount
 * @param {number} [groupCount]
 */
export function resolveTournamentConfig(teamCount, groupCount, playerCount = null) {
  if (!isEven(teamCount)) {
    throw new Error(`Tournament requires an even number of teams (got ${teamCount}). Odd counts are not supported.`);
  }

  const resolvedGroupCount =
    groupCount ?? suggestDefaultGroupCount(teamCount, DEFAULT_QUALIFIERS_PER_GROUP, playerCount);
  if (!resolvedGroupCount) {
    throw new Error(
      `Cannot form a valid tournament with ${teamCount} teams. Need an even count divisible into valid groups (min 2 teams per group).`
    );
  }

  return buildConfigFromCounts(teamCount, resolvedGroupCount, { playerCount });
}

/**
 * @param {number} teamCount
 * @param {number|null} [playerCount]
 */
export function getTournamentSetupOptions(teamCount, playerCount = null) {
  const even = isEven(teamCount);
  const singleGroup = even && shouldUseSingleGroupFormat(teamCount, playerCount);
  const validGroupCounts = even ? getValidGroupCounts(teamCount, DEFAULT_QUALIFIERS_PER_GROUP, playerCount) : [];
  const defaultGroupCount = even
    ? suggestDefaultGroupCount(teamCount, DEFAULT_QUALIFIERS_PER_GROUP, playerCount)
    : null;

  let suggestedConfig = null;
  if (defaultGroupCount) {
    try {
      suggestedConfig = buildConfigFromCounts(teamCount, defaultGroupCount, { playerCount });
    } catch {
      suggestedConfig = null;
    }
  }

  return {
    teamCount,
    playerCount,
    isValid: validGroupCounts.length > 0,
    isEven: even,
    isSingleGroup: singleGroup,
    validGroupCounts,
    defaultGroupCount,
    suggestedConfig,
    rejectionReason: !even
      ? `Odd team count (${teamCount}) is not supported. Add or remove one team.`
      : validGroupCounts.length === 0
        ? singleGroup
          ? `${teamCount} teams need 4 or 6 teams for single-group knockout (4 → final, 6 → semi-finals).`
          : `${teamCount} teams cannot be split into a valid knockout bracket.`
        : null,
  };
}
