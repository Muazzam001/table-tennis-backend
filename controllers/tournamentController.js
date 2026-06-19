import pool from '../utils/database.js';
import { countPlayersForDivision } from '../services/tournamentService.js';
import { getCompetitionFormat } from '../services/divisionSettingsService.js';
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
import { buildDivisionOverview } from '../services/tournamentOverviewService.js';
import { rejectInvalidDivision } from '../utils/divisionParam.js';

export const getTournamentSetup = async (req, res, next) => {
  try {
    const {
      division: rawDivision,
      startDate,
      groupCount: groupCountParam,
      startTime,
      endTime,
      intervalMinutes,
      courtCount: courtCountParam,
    } = req.query;
    if (!rawDivision) {
      return res.status(400).json({ success: false, message: 'Division query parameter is required' });
    }
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;

    const [teams] = await pool.execute(
      'SELECT id FROM teams WHERE division = ? ORDER BY id',
      [division]
    );

    const playerCount = await countPlayersForDivision(pool, division);
    const competitionFormat = await getCompetitionFormat(pool, division);
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
        division,
        competition_format: competitionFormat,
        ...options,
        scheduling,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getDivisionGroups = async (req, res, next) => {
  try {
    const { division: rawDivision } = req.query;
    if (!rawDivision) {
      return res.status(400).json({ success: false, message: 'Division query parameter is required' });
    }
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;

    const groups = await getGroupsFromMatches(pool, division);
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
        division,
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
    const { division: rawDivision } = req.query;
    if (!rawDivision) {
      return res.status(400).json({ success: false, message: 'Division query parameter is required' });
    }
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;

    const data = await buildDivisionOverview(pool, division);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
