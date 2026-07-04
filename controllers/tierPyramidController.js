import pool from '../utils/database.js';
import {
  assignTiers,
  getTierAssignments,
  getTierPyramidSetupForDivision,
} from '../services/tierPyramidService.js';
import {
  getPyramidProgressionLog,
  overridePyramidAdvancement,
  regeneratePyramidStage,
  activateLevel1B,
} from '../services/tierPyramidProgressionService.js';
import { rejectInvalidDivision } from '../utils/divisionParam.js';

const REGENERATE_FROM_STAGES = ['Level 1', 'S1', 'S2', 'Level 1B', 'Level 2', 'Level 3', 'Final'];

export const getPyramidTiers = async (req, res, next) => {
  try {
    const { division: rawDivision } = req.query;
    if (!rawDivision) {
      return res.status(400).json({ success: false, message: 'Division query parameter is required' });
    }
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;

    const data = await getTierAssignments(pool, division);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const assignPyramidTiers = async (req, res, next) => {
  try {
    const { division: rawDivision, assignments, format_config: formatConfig } = req.body;
    if (!rawDivision) {
      return res.status(400).json({ success: false, message: 'Division is required' });
    }
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'assignments array is required with { teamId, tier } entries',
      });
    }

    const data = await assignTiers(pool, division, assignments, formatConfig ?? null);
    res.json({
      success: true,
      message: `Tier assignments saved for ${division} division`,
      data,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const getPyramidSetup = async (req, res, next) => {
  try {
    const { division: rawDivision } = req.query;
    if (!rawDivision) {
      return res.status(400).json({ success: false, message: 'Division query parameter is required' });
    }
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;

    const data = await getTierPyramidSetupForDivision(pool, division);
    res.json({ success: true, data: { division, ...data } });
  } catch (error) {
    next(error);
  }
};

export const getPyramidProgressionLogHandler = async (req, res, next) => {
  try {
    const { division: rawDivision, limit: rawLimit } = req.query;
    if (!rawDivision) {
      return res.status(400).json({ success: false, message: 'Division query parameter is required' });
    }
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;

    const limit = rawLimit ? Number(rawLimit) : 100;
    const data = await getPyramidProgressionLog(pool, division, limit);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const overridePyramidAdvancementHandler = async (req, res, next) => {
  try {
    const { division: rawDivision, updates, notes } = req.body;
    if (!rawDivision) {
      return res.status(400).json({ success: false, message: 'Division is required' });
    }
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;

    const data = await overridePyramidAdvancement(
      pool,
      division,
      updates,
      req.user?.id ?? null,
      notes ?? null
    );
    res.json({
      success: true,
      message: `Advancement override applied for ${data.updated} team(s)`,
      data,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const regeneratePyramidStageHandler = async (req, res, next) => {
  try {
    const { division: rawDivision, fromStage } = req.body;
    if (!rawDivision) {
      return res.status(400).json({ success: false, message: 'Division is required' });
    }
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;

    if (!fromStage || !REGENERATE_FROM_STAGES.includes(fromStage)) {
      return res.status(400).json({
        success: false,
        message: `fromStage is required (${REGENERATE_FROM_STAGES.join(', ')})`,
      });
    }

    const data = await regeneratePyramidStage(pool, division, fromStage, req.user?.id ?? null);
    res.json({
      success: true,
      message: `Pyramid regenerated from ${fromStage}`,
      data,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const activateLevel1BHandler = async (req, res, next) => {
  try {
    const { division: rawDivision } = req.body;
    if (!rawDivision) {
      return res.status(400).json({ success: false, message: 'Division is required' });
    }
    const division = rejectInvalidDivision(res, rawDivision);
    if (division === undefined) return;

    const data = await activateLevel1B(pool, division);
    res.json({
      success: true,
      message: `Level 1B activated (${data.matchesCreated} matches)`,
      data,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};
