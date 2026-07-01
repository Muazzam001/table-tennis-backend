/**
 * Time-slot scheduling helpers (weekday evenings, configurable slots).
 */

/** @typedef {{ startHour: number, startMinute: number, endHour: number, endMinute: number, intervalMinutes: number }} TimeSlotConfig */

export const DEFAULT_TIME_SLOT_CONFIG = {
  startHour: 19,
  startMinute: 0,
  endHour: 22,
  endMinute: 0,
  intervalMinutes: 30,
};

export const DEFAULT_COURT_COUNT = 2;
export const DEFAULT_VENUE_BASE = 'Main Court';

/** @typedef {{ courtCount: number, venueBase: string }} CourtConfig */

/**
 * @param {Partial<TimeSlotConfig> & { startTime?: string, endTime?: string }} [input]
 * @returns {TimeSlotConfig}
 */
function normalizeTimeSlotConfig(input) {
  const source = input && typeof input === 'object' ? input : {};

  const start = source.startTime
    ? parseTimeString(source.startTime)
    : {
        hour: source.startHour ?? DEFAULT_TIME_SLOT_CONFIG.startHour,
        minute: source.startMinute ?? DEFAULT_TIME_SLOT_CONFIG.startMinute,
      };
  const end = source.endTime
    ? parseTimeString(source.endTime)
    : {
        hour: source.endHour ?? DEFAULT_TIME_SLOT_CONFIG.endHour,
        minute: source.endMinute ?? DEFAULT_TIME_SLOT_CONFIG.endMinute,
      };

  return {
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute,
    intervalMinutes: Number(source.intervalMinutes ?? DEFAULT_TIME_SLOT_CONFIG.intervalMinutes),
  };
}

/**
 * @param {TimeSlotConfig} config
 * @returns {number}
 */
function countSlotsForConfig(config) {
  const startMinutes = config.startHour * 60 + config.startMinute;
  const endMinutes = config.endHour * 60 + config.endMinute;
  const interval = config.intervalMinutes;

  if (endMinutes <= startMinutes || interval <= 0) {
    return 0;
  }

  let count = 0;
  let cursor = startMinutes;
  while (cursor + interval <= endMinutes) {
    count += 1;
    cursor += interval;
  }
  return count;
}

/**
 * @param {TimeSlotConfig} config
 * @returns {number}
 */
export function computeSlotsPerWeekday(config = DEFAULT_TIME_SLOT_CONFIG) {
  return countSlotsForConfig(normalizeTimeSlotConfig(config));
}

/** @deprecated Use computeSlotsPerWeekday(DEFAULT_TIME_SLOT_CONFIG) */
export const SLOTS_PER_WEEKDAY = computeSlotsPerWeekday(DEFAULT_TIME_SLOT_CONFIG);

/**
 * @param {string} time HH:MM
 * @returns {{ hour: number, minute: number }}
 */
function parseTimeString(time) {
  const [hourPart, minutePart] = String(time).trim().split(':');
  return {
    hour: Number(hourPart),
    minute: Number(minutePart ?? 0),
  };
}

/**
 * @param {number} hour
 * @param {number} minute
 * @returns {string}
 */
export function formatTimeLabel(hour, minute = 0) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Normalize and validate a time-slot configuration.
 * Accepts startTime/endTime (HH:MM) or startHour/startMinute/endHour/endMinute.
 *
 * @param {Partial<TimeSlotConfig> & { startTime?: string, endTime?: string } | null | undefined} input
 * @returns {TimeSlotConfig}
 */
export function resolveTimeSlotConfig(input) {
  const config = normalizeTimeSlotConfig(input);

  if (
    !Number.isInteger(config.startHour) ||
    !Number.isInteger(config.startMinute) ||
    !Number.isInteger(config.endHour) ||
    !Number.isInteger(config.endMinute) ||
    !Number.isInteger(config.intervalMinutes) ||
    config.startHour < 0 ||
    config.startHour > 23 ||
    config.endHour < 0 ||
    config.endHour > 23 ||
    config.startMinute < 0 ||
    config.startMinute > 59 ||
    config.endMinute < 0 ||
    config.endMinute > 59 ||
    config.intervalMinutes < 15 ||
    config.intervalMinutes > 180
  ) {
    throw new Error('Invalid time slot configuration.');
  }

  const slotsPerDay = countSlotsForConfig(config);
  if (slotsPerDay < 1) {
    throw new Error(
      `Time window ${formatTimeLabel(config.startHour, config.startMinute)}–${formatTimeLabel(config.endHour, config.endMinute)} ` +
        `with ${config.intervalMinutes}-minute intervals does not fit any match slots.`
    );
  }

  return config;
}

