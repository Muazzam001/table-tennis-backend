import pool from '../utils/database.js';
import { countPlayersForLeague } from '../services/tournamentService.js';
import { getCompetitionFormat } from '../services/leagueSettingsService.js';
import { getTournamentSetupOptions } from '@shared/tournament/constants.js';
import { countQualifyingMatches } from '@shared/tournament/matchGeneration.js';
import {
  suggestMinimumEndDate,
  resolveTimeSlotConfig,
  getSchedulingCapacity,
  resolveCourtConfig,
  formatTimeLabel,
} from '@shared/tournament/scheduling.js';
import { getGroupsFromMatches } from '../services/tournamentService.js';
import { buildLeagueOverview } from '../services/tournamentOverviewService.js';

export const getTournamentSetup = async (req, res, next) => {
  try {
    const {
      league,
      startDate,
      groupCount: groupCountParam,
      startTime,
      endTime,
      intervalMinutes,
      courtCount: courtCountParam,
    } = req.query;
    if (!league) {
      return res.status(400).json({ success: false, message: 'League query parameter is required' });
    }

    const [teams] = await pool.execute(
      'SELECT id FROM teams WHERE league = ? ORDER BY id',
      [league]
    );

    const playerCount = await countPlayersForLeague(pool, league);
    const competitionFormat = await getCompetitionFormat(pool, league);
    const options = getTournamentSetupOptions(teams.length, playerCount);
    const resolvedGroupCount = groupCountParam
      ? Number(groupCountParam)
      : options.defaultGroupCount;

    let scheduling = null;
    if (options.isValid && resolvedGroupCount) {
      const timeSlotConfig = resolveTimeSlotConfig({
        startTime,
        endTime,
        intervalMinutes: intervalMinutes ? Number(intervalMinutes) : undefined,
      });
      const courtConfig = resolveCourtConfig({
        courtCount: courtCountParam ? Number(courtCountParam) : undefined,
      });
      const capacity = getSchedulingCapacity(timeSlotConfig, courtConfig);
      const qualifyingMatchCount = countQualifyingMatches(teams.length, resolvedGroupCount);
      scheduling = {
        timeSlotConfig: {
          startTime: formatTimeLabel(timeSlotConfig.startHour, timeSlotConfig.startMinute),
          endTime: formatTimeLabel(timeSlotConfig.endHour, timeSlotConfig.endMinute),
          intervalMinutes: timeSlotConfig.intervalMinutes,
        },
        courtConfig: {
          courtCount: capacity.courtCount,
        },
        slotsPerWeekday: capacity.slotsPerWeekday,
        matchesPerWeekday: capacity.matchesPerWeekday,
        timeRangeLabel: capacity.timeRangeLabel,
        qualifyingMatchCount,
        minimumWeekdays: Math.ceil(qualifyingMatchCount / capacity.matchesPerWeekday),
        suggestedEndDate: startDate
          ? suggestMinimumEndDate(startDate, qualifyingMatchCount, timeSlotConfig, courtConfig)
          : null,
      };
    }

    res.json({
      success: true,
      data: {
        league,
        competition_format: competitionFormat,
        ...options,
        scheduling,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLeagueGroups = async (req, res, next) => {
  try {
    const { league } = req.query;
    if (!league) {
      return res.status(400).json({ success: false, message: 'League query parameter is required' });
    }

    const groups = await getGroupsFromMatches(pool, league);
    /** @type {Record<number, string>} */
    const teamGroupMap = {};
    for (const [poolId, poolTeams] of Object.entries(groups)) {
      for (const team of poolTeams) {
        teamGroupMap[team.id] = poolId;
      }
    }

    res.json({
      success: true,
      data: {
        league,
        groups: Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, poolTeams]) => ({ id, teams: poolTeams })),
        teamGroupMap,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTournamentOverview = async (req, res, next) => {
  try {
    const { league } = req.query;
    if (!league) {
      return res.status(400).json({ success: false, message: 'League query parameter is required' });
    }

    const data = await buildLeagueOverview(pool, league);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
