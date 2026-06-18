import pool from '../utils/database.js';
import {
  archiveCompletedLeague,
  listTournamentArchives,
  getTournamentArchiveById,
} from '../services/tournamentArchiveService.js';

export const archiveTournament = async (req, res, next) => {
  try {
    const { league } = req.query;
    if (!league) {
      return res.status(400).json({ success: false, message: 'League query parameter is required' });
    }

    const result = await archiveCompletedLeague(pool, league);

    res.json({
      success: true,
      message: `${league} tournament archived successfully. You can now start a new season for this league.`,
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
    const { league } = req.query;
    const archives = await listTournamentArchives(pool, { league });

    res.json({
      success: true,
      data: archives.map((row) => ({
        id: row.id,
        league: row.league,
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
