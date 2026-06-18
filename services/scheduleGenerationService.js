import {
  distributeIntoGroups,
  generateGroupStageMatches,
  resolveTournamentConfig,
  buildConfigFromCounts,
  getTournamentSetupOptions,
} from '@shared/tournament/index.js';
import { scheduleFixtures, validateDateRangeForMatches } from '@shared/tournament/scheduling.js';

/**
 * Build a complete group-stage schedule for all teams in a league.
 * @param {Array<{ id: number, team_name: string }>} teams
 * @param {string} league
 * @param {string|Date} startDate
 * @param {string} venue
 * @param {string|Date|null} [endDate]
 * @param {number|null} [groupCount]
 */
export function buildLeagueGroupStageSchedule(teams, league, startDate, venue, endDate = null, groupCount = null) {
  const participants = teams.map((t) => ({ id: t.id, team_name: t.team_name }));
  const setup = getTournamentSetupOptions(participants.length);

  if (!setup.isValid) {
    throw new Error(
      setup.rejectionReason ||
        `Cannot build a tournament schedule with ${participants.length} teams in ${league} league.`
    );
  }

  const config = groupCount
    ? buildConfigFromCounts(participants.length, groupCount)
    : resolveTournamentConfig(participants.length);

  const groups = distributeIntoGroups(participants, config.groupCount);
  const fixtures = generateGroupStageMatches(groups).map((f) => ({
    ...f,
    league,
  }));

  const expectedMatchCount = fixtures.length;
  const rangeCheck = validateDateRangeForMatches(startDate, endDate, expectedMatchCount);
  if (!rangeCheck.ok) {
    throw new Error(rangeCheck.message);
  }

  const { matches, availableSlots } = scheduleFixtures(fixtures, startDate, venue, endDate);

  const groupSummary = Object.fromEntries(
    Object.entries(groups).map(([id, groupTeams]) => [
      id,
      groupTeams.map((t) => ({ id: t.id, name: t.team_name })),
    ])
  );

  return {
    config,
    groups: groupSummary,
    matches,
    expectedMatchCount,
    scheduledMatchCount: matches.length,
    availableSlots,
    teamsUsed: participants.length,
  };
}
