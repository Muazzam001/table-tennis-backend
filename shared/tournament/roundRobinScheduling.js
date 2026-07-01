/**
 * Round-robin pairing order (circle method) and group-aware scheduling.
 * Parallel pools (e.g. S1 A–D) share weekdays: one round per pool per day, interleaved across courts.
 */

import {
  resolveTimeSlotConfig,
  resolveCourtConfig,
  parseLocalDate,
  skipWeekends,
  getEveningSlotsForDay,
  formatDateForMySQL,
  formatCourtVenue,
  isWeekend,
  computeSlotsPerWeekday,
} from './scheduling.js';

/**
 * @param {number} a
 * @param {number} b
 */
function pairKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Circle-method round-robin rounds (each player appears at most once per round).
 * @param {(number|string)[]} teamIds
 * @returns {{ team1_id: number, team2_id: number }[][]}
 */
export function buildRoundRobinRounds(teamIds) {
  const ids = teamIds.map((id) => Number(id));
  if (ids.length < 2) return [];

  const working = [...ids];
  if (working.length % 2 === 1) {
    working.push(null);
  }

  const n = working.length;
  const rounds = [];

  for (let round = 0; round < n - 1; round += 1) {
    /** @type {{ team1_id: number, team2_id: number }[]} */
    const pairings = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = working[i];
      const b = working[n - 1 - i];
      if (a != null && b != null) {
        pairings.push({ team1_id: a, team2_id: b });
      }
    }
    rounds.push(pairings);

    const fixed = working[0];
    const rest = working.slice(1);
    rest.unshift(rest.pop());
    working.splice(0, working.length, fixed, ...rest);
  }

  return rounds;
}

/**
 * Order round-robin fixtures round-by-round (not all of player A's matches first).
 * @param {object[]} fixtures
 * @returns {object[]}
 */
export function orderFixturesByRoundRobinRounds(fixtures) {
  if (!fixtures.length) return [];

  const teamIds = [...new Set(fixtures.flatMap((f) => [f.team1_id, f.team2_id]))];
  const rounds = buildRoundRobinRounds(teamIds);
  const byKey = new Map(
    fixtures.map((f) => [pairKey(f.team1_id, f.team2_id), f])
  );

  const ordered = [];
  for (const round of rounds) {
    for (const pair of round) {
      const fixture = byKey.get(pairKey(pair.team1_id, pair.team2_id));
      if (fixture) ordered.push(fixture);
    }
  }

  return ordered.length === fixtures.length ? ordered : fixtures;
}

/**
 * Group fixtures by pool (S1) or round_type when pool is null (S2).
 * @param {object[]} fixtures
 * @returns {Map<string, object[]>}
 */