/**
 * @param {{ courtCount?: number, venueBase?: string, venue?: string } | null | undefined} input
 * @returns {CourtConfig}
 */
export function resolveCourtConfig(input) {
  const source = input && typeof input === 'object' ? input : {};
  const courtCount = Number(source.courtCount ?? DEFAULT_COURT_COUNT);
  const venueBase = String(source.venueBase ?? source.venue ?? DEFAULT_VENUE_BASE).trim() || DEFAULT_VENUE_BASE;

  if (!Number.isInteger(courtCount) || courtCount < 1 || courtCount > 16) {
    throw new Error('Court count must be an integer from 1 to 16.');
  }

  return { courtCount, venueBase };
}

/**
 * @param {string} venueBase
 * @param {number} courtNumber 1-based court index
 * @param {number} courtCount
 * @returns {string}
 */
export function formatCourtVenue(venueBase, courtNumber, courtCount) {
  if (courtCount <= 1) {
    return venueBase;
  }
  return `${venueBase} ${courtNumber}`;
}

/**
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @param {TimeSlotConfig} [config]
 * @param {Partial<CourtConfig>} [courtConfigInput]
 * @returns {{ date: Date, venue: string }[]}
 */
export function buildMatchSlotsInRange(startDate, endDate, config = DEFAULT_TIME_SLOT_CONFIG, courtConfigInput = null) {
  const resolved = resolveTimeSlotConfig(config);
  const courtConfig = resolveCourtConfig(courtConfigInput);
  const timeSlots = buildAvailableSlotsInRange(startDate, endDate, resolved);
  const matchSlots = [];

  for (const date of timeSlots) {
    for (let court = 1; court <= courtConfig.courtCount; court += 1) {
      matchSlots.push({
        date,
        venue: formatCourtVenue(courtConfig.venueBase, court, courtConfig.courtCount),
      });
    }
  }

  return matchSlots;
}

/**
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @param {TimeSlotConfig} [config]
 * @param {Partial<CourtConfig>} [courtConfigInput]
 * @returns {number}
 */
export function countAvailableMatchSlotsInRange(
  startDate,
  endDate,
  config = DEFAULT_TIME_SLOT_CONFIG,
  courtConfigInput = null
) {
  const courtConfig = resolveCourtConfig(courtConfigInput);
  return countAvailableSlotsInRange(startDate, endDate, config) * courtConfig.courtCount;
}

/**
 * Sequential slot allocator for knockout rounds and open-ended schedules.
 * @param {Date|string} startDate
 * @param {TimeSlotConfig} [timeConfig]
 * @param {Partial<CourtConfig>} [courtConfigInput]
 */
export function createMatchSlotCursor(startDate, timeConfig = DEFAULT_TIME_SLOT_CONFIG, courtConfigInput = null) {
  const resolved = resolveTimeSlotConfig(timeConfig);
  const courtConfig = resolveCourtConfig(courtConfigInput);
  let timeSlot = getNextTimeSlot(parseLocalDate(startDate), resolved);
  let courtIndex = 0;

  const current = () => ({
    scheduled_date: formatDateForMySQL(timeSlot),
    venue: formatCourtVenue(courtConfig.venueBase, courtIndex + 1, courtConfig.courtCount),
  });

  const advance = () => {
    courtIndex += 1;
    if (courtIndex >= courtConfig.courtCount) {
      courtIndex = 0;
      timeSlot = getFollowingTimeSlot(timeSlot, resolved);
    }
  };

  return {
    getNext() {
      const slot = current();
      advance();
      return slot;
    },
  };
}

/**
 * @param {TimeSlotConfig} [config]
 * @param {Partial<CourtConfig>} [courtConfigInput]
 * @returns {{ slotsPerWeekday: number, matchesPerWeekday: number, courtCount: number, timeRangeLabel: string, intervalMinutes: number }}
 */
export function getSchedulingCapacity(config = DEFAULT_TIME_SLOT_CONFIG, courtConfigInput = null) {
  const resolved = resolveTimeSlotConfig(config);
  const courtConfig = resolveCourtConfig(courtConfigInput);
  const slotsPerWeekday = computeSlotsPerWeekday(resolved);
  return {
    slotsPerWeekday,
    matchesPerWeekday: slotsPerWeekday * courtConfig.courtCount,
    courtCount: courtConfig.courtCount,
    timeRangeLabel: `${formatTimeLabel(resolved.startHour, resolved.startMinute)}–${formatTimeLabel(resolved.endHour, resolved.endMinute)}`,
    intervalMinutes: resolved.intervalMinutes,
  };
}

/**
 * @param {TimeSlotConfig} [config]
 * @returns {{ slotsPerWeekday: number, timeRangeLabel: string, intervalMinutes: number }}
 */
