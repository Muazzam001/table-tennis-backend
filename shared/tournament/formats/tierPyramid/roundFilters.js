/** @typedef {import('../../types.ts').Match} Match */

/**
 * @param {number | string | null | undefined} stageSequence
 */
function normalizedStageSequence(stageSequence) {
  const value = Number(stageSequence);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Older data stored pyramid semi-finals as Level 3 with stage_sequence >= 4.
 * @param {Match} match
 */
export function isLegacyLevel3SemiFinalMatch(match) {
  return match.round_type === 'Level 3' && normalizedStageSequence(match.stage_sequence) >= 4;
}

/**
 * Tier-pyramid Level 3 (8 → 4 crossover). Same role as bracket quarter-finals.
 * @param {Match} match
 */
export function isPyramidLevel3Match(match) {
  return match.round_type === 'Level 3' && !isLegacyLevel3SemiFinalMatch(match);
}

/**
 * Tier-pyramid semi-finals (4 → 2). Uses the shared Semi Final round type.
 * @param {Match} match
 */
export function isPyramidSemiFinalMatch(match) {
  return match.round_type === 'Semi Final' || isLegacyLevel3SemiFinalMatch(match);
}

/** @deprecated Use isPyramidLevel3Match */
export const isLevel3QuarterFinalMatch = isPyramidLevel3Match;

/** @deprecated Use isPyramidSemiFinalMatch */
export const isLevel3SemiFinalMatch = isPyramidSemiFinalMatch;

/**
 * @param {Match[]} matches
 */
export function getLevel3Matches(matches) {
  return matches.filter(isPyramidLevel3Match);
}

/** @deprecated Use getLevel3Matches */
export const getLevel3QuarterFinalMatches = getLevel3Matches;

/**
 * @param {Match[]} matches
 */
export function getPyramidSemiFinalMatches(matches) {
  return matches.filter(isPyramidSemiFinalMatch);
}

/**
 * Filter division matches for a pyramid UI round tab.
 * Mirrors PYRAMID_ROUND_ORDER: S1/S2 → Level 1 tab; Level 2; Level 3; Semi Final; Third Place; Final.
 * @param {Match[]} matches
 * @param {string} roundType
 */
export function filterMatchesForPyramidRound(matches, roundType) {
  if (roundType === 'Level 1') {
    return matches.filter((m) => m.round_type === 'S1' || m.round_type === 'S2');
  }
  if (roundType === 'Level 3') {
    return getLevel3Matches(matches);
  }
  if (roundType === 'Semi Final') {
    return getPyramidSemiFinalMatches(matches);
  }
  if (roundType === 'Third Place') {
    return matches.filter((m) => m.round_type === 'Third Place');
  }
  if (roundType === 'Final') {
    return matches.filter((m) => m.round_type === 'Final');
  }
  return matches.filter((m) => m.round_type === roundType);
}
