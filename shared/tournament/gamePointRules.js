/** @typedef {'knockout' | 'shutout' | 'high' | 'normal' | 'narrow'} SetMarginTier */

export const GAME_POINT_OPTIONS = [11, 21];
export const DEFAULT_GAME_POINTS_PER_SET = 11;

/**
 * @param {unknown} value
 * @returns {11 | 21}
 */
export function normalizeGamePointsPerSet(value) {
  return Number(value) === 21 ? 21 : 11;
}

/**
 * @param {11 | 21} [format]
 */
export function getGamePointRules(format = DEFAULT_GAME_POINTS_PER_SET) {
  const gamePoints = normalizeGamePointsPerSet(format);

  if (gamePoints === 21) {
    return {
      gamePoints,
      pointsToWin: 21,
      deuceThreshold: 20,
      maxSetScore: 42,
      knockoutPatterns: [
        { minWinner: 7, maxLoser: 0 },
        { minWinner: 11, maxLoser: 1 },
      ],
      shutoutLoserMax: 3,
      highMarginMin: 8,
      normalMarginMin: 4,
    };
  }

  return {
    gamePoints: 11,
    pointsToWin: 11,
    deuceThreshold: 10,
    maxSetScore: 22,
    knockoutPatterns: [
      { minWinner: 6, maxLoser: 0 },
      { minWinner: 9, maxLoser: 1 },
    ],
    shutoutLoserMax: 3,
    highMarginMin: 5,
    normalMarginMin: 3,
  };
}

/**
 * @param {number} winnerPoints
 * @param {number} loserPoints
 * @param {11 | 21} [format]
 */
export function isKnockoutSet(winnerPoints, loserPoints, format = DEFAULT_GAME_POINTS_PER_SET) {
  const rules = getGamePointRules(format);
  return rules.knockoutPatterns.some(
    (pattern) => winnerPoints >= pattern.minWinner && loserPoints <= pattern.maxLoser
  );
}

/**
 * Classify within-set margin for display / tie-break weighting.
 * @param {number} winnerPoints
 * @param {number} loserPoints
 * @param {11 | 21} [format]
 * @returns {SetMarginTier}
 */
export function classifySetMargin(winnerPoints, loserPoints, format = DEFAULT_GAME_POINTS_PER_SET) {
  if (isKnockoutSet(winnerPoints, loserPoints, format)) return 'knockout';

  const margin = winnerPoints - loserPoints;
  const rules = getGamePointRules(format);

  if (loserPoints <= rules.shutoutLoserMax) return 'shutout';
  if (margin >= rules.highMarginMin) return 'high';
  if (margin >= rules.normalMarginMin) return 'normal';
  return 'narrow';
}

/** @param {SetMarginTier} tier */
export function getSetMarginLabel(tier) {
  const labels = {
    knockout: 'Knockout win',
    shutout: 'Shutout win',
    high: 'High-margin win',
    normal: 'Normal win',
    narrow: 'Narrow win',
  };
  return labels[tier] || null;
}

/** @type {Record<SetMarginTier, number>} */
export const SET_MARGIN_QUALITY_SCORES = {
  knockout: 5,
  shutout: 4,
  high: 3,
  normal: 2,
  narrow: 1,
};

/**
 * @param {number} team1Points
 * @param {number} team2Points
 * @param {11 | 21} [format]
 */
export function isValidSetGameScore(team1Points, team2Points, format = DEFAULT_GAME_POINTS_PER_SET) {
  const rules = getGamePointRules(format);
  const team1 = Number(team1Points);
  const team2 = Number(team2Points);

  if (!Number.isFinite(team1) || !Number.isFinite(team2) || team1 < 0 || team2 < 0) {
    return false;
  }
  if (team1 === team2) return false;
  if (team1 > rules.maxSetScore || team2 > rules.maxSetScore) return false;

  const winner = Math.max(team1, team2);
  const loser = Math.min(team1, team2);

  // Knockout / early-finish sets (e.g. 6-0, 9-1) end before the winner reaches the
  // full game points, so they bypass the reach-the-target and lead-by-2 checks.
  if (isKnockoutSet(winner, loser, format)) return true;

  if (winner < rules.pointsToWin) return false;
  if (winner - loser < 2) return false;

  return true;
}

/**
 * Sanitize a numeric text field: digits only, clamped to min/max.
 * @param {string | number | null | undefined} raw
 * @param {{ min?: number, max?: number, allowEmpty?: boolean }} [options]
 */
export function sanitizeIntegerInput(raw, options = {}) {
  const { min = 0, max, allowEmpty = true } = options;

  if (raw === '' || raw == null) {
    return allowEmpty ? '' : String(min);
  }

  const digitsOnly = String(raw).replace(/\D/g, '');
  if (digitsOnly === '') {
    return allowEmpty ? '' : String(min);
  }

  let value = parseInt(digitsOnly, 10);
  if (Number.isNaN(value) || value < min) {
    value = min;
  }
  if (max != null && value > max) {
    value = max;
  }

  return String(value);
}

/**
 * Human-readable validation error for a set's game score.
 * @param {number} team1Points
 * @param {number} team2Points
 * @param {11 | 21} [format]
 */
export function getSetScoreValidationMessage(team1Points, team2Points, format = DEFAULT_GAME_POINTS_PER_SET) {
  if (isValidSetGameScore(team1Points, team2Points, format)) return null;

  const rules = getGamePointRules(format);
  const team1 = Number(team1Points);
  const team2 = Number(team2Points);

  if (!Number.isFinite(team1) || !Number.isFinite(team2) || team1 < 0 || team2 < 0) {
    return `Enter whole numbers from 0 to ${rules.maxSetScore}.`;
  }
  if (team1 === team2) {
    return 'Scores cannot be tied — one player must win the set.';
  }
  if (team1 > rules.maxSetScore || team2 > rules.maxSetScore) {
    return `Each score must be ${rules.maxSetScore} or less.`;
  }

  const winner = Math.max(team1, team2);
  const loser = Math.min(team1, team2);

  if (winner < rules.pointsToWin) {
    return `Winner must reach at least ${rules.pointsToWin} points.`;
  }

  if (loser >= rules.deuceThreshold && winner - loser < 2) {
    return `Deuce set - winner must lead by 2 (e.g. ${rules.deuceThreshold + 2}-${rules.deuceThreshold}, ${rules.deuceThreshold + 3}-${rules.deuceThreshold + 1}).`;
  }

  if (winner - loser < 2) {
    return `Winner must lead by at least 2 points (e.g. ${rules.pointsToWin}-${rules.pointsToWin - 2}).`;
  }

  return `Enter a valid ${rules.gamePoints}-point game score.`;
}

/**
 * @param {{ game_point_format?: number | null }} [match]
 * @returns {11 | 21}
 */
export function resolveMatchGamePointFormat(match) {
  return normalizeGamePointsPerSet(match?.game_point_format);
}