export function getTimeSlotSummary(config = DEFAULT_TIME_SLOT_CONFIG) {
  const resolved = resolveTimeSlotConfig(config);
  return {
    slotsPerWeekday: computeSlotsPerWeekday(resolved),
    timeRangeLabel: `${formatTimeLabel(resolved.startHour, resolved.startMinute)}–${formatTimeLabel(resolved.endHour, resolved.endMinute)}`,
    intervalMinutes: resolved.intervalMinutes,
  };
}

export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function skipWeekends(date) {
  const current = new Date(date);
  while (isWeekend(current)) {
    current.setDate(current.getDate() + 1);
  }
  return current;
}

/**
 * Parse YYYY-MM-DD (or ISO string) as a local calendar date (avoids UTC timezone shift).
 * @param {Date|string} dateInput
 * @returns {Date}
 */
export function parseLocalDate(dateInput) {
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  }
  if (typeof dateInput === 'string') {
    const datePart = dateInput.includes('T') ? dateInput.split('T')[0] : dateInput.trim();
    const [year, month, day] = datePart.split('-').map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day);
    }
  }
  const parsed = new Date(dateInput);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * Weekday slots (local time) for a single calendar day.
 * @param {Date} dayDate local date at midnight
 * @param {TimeSlotConfig} [config]
 * @returns {Date[]}
 */
export function getEveningSlotsForDay(dayDate, config = DEFAULT_TIME_SLOT_CONFIG) {
  if (isWeekend(dayDate)) {
    return [];
  }

  const resolved = resolveTimeSlotConfig(config);
  const slots = [];
  const slot = new Date(dayDate);
  slot.setHours(resolved.startHour, resolved.startMinute, 0, 0);

  const endMinutes = resolved.endHour * 60 + resolved.endMinute;

  while (true) {
    const slotMinutes = slot.getHours() * 60 + slot.getMinutes();
    if (slotMinutes + resolved.intervalMinutes > endMinutes) {
      break;
    }
    slots.push(new Date(slot));
    slot.setMinutes(slot.getMinutes() + resolved.intervalMinutes);
  }

  return slots;
}

/**
 * All weekday slots from start through end (inclusive, local dates).
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @param {TimeSlotConfig} [config]
 * @returns {Date[]}
 */
export function buildAvailableSlotsInRange(startDate, endDate, config = DEFAULT_TIME_SLOT_CONFIG) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  if (end < start) {
    return [];
  }

  const slots = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    slots.push(...getEveningSlotsForDay(cursor, config));
    cursor.setDate(cursor.getDate() + 1);
  }

  return slots;
}

/**
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @param {TimeSlotConfig} [config]
 */
export function countAvailableSlotsInRange(startDate, endDate, config = DEFAULT_TIME_SLOT_CONFIG) {
  return buildAvailableSlotsInRange(startDate, endDate, config).length;
}

/**
 * Earliest end date (inclusive) that fits matchCount weekday slots.
 * @param {Date|string} startDate
 * @param {number} matchCount
 * @param {TimeSlotConfig} [config]
 * @returns {string|null} YYYY-MM-DD
 */
