/** DB round_type values that share a single set-count config key */
const PYRAMID_ROUND_TO_SET_CONFIG = {
  S1: 'Level 1',
  S2: 'Level 1',
};

export const DEFAULT_SET_COUNTS = {
  Qualifying: 3,
  'Quarter Final': 5,
  'Semi Final': 7,
  'Third Place': 9,
  'Level 1': 3,
  'Level 1B': 3,
  'Level 2': 5,
  'Level 3': 7,
  Final: 9,
};

/**
 * @param {string} roundType
 * @returns {string}
 */
export function resolveSetConfigKey(roundType) {
  return PYRAMID_ROUND_TO_SET_CONFIG[roundType] || roundType;
}

const normalizeToOdd = (value, fallback) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  if (parsed % 2 === 0) return parsed + 1;
  return parsed;
};

/**
 * Clamp stored set counts to valid odd values for every configured round key.
 * @param {Record<string, number> | null | undefined} sets
 */
export function sanitizeSetCounts(sets) {
  return Object.keys(DEFAULT_SET_COUNTS).reduce((acc, roundType) => {
    acc[roundType] = normalizeToOdd(sets?.[roundType], DEFAULT_SET_COUNTS[roundType]);
    return acc;
  }, {});
}

/**
 * @param {string} roundType
 * @param {{ sets?: Record<string, number> } | Record<string, number> | null} [setConfig]
 * @returns {number}
 */
export function getSetCountForRound(roundType, setConfig = null) {
  const key = resolveSetConfigKey(roundType);
  const sets = setConfig?.sets || setConfig || DEFAULT_SET_COUNTS;
  const raw = sets[key] ?? DEFAULT_SET_COUNTS[key] ?? 3;
  return normalizeToOdd(raw, DEFAULT_SET_COUNTS[key] ?? 3);
}