export function groupFixturesByPoolOrStage(fixtures) {
  /** @type {Map<string, object[]>} */
  const groups = new Map();

  for (const fixture of fixtures) {
    const key =
      fixture.pool != null && fixture.pool !== ''
        ? `pool:${fixture.pool}`
        : `stage:${fixture.round_type || fixture.pyramid_stage || 'default'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fixture);
  }

  return groups;
}

/**
 * Advance to the next weekday (exclusive of current if already weekday).
 * @param {Date} date
 */
function nextWeekday(date) {
  const next = skipWeekends(new Date(date));
  next.setDate(next.getDate() + 1);
  return skipWeekends(next);
}

/**
 * @param {Date} day
 * @param {import('./scheduling.js').TimeSlotConfig} config
 * @param {import('./scheduling.js').CourtConfig} courtConfig
 * @param {number} slotWaveIndex 0-based wave within the day
 * @param {number} courtIndex 0-based court within the wave
 */
function slotAt(day, config, courtConfig, slotWaveIndex, courtIndex) {
  const daySlots = getEveningSlotsForDay(day, config);
  const wave = daySlots[slotWaveIndex];
  if (!wave) return null;

  return {
    scheduled_date: formatDateForMySQL(wave),
    venue: formatCourtVenue(courtConfig.venueBase, courtIndex + 1, courtConfig.courtCount),
  };
}

/**
 * @param {object[]} groupFixtures
 */
function buildPoolRoundFixtures(groupFixtures) {
  const ordered = orderFixturesByRoundRobinRounds(groupFixtures);
  const teamIds = [...new Set(ordered.flatMap((f) => [f.team1_id, f.team2_id]))];
  const rounds = buildRoundRobinRounds(teamIds);
  const byKey = new Map(groupFixtures.map((f) => [pairKey(f.team1_id, f.team2_id), f]));

  return rounds
    .map((round) =>
      round
        .map((pair) => byKey.get(pairKey(pair.team1_id, pair.team2_id)))
        .filter(Boolean)
    )
    .filter((round) => round.length > 0);
}

/**
 * Interleave one round from each pool so groups share the same evening (A1, B1, C1, D1, A2, …).
 * @param {object[][]} poolRounds
 */
function interleavePoolRoundMatches(poolRounds) {
  const maxLen = Math.max(0, ...poolRounds.map((round) => round.length));
  /** @type {object[]} */
  const interleaved = [];

  for (let i = 0; i < maxLen; i += 1) {
    for (const round of poolRounds) {
      if (round[i]) interleaved.push(round[i]);
    }
  }

  return interleaved;
}

/**
 * @param {object[]} dayFixtures
 * @param {Date} day
 * @param {import('./scheduling.js').TimeSlotConfig} config
 * @param {import('./scheduling.js').CourtConfig} courtConfig
 * @returns {object[]}
 */
function assignDayFixtures(dayFixtures, day, config, courtConfig) {
  const courts = courtConfig.courtCount;
  /** @type {object[]} */
  const scheduled = [];

  for (let i = 0; i < dayFixtures.length; i += 1) {
    const waveIndex = Math.floor(i / courts);
    const courtIndex = i % courts;
    const slot = slotAt(day, config, courtConfig, waveIndex, courtIndex);
    if (!slot) break;

    scheduled.push({
      ...dayFixtures[i],
      scheduled_date: slot.scheduled_date,
      venue: slot.venue,
    });
  }

  return scheduled;
}

/**
 * Schedule pool groups in parallel: each weekday gets one round from every pool (e.g. 4×3 = 12).
 * @param {Map<string, object[]>} poolGroups
 * @param {Date} startDay
 * @param {Date|null} end
 * @param {import('./scheduling.js').TimeSlotConfig} config
 * @param {import('./scheduling.js').CourtConfig} courtConfig
 */
function scheduleParallelPools(poolGroups, startDay, end, config, courtConfig) {
  const poolKeys = [...poolGroups.keys()].sort();
  const roundQueues = poolKeys.map((key) => buildPoolRoundFixtures(poolGroups.get(key)));
  const maxRounds = Math.max(0, ...roundQueues.map((rounds) => rounds.length));
  const dailyCapacity = computeSlotsPerWeekday(config) * courtConfig.courtCount;

  /** @type {object[]} */
  const scheduled = [];
  let dayCursor = skipWeekends(new Date(startDay));

  for (let roundIdx = 0; roundIdx < maxRounds; roundIdx += 1) {
    const poolRounds = roundQueues
      .map((rounds) => rounds[roundIdx])
      .filter((round) => round && round.length > 0);

    if (!poolRounds.length) continue;

    const dayFixtures = interleavePoolRoundMatches(poolRounds);

    while (isWeekend(dayCursor)) {
      dayCursor.setDate(dayCursor.getDate() + 1);
    }

    let remaining = dayFixtures;
    while (remaining.length > 0) {
      if (end && dayCursor > end) {
        return { scheduled, incomplete: true };
      }

      const batch = remaining.slice(0, dailyCapacity);
      const dayScheduled = assignDayFixtures(batch, dayCursor, config, courtConfig);

      if (dayScheduled.length === 0) {
        dayCursor = nextWeekday(dayCursor);
        continue;
      }

      scheduled.push(...dayScheduled);
      remaining = remaining.slice(dayScheduled.length);

      if (remaining.length > 0) {
        dayCursor = nextWeekday(dayCursor);
      }
    }

    dayCursor = nextWeekday(dayCursor);
  }

  return { scheduled, incomplete: false, nextDay: dayCursor };
}

/**
 * Schedule a single pool/stage sequentially (used for S2 or lone groups).
 * @param {object[]} groupFixtures
 * @param {Date} startDay
 * @param {Date|null} end
 * @param {import('./scheduling.js').TimeSlotConfig} config
 * @param {import('./scheduling.js').CourtConfig} courtConfig
 */
function scheduleSingleGroup(groupFixtures, startDay, end, config, courtConfig) {
  const roundQueues = buildPoolRoundFixtures(groupFixtures);
  const dailyCapacity = computeSlotsPerWeekday(config) * courtConfig.courtCount;

  /** @type {object[]} */
  const scheduled = [];
  let dayCursor = skipWeekends(new Date(startDay));

  for (const round of roundQueues) {
    let remaining = round;

    while (remaining.length > 0) {
      while (isWeekend(dayCursor)) {
        dayCursor.setDate(dayCursor.getDate() + 1);
      }

      if (end && dayCursor > end) {
        return { scheduled, incomplete: true, nextDay: dayCursor };
      }

      const batch = remaining.slice(0, dailyCapacity);
      const dayScheduled = assignDayFixtures(batch, dayCursor, config, courtConfig);

      if (dayScheduled.length === 0) {
        dayCursor = nextWeekday(dayCursor);
        continue;
      }

      scheduled.push(...dayScheduled);
      remaining = remaining.slice(dayScheduled.length);

      if (remaining.length > 0) {
        dayCursor = nextWeekday(dayCursor);
      }
    }

    dayCursor = nextWeekday(dayCursor);
  }

  return { scheduled, incomplete: false, nextDay: dayCursor };
}

/**
 * Schedule round-robin groups. Multiple S1 pools share weekdays (3 matches per pool per day when 4 pools).
 * @param {object[]} fixtures
 * @param {Date|string} startDate
 * @param {string} venue
 * @param {Date|string|null} [endDate]
 * @param {import('./scheduling.js').TimeSlotConfig} [config]
 * @param {Partial<import('./scheduling.js').CourtConfig>} [courtConfigInput]
 */
export function scheduleRoundRobinGroups(
  fixtures,
  startDate,
  venue,
  endDate = null,
  config,
  courtConfigInput = null
) {
  const resolved = resolveTimeSlotConfig(config);
  const courtConfig = resolveCourtConfig({
    ...courtConfigInput,
    venueBase: courtConfigInput?.venueBase ?? venue,
  });

  const grouped = groupFixturesByPoolOrStage(fixtures);
  const poolKeys = [...grouped.keys()].filter((k) => k.startsWith('pool:')).sort();
  const stageKeys = [...grouped.keys()].filter((k) => k.startsWith('stage:')).sort();

  /** @type {object[]} */
  const scheduled = [];
  let dayCursor = skipWeekends(parseLocalDate(startDate));
  const end = endDate ? parseLocalDate(endDate) : null;

  if (poolKeys.length > 1) {
    /** @type {Map<string, object[]>} */
    const poolGroups = new Map(poolKeys.map((key) => [key, grouped.get(key)]));
    const poolResult = scheduleParallelPools(poolGroups, dayCursor, end, resolved, courtConfig);
    scheduled.push(...poolResult.scheduled);
    if (poolResult.incomplete) {
      return {
        matches: scheduled,
        availableSlots: null,
        slotsRequired: fixtures.length,
        incomplete: true,
      };
    }
    dayCursor = poolResult.nextDay ?? nextWeekday(dayCursor);
  } else if (poolKeys.length === 1) {
    const singleResult = scheduleSingleGroup(
      grouped.get(poolKeys[0]),
      dayCursor,
      end,
      resolved,
      courtConfig
    );
    scheduled.push(...singleResult.scheduled);
    if (singleResult.incomplete) {
      return {
        matches: scheduled,
        availableSlots: null,
        slotsRequired: fixtures.length,
        incomplete: true,
      };
    }
    dayCursor = singleResult.nextDay ?? nextWeekday(dayCursor);
  }

  for (const key of stageKeys) {
    const stageResult = scheduleSingleGroup(
      grouped.get(key),
      dayCursor,
      end,
      resolved,
      courtConfig
    );
    scheduled.push(...stageResult.scheduled);
    if (stageResult.incomplete) {
      return {
        matches: scheduled,
        availableSlots: null,
        slotsRequired: fixtures.length,
        incomplete: true,
      };
    }
    dayCursor = stageResult.nextDay ?? nextWeekday(dayCursor);
  }

  if (end) {
    const capacity = countSlotsInRange(startDate, end, resolved, courtConfig);
    if (scheduled.length > capacity) {
      return {
        matches: scheduled.slice(0, capacity),
        availableSlots: capacity,
        slotsRequired: fixtures.length,
        incomplete: scheduled.length < fixtures.length,
      };
    }
  }

  return {
    matches: scheduled,
    availableSlots: end ? countSlotsInRange(startDate, end, resolved, courtConfig) : null,
    slotsRequired: fixtures.length,
    incomplete: scheduled.length < fixtures.length,
  };
}

/**
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @param {import('./scheduling.js').TimeSlotConfig} config
 * @param {import('./scheduling.js').CourtConfig} courtConfig
 */
function countSlotsInRange(startDate, endDate, config, courtConfig) {
  let count = 0;
  const cursor = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  while (cursor <= end) {
    if (!isWeekend(cursor)) {
      count += getEveningSlotsForDay(cursor, config).length * courtConfig.courtCount;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * Verify no team plays twice in the same scheduled time wave.
 * @param {object[]} matches
 */
export function assertNoConcurrentTeamMatches(matches) {
  const byTime = new Map();
  for (const match of matches) {
    const timeKey = match.scheduled_date;
    if (!byTime.has(timeKey)) byTime.set(timeKey, new Set());
    const teams = byTime.get(timeKey);
    for (const teamId of [match.team1_id, match.team2_id]) {
      if (teams.has(teamId)) {
        throw new Error(`Team ${teamId} scheduled twice at ${timeKey}`);
      }
      teams.add(teamId);
    }
  }
}
