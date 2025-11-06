import pool from '../utils/database.js';

// Get all statistics
export const getAllStatistics = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        s.id,
        s.player_id,
        s.team_id,
        p.name as player_name,
        t.team_name,
        s.matches_played,
        s.matches_won,
        s.matches_lost,
        s.total_points_scored,
        s.total_points_conceded,
        s.win_percentage,
        s.updated_at
      FROM statistics s
      INNER JOIN players p ON s.player_id = p.id
      INNER JOIN teams t ON s.team_id = t.id
      ORDER BY s.win_percentage DESC, s.matches_won DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// Get statistics by player ID
export const getPlayerStatistics = async (req, res, next) => {
  try {
    const { playerId } = req.params;
    const [rows] = await pool.execute(`
      SELECT 
        s.*,
        p.name as player_name,
        t.team_name
      FROM statistics s
      INNER JOIN players p ON s.player_id = p.id
      INNER JOIN teams t ON s.team_id = t.id
      WHERE s.player_id = ?
      ORDER BY s.win_percentage DESC
    `, [playerId]);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// Get statistics by team ID
export const getTeamStatistics = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const [rows] = await pool.execute(`
      SELECT 
        s.*,
        p.name as player_name,
        t.team_name
      FROM statistics s
      INNER JOIN players p ON s.player_id = p.id
      INNER JOIN teams t ON s.team_id = t.id
      WHERE s.team_id = ?
    `, [teamId]);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};


