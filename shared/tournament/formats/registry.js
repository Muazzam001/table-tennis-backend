/**
 * Tournament format strategy registry.
 * New formats register here without modifying classic group/knockout logic.
 */

import { tierPyramidStrategy, TIER_PYRAMID_FORMAT_KEY } from './tierPyramid/index.js';

/** @typedef {object} FormatStrategy */

/** @type {Map<string, FormatStrategy>} */
const FORMAT_REGISTRY = new Map([[TIER_PYRAMID_FORMAT_KEY, tierPyramidStrategy]]);

/**
 * @param {string} format
 * @returns {FormatStrategy | null}
 */
export function getFormatStrategy(format) {
  return FORMAT_REGISTRY.get(format) ?? null;
}

/**
 * @param {string} format
 */
export function isTierPyramidFormat(format) {
  return format === TIER_PYRAMID_FORMAT_KEY;
}

/**
 * @param {string} format
 */
export function isRegisteredFormat(format) {
  return FORMAT_REGISTRY.has(format);
}

export { TIER_PYRAMID_FORMAT_KEY, tierPyramidStrategy };
