import pool from '../utils/database.js';
import {
  getAllDivisionSettings,
  getCompetitionFormat,
  setCompetitionFormat,
} from '../services/divisionSettingsService.js';
import { VALID_DIVISIONS } from '@shared/tournament/competitionFormat.js';

export const listDivisionSettings = async (req, res, next) => {
  try {
    const settings = await getAllDivisionSettings(pool);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

export const getDivisionSetting = async (req, res, next) => {
  try {
    const { division } = req.params;
    if (!VALID_DIVISIONS.includes(division)) {
      return res.status(400).json({ success: false, message: 'Invalid division' });
    }

    const competitionFormat = await getCompetitionFormat(pool, division);
    res.json({
      success: true,
      data: { division, competition_format: competitionFormat },
    });
  } catch (error) {
    next(error);
  }
};

export const updateDivisionSetting = async (req, res, next) => {
  try {
    const { division } = req.params;
    const { competition_format: competitionFormat } = req.body;

    if (!VALID_DIVISIONS.includes(division)) {
      return res.status(400).json({ success: false, message: 'Invalid division' });
    }

    const updated = await setCompetitionFormat(pool, division, competitionFormat);
    res.json({
      success: true,
      message: `${division} division set to ${updated}`,
      data: { division, competition_format: updated },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};
