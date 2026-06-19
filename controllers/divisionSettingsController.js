import pool from '../utils/database.js';
import {
  getAllDivisionSettings,
  getCompetitionFormat,
  setCompetitionFormat,
} from '../services/divisionSettingsService.js';
import { rejectInvalidDivision } from '../utils/divisionParam.js';

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
    const { division: rawDivision } = req.params;
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;
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
    const { division: rawDivision } = req.params;
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;
    const { competition_format: competitionFormat } = req.body;

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
