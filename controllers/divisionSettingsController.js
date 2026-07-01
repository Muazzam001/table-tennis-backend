import pool from '../utils/database.js';
import {
  getAllDivisionSettings,
  getDivisionSettings,
  setCompetitionFormat,
  setTournamentFormat,
} from '../services/divisionSettingsService.js';
import { rejectInvalidDivision } from '../utils/divisionParam.js';

const VALID_TOURNAMENT_FORMATS = ['groups', 'single-group', 'pools-2', 'tier-pyramid'];

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
    const settings = await getDivisionSettings(pool, division);
    res.json({
      success: true,
      data: settings,
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
    const { competition_format: competitionFormat, tournament_format: tournamentFormat, format_config: formatConfig } =
      req.body;

    if (tournamentFormat != null) {
      if (!VALID_TOURNAMENT_FORMATS.includes(tournamentFormat)) {
        return res.status(400).json({ success: false, message: 'Invalid tournament_format' });
      }
      const updated = await setTournamentFormat(pool, division, tournamentFormat, formatConfig ?? null);
      return res.json({
        success: true,
        message: `${division} tournament format set to ${updated.tournament_format}`,
        data: updated,
      });
    }

    if (!competitionFormat) {
      return res.status(400).json({ success: false, message: 'competition_format or tournament_format is required' });
    }

    const updated = await setCompetitionFormat(pool, division, competitionFormat);
    res.json({
      success: true,
      message: `${division} division set to ${updated}`,
      data: await getDivisionSettings(pool, division),
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};