export function suggestMinimumEndDate(
  startDate,
  matchCount,
  config = DEFAULT_TIME_SLOT_CONFIG,
  courtConfigInput = null
) {
  if (!matchCount || matchCount <= 0) {
    return null;
  }

  const resolved = resolveTimeSlotConfig(config);
  const courtConfig = resolveCourtConfig(courtConfigInput);
  const matchesPerDay = computeSlotsPerWeekday(resolved) * courtConfig.courtCount;
  let slotsCollected = 0;
  const cursor = parseLocalDate(startDate);

  while (slotsCollected < matchCount) {
    if (!isWeekend(cursor)) {
      slotsCollected += matchesPerDay;
    }
    if (slotsCollected >= matchCount) {
      return formatLocalDateLabel(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return formatLocalDateLabel(cursor);
}

/**
 * Next available slot at or after currentDate.
 * @param {Date} currentDate
 * @param {TimeSlotConfig} [config]
 * @returns {Date}
 */
export function getNextTimeSlot(currentDate, config = DEFAULT_TIME_SLOT_CONFIG) {
  const resolved = resolveTimeSlotConfig(config);
  let cursor = skipWeekends(new Date(currentDate));
  const currentMinutes = cursor.getHours() * 60 + cursor.getMinutes();

  for (let dayOffset = 0; dayOffset < 366; dayOffset += 1) {
    const day = new Date(cursor);
    day.setDate(day.getDate() + dayOffset);
    if (isWeekend(day)) continue;

    const slots = getEveningSlotsForDay(day, resolved);
    for (const slot of slots) {
      const slotMinutes = slot.getHours() * 60 + slot.getMinutes();
      if (dayOffset === 0 && slotMinutes < currentMinutes) {
        continue;
      }
      return slot;
    }
  }

  return cursor;
}

/**
 * Slot immediately after the given scheduled slot.
 * @param {Date} currentSlot
 * @param {TimeSlotConfig} [config]
 * @returns {Date}
 */
export function getFollowingTimeSlot(currentSlot, config = DEFAULT_TIME_SLOT_CONFIG) {
  const resolved = resolveTimeSlotConfig(config);
  const day = parseLocalDate(currentSlot);
  const slots = getEveningSlotsForDay(day, resolved);
  const currentTime = currentSlot.getTime();
  const index = slots.findIndex((slot) => slot.getTime() === currentTime);

  if (index >= 0 && index < slots.length - 1) {
    return slots[index + 1];
  }

  const nextDay = skipWeekends(new Date(day));
  nextDay.setDate(nextDay.getDate() + 1);
  const nextSlots = getEveningSlotsForDay(skipWeekends(nextDay), resolved);
  return nextSlots[0] ?? getNextTimeSlot(nextDay, resolved);
}

export function formatDateForMySQL(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Assign scheduled dates to match fixtures within optional date range.
 * With endDate: only uses weekday slots between start and end (inclusive).
 * Without endDate: continues scheduling on subsequent weekdays.
 *
 * @param {object[]} fixtures
 * @param {Date|string} startDate
 * @param {string} venue
 * @param {Date|string|null} [endDate]
 * @param {TimeSlotConfig} [config]
 * @param {Partial<CourtConfig>} [courtConfigInput]
 * @returns {{ matches: object[], availableSlots: number|null, slotsRequired: number }}
 */
export function scheduleFixtures(
  fixtures,
  startDate,
  venue,
  endDate = null,
  config = DEFAULT_TIME_SLOT_CONFIG,
  courtConfigInput = null
) {
  const resolved = resolveTimeSlotConfig(config);
  const courtConfig = resolveCourtConfig({
    ...courtConfigInput,
    venueBase: courtConfigInput?.venueBase ?? venue,
  });
  const slotsRequired = fixtures.length;

  if (endDate) {
    const matchSlots = buildMatchSlotsInRange(startDate, endDate, resolved, courtConfig);
    const matches = fixtures.slice(0, matchSlots.length).map((fixture, index) => ({
      ...fixture,
      scheduled_date: formatDateForMySQL(matchSlots[index].date),
      venue: matchSlots[index].venue,
    }));

    return {
      matches,
      availableSlots: matchSlots.length,
      slotsRequired,
    };
  }

  const cursor = createMatchSlotCursor(startDate, resolved, courtConfig);
  const matches = fixtures.map((fixture) => {
    const slot = cursor.getNext();
    return {
      ...fixture,
      scheduled_date: slot.scheduled_date,
      venue: slot.venue,
    };
  });

  return {
    matches,
    availableSlots: null,
    slotsRequired,
  };
}

/**
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @param {number} matchCount
 * @param {TimeSlotConfig} [config]
 * @param {Partial<CourtConfig>} [courtConfigInput]
 */
export function validateDateRangeForMatches(
  startDate,
  endDate,
  matchCount,
  config = DEFAULT_TIME_SLOT_CONFIG,
  courtConfigInput = null
) {
  if (!endDate) {
    return { ok: true };
  }

  const resolved = resolveTimeSlotConfig(config);
  const capacity = getSchedulingCapacity(resolved, courtConfigInput);
  const available = countAvailableMatchSlotsInRange(startDate, endDate, resolved, courtConfigInput);
  if (matchCount <= available) {
    return { ok: true, availableSlots: available };
  }

  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const daySpan = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;

  const suggestedEndDate = suggestMinimumEndDate(startDate, matchCount, resolved, courtConfigInput);
  const weekdaysNeeded = Math.ceil(matchCount / capacity.matchesPerWeekday);
  const courtLabel =
    capacity.courtCount > 1 ? `${capacity.courtCount} courts × ` : '';

  return {
    ok: false,
    availableSlots: available,
    slotsRequired: matchCount,
    suggestedEndDate,
    weekdaysNeeded,
    message:
      `Date range is too short: ${matchCount} matches need ${matchCount} match slots (${weekdaysNeeded} weekdays at ${courtLabel}${capacity.slotsPerWeekday} time slots/day), ` +
      `but only ${available} weekday match slots (${capacity.timeRangeLabel}, ${capacity.intervalMinutes}-min intervals) exist between ${formatLocalDateLabel(start)} and ${formatLocalDateLabel(end)} ` +
      `(${daySpan} calendar day(s)). Use end date ${suggestedEndDate} or later, or leave end date empty.`,
  };
}

/**
 * @param {Date} date
 */
export function formatLocalDateLabel(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
