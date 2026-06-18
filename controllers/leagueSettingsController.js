import pool from '../utils/database.js';
import {
  getAllLeagueSettings,
  getCompetitionFormat,
  setCompetitionFormat,
} from '../services/leagueSettingsService.js';
import { VALID_LEAGUES } from '@shared/tournament/competitionFormat.js';

export const listLeagueSettings = async (req, res, next) => {
  try {
    const settings = await getAllLeagueSettings(pool);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

export const getLeagueSetting = async (req, res, next) => {
  try {
    const { league } = req.params;
    if (!VALID_LEAGUES.includes(league)) {
      return res.status(400).json({ success: false, message: 'Invalid league' });
    }

    const competitionFormat = await getCompetitionFormat(pool, league);
    res.json({
      success: true,
      data: { league, competition_format: competitionFormat },
    });
  } catch (error) {
    next(error);
  }
};

export const updateLeagueSetting = async (req, res, next) => {
  try {
    const { league } = req.params;
    const { competition_format: competitionFormat } = req.body;

    if (!VALID_LEAGUES.includes(league)) {
      return res.status(400).json({ success: false, message: 'Invalid league' });
    }

    const updated = await setCompetitionFormat(pool, league, competitionFormat);
    res.json({
      success: true,
      message: `${league} league set to ${updated}`,
      data: { league, competition_format: updated },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};
