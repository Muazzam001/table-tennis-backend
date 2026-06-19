import { resolveDivisionParam } from '@shared/tournament/divisions.js';

export { resolveDivisionParam };

/**
 * @param {string} division
 * @returns {'Men' | 'Women'}
 */
export function requireDivision(division) {
  const resolved = resolveDivisionParam(division);
  if (!resolved) {
    throw Object.assign(new Error('Invalid division'), { statusCode: 400 });
  }
  return resolved;
}

/**
 * @param {string | undefined | null} division
 * @returns {'Men' | 'Women' | null}
 */
export function optionalDivision(division) {
  if (division == null || division === '') return null;
  return resolveDivisionParam(division);
}

/**
 * @param {import('express').Response} res
 * @param {string | undefined | null} division
 * @returns {'Men' | 'Women' | null | undefined} undefined when response already sent
 */
export function rejectInvalidDivision(res, division) {
  if (division == null || division === '') return null;
  const resolved = resolveDivisionParam(division);
  if (!resolved) {
    res.status(400).json({ success: false, message: 'Invalid division' });
    return undefined;
  }
  return resolved;
}
