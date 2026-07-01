/** @typedef {import('../../types.ts').Match} Match */

import {
  DEFAULT_TIME_SLOT_CONFIG,
  createMatchSlotCursor,
  getFollowingTimeSlot,
  getNextTimeSlot,
  parseLocalDate,
  resolveCourtConfig,
  resolveTimeSlotConfig,
} from '../../scheduling.js';

const PYRAMID_BRACKET_SIZE = 4;
const PYRAMID_SEMI_FINAL_COUNT = 2;

/**
 * @typedef {{
 *   scheduled_date: string,
 *   venue: string,
 * }} ScheduleSlot
 */

/**
 * @typedef {{
 *   bracketSlots: ScheduleSlot[],
 *   semiFinalSlots: ScheduleSlot[],
 *   finalSlot: ScheduleSlot,
 *   thirdPlaceSlot: ScheduleSlot,
 *   courtConfig: import('../../scheduling.js').CourtConfig,
 * }} PyramidKnockoutSlotPlan
 */

/**
 * @param {Match[]} matches
 * @param {Partial<import('../../scheduling.js').CourtConfig>} [fallback]
 */
export function deriveCourtConfigFromMatches(matches, fallback = {}) {
  if (!matches.length) {
    return resolveCourtConfig(fallback);
  }

  const resolved = resolveCourtConfig(fallback);
  let venueBase = resolved.venueBase;
  let maxCourt = 1;
  let sawMultiCourt = false;

  for (const match of matches) {
    const venue = match.venue?.trim();
    if (!venue) continue;

    const numbered = venue.match(/^(.+?)\s+(\d+)$/);
    if (numbered) {
      sawMultiCourt = true;
      venueBase = numbered[1];
      maxCourt = Math.max(maxCourt, Number(numbered[2]));
    } else {
      venueBase = venue;
    }
  }

  return {
    venueBase,
    courtCount: sawMultiCourt ? maxCourt : resolved.courtCount,
  };
}

/**
 * @param {Match[]} matches
 * @returns {Match | null}
 */
export function findLatestScheduledMatch(matches) {
  let latest = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const match of matches) {
    if (!match.scheduled_date) continue;
    const time = new Date(match.scheduled_date).getTime();
    if (Number.isFinite(time) && time > latestTime) {
      latestTime = time;
      latest = match;
    }
  }

  return latest;
}

/**
 * @param {Match[]} level1Matches
 * @param {import('../../scheduling.js').TimeSlotConfig | Partial<import('../../scheduling.js').TimeSlotConfig>} [timeConfig]
 * @param {Partial<import('../../scheduling.js').CourtConfig>} [courtConfigInput]
 * @returns {PyramidKnockoutSlotPlan}
 */
export function computePyramidKnockoutSlotPlan(
  level1Matches,
  timeConfig = DEFAULT_TIME_SLOT_CONFIG,
  courtConfigInput = null
) {
  const resolved = resolveTimeSlotConfig(timeConfig);
  const courtConfig = deriveCourtConfigFromMatches(level1Matches, courtConfigInput ?? {});

  const latest = findLatestScheduledMatch(level1Matches);
  const cursorStart = latest?.scheduled_date
    ? getFollowingTimeSlot(parseLocalDate(latest.scheduled_date), resolved)
    : getNextTimeSlot(new Date(), resolved);

  const cursor = createMatchSlotCursor(cursorStart, resolved, courtConfig);

  const bracketSlots = Array.from({ length: PYRAMID_BRACKET_SIZE }, () => cursor.getNext());
  const semiFinalSlots = Array.from({ length: PYRAMID_SEMI_FINAL_COUNT }, () => cursor.getNext());
  const finalSlot = cursor.getNext();
  const thirdPlaceSlot = cursor.getNext();

  return {
    bracketSlots,
    semiFinalSlots,
    finalSlot,
    thirdPlaceSlot,
    courtConfig,
  };
}

/**
 * @param {Match[]} existingMatches
 * @param {number} roundType
 * @param {number} stageSequence
 * @returns {ScheduleSlot | null}
 */
function findPeerBracketSlot(existingMatches, roundType, stageSequence) {
  const peer = existingMatches.find(
    (match) => match.round_type === roundType && (match.stage_sequence ?? 0) === stageSequence
  );
  if (!peer?.scheduled_date) return null;
  return {
    scheduled_date: peer.scheduled_date,
    venue: peer.venue,
  };
}

/**
 * Resolve scheduled_date/venue for an auto-generated pyramid knockout match.
 * Level 2 and Level 3 share the same bracket slot (stage_sequence).
 *
 * @param {{ round_type: string, stage_sequence?: number | null }} matchDef
 * @param {Match[]} existingMatches
 * @param {PyramidKnockoutSlotPlan} slotPlan
 * @returns {ScheduleSlot}
 */
export function resolvePyramidMatchSchedule(matchDef, existingMatches, slotPlan) {
  const roundType = matchDef.round_type;
  const stageSequence = matchDef.stage_sequence ?? 0;

  if (roundType === 'Level 2') {
    return slotPlan.bracketSlots[stageSequence] ?? slotPlan.bracketSlots[0];
  }

  if (roundType === 'Level 3') {
    return (
      findPeerBracketSlot(existingMatches, 'Level 2', stageSequence) ??
      slotPlan.bracketSlots[stageSequence] ??
      slotPlan.bracketSlots[0]
    );
  }

  if (roundType === 'Semi Final') {
    return slotPlan.semiFinalSlots[stageSequence] ?? slotPlan.semiFinalSlots[0];
  }

  if (roundType === 'Final') {
    return slotPlan.finalSlot;
  }

  if (roundType === 'Third Place') {
    return slotPlan.thirdPlaceSlot;
  }

  return slotPlan.finalSlot;
}

/**
 * @param {Match[]} existingMatches
 * @param {import('../../scheduling.js').TimeSlotConfig | Partial<import('../../scheduling.js').TimeSlotConfig>} [timeConfig]
 * @param {Partial<import('../../scheduling.js').CourtConfig>} [courtConfigInput]
 * @returns {PyramidKnockoutSlotPlan}
 */
export function buildPyramidKnockoutSlotPlanFromDivision(
  existingMatches,
  timeConfig = DEFAULT_TIME_SLOT_CONFIG,
  courtConfigInput = null
) {
  const level1Matches = existingMatches.filter(
    (match) => match.round_type === 'S1' || match.round_type === 'S2'
  );
  return computePyramidKnockoutSlotPlan(level1Matches, timeConfig, courtConfigInput);
}
