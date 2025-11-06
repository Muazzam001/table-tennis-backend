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

// Get dashboard statistics (overview stats for homepage)
export const getDashboardStats = async (req, res, next) => {
  try {
    // Get total active players
    const [playerCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM players WHERE is_active = TRUE'
    );
    
    // Get total teams
    const [teamCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM teams'
    );
    
    // Get total matches
    const [matchCount] = await pool.execute(
      'SELECT COUNT(*) as count FROM matches'
    );
    
    // Get completed matches
    const [completedMatches] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE status = 'Completed'"
    );
    
    // Get upcoming matches (scheduled but not completed)
    const [upcomingMatches] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE status != 'Completed' OR status IS NULL"
    );
    
    // Get players by expertise level
    const [expertiseStats] = await pool.execute(
      `SELECT 
        expertise_level, 
        COUNT(*) as count 
      FROM players 
      WHERE is_active = TRUE 
      GROUP BY expertise_level`
    );
    
    // Get matches by round type
    const [roundStats] = await pool.execute(
      `SELECT 
        round_type, 
        COUNT(*) as count 
      FROM matches 
      GROUP BY round_type`
    );
    
    res.json({
      success: true,
      data: {
        totalPlayers: playerCount[0]?.count || 0,
        totalTeams: teamCount[0]?.count || 0,
        totalMatches: matchCount[0]?.count || 0,
        completedMatches: completedMatches[0]?.count || 0,
        upcomingMatches: upcomingMatches[0]?.count || 0,
        expertiseLevels: expertiseStats.reduce((acc, stat) => {
          acc[stat.expertise_level] = stat.count;
          return acc;
        }, {}),
        matchesByRound: roundStats.reduce((acc, stat) => {
          acc[stat.round_type] = stat.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    next(error);
  }
};


