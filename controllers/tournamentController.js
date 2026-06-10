import pool from '../utils/database.js';
import {
  getLeagueMatches,
  getGroupsFromMatches,
  detectFormat,
  calculateGroupStandings,
  deriveTournamentStatus,
} from '../services/tournamentService.js';
import { buildKnockoutBracket } from '../../shared/tournament/knockout.js';
import { getTournamentSetupOptions, getPoolIds } from '../../shared/tournament/constants.js';
import { countQualifyingMatches } from '../../shared/tournament/matchGeneration.js';
import {
  suggestMinimumEndDate,
  SLOTS_PER_WEEKDAY,
} from '../../shared/tournament/scheduling.js';

export const getTournamentSetup = async (req, res, next) => {
  try {
    const { league, startDate, groupCount: groupCountParam } = req.query;
    if (!league) {
      return res.status(400).json({ success: false, message: 'League query parameter is required' });
    }

    const [teams] = await pool.execute(
      'SELECT id FROM teams WHERE league = ? ORDER BY id',
      [league]
    );

    const options = getTournamentSetupOptions(teams.length);
    const resolvedGroupCount = groupCountParam
      ? Number(groupCountParam)
      : options.defaultGroupCount;

    let scheduling = null;
    if (options.isValid && resolvedGroupCount) {
      const qualifyingMatchCount = countQualifyingMatches(teams.length, resolvedGroupCount);
      scheduling = {
        slotsPerWeekday: SLOTS_PER_WEEKDAY,
        qualifyingMatchCount,
        minimumWeekdays: Math.ceil(qualifyingMatchCount / SLOTS_PER_WEEKDAY),
        suggestedEndDate: startDate
          ? suggestMinimumEndDate(startDate, qualifyingMatchCount)
          : null,
      };
    }

    res.json({
      success: true,
      data: {
        league,
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

    const matches = await getLeagueMatches(pool, league);
    const groups = await getGroupsFromMatches(pool, league);
    const groupOrder = Object.keys(groups).sort();
    const format = detectFormat(matches, groups);

    const config =
      groupOrder.length > 0
        ? {
            format,
            participantCount: Object.values(groups).reduce((sum, t) => sum + t.length, 0),
            groupCount: groupOrder.length,
            groupSize: groupOrder.length > 0
              ? Object.values(groups)[0]?.length || 0
              : 0,
            qualifiersPerGroup: format === 'pools-2' ? 4 : 2,
            poolIds: groupOrder.length > 0 ? groupOrder : getPoolIds(4),
          }
        : null;

    /** @type {Record<string, object[]>} */
    const standings = {};
    for (const [poolId, teams] of Object.entries(groups)) {
      const poolMatches = matches.filter((m) => m.pool === poolId);
      standings[poolId] = calculateGroupStandings(teams, poolMatches);
    }

    const status = deriveTournamentStatus(matches);
    const bracket = buildKnockoutBracket(matches, format);

    const [teamRows] = await pool.execute(
      'SELECT COUNT(*) as count FROM teams WHERE league = ?',
      [league]
    );
    const setupOptions = getTournamentSetupOptions(teamRows[0].count);

    res.json({
      success: true,
      data: {
        league,
        config,
        format,
        status,
        groups: Object.entries(groups).map(([id, teams]) => ({ id, teams })),
        standings,
        bracket,
        matches,
        setupOptions,
      },
    });
  } catch (error) {
    next(error);
  }
};
