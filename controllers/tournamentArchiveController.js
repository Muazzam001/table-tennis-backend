import pool from '../utils/database.js';
import {
  archiveCompletedDivision,
  listTournamentArchives,
  getTournamentArchiveById,
} from '../services/tournamentArchiveService.js';

export const archiveTournament = async (req, res, next) => {
  try {
    const { division } = req.query;
    if (!division) {
      return res.status(400).json({ success: false, message: 'Division query parameter is required' });
    }

    const result = await archiveCompletedDivision(pool, division);

    res.json({
      success: true,
      message: `${division} tournament archived successfully. You can now start a new season for this division.`,
      data: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const getTournamentHistory = async (req, res, next) => {
  try {
    const { division } = req.query;
    const archives = await listTournamentArchives(pool, { division });

    res.json({
      success: true,
      data: archives.map((row) => ({
        id: row.id,
        division: row.division,
        name: row.name,
        completedAt: row.completed_at,
        archivedAt: row.archived_at,
        championTeamName: row.champion_team_name,
        runnerUpTeamName: row.runner_up_team_name,
        participantCount: row.participant_count,
      })),
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const getTournamentHistoryDetail = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid archive id' });
    }

    const archive = await getTournamentArchiveById(pool, id);
    if (!archive) {
      return res.status(404).json({ success: false, message: 'Archived tournament not found' });
    }

    res.json({
      success: true,
      data: archive,
    });
  } catch (error) {
    next(error);
  }
};
