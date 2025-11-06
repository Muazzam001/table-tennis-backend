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

// Helper function to safely execute query and return default value on error
const safeQuery = async (query, params = [], defaultValue = 0) => {
  try {
    const [result] = await pool.execute(query, params);
    console.log(`Query result for "${query.substring(0, 50)}...":`, result);
    // COUNT(*) always returns at least one row, so result should have at least one element
    if (Array.isArray(result) && result.length > 0) {
      return result;
    }
    // If no results, return default
    console.log('Query returned no results, using default:', defaultValue);
    return [{ count: defaultValue }];
  } catch (error) {
    // If table doesn't exist, return default value
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') {
      console.log('Table not found, returning default value');
      return [{ count: defaultValue }];
    }
    // For other errors, log and return default
    console.error('Query error:', error.message);
    return [{ count: defaultValue }];
  }
};

// Get dashboard statistics (overview stats for homepage)
export const getDashboardStats = async (req, res, next) => {
  try {
    // Get total active players (with error handling)
    const playerCountResult = await safeQuery(
      'SELECT COUNT(*) as count FROM players WHERE is_active = TRUE',
      [],
      0
    );
    const totalPlayersValue = playerCountResult && playerCountResult[0] ? Number(playerCountResult[0].count) : 0;
    
    // Get total teams (with error handling)
    const teamCountResult = await safeQuery(
      'SELECT COUNT(*) as count FROM teams',
      [],
      0
    );
    const totalTeamsValue = teamCountResult && teamCountResult[0] ? Number(teamCountResult[0].count) : 0;
    
    // Get total matches (with error handling)
    const matchCountResult = await safeQuery(
      'SELECT COUNT(*) as count FROM matches',
      [],
      0
    );
    const totalMatchesValue = matchCountResult && matchCountResult[0] ? Number(matchCountResult[0].count) : 0;
    
    // Get completed matches (with error handling)
    const completedMatchesResult = await safeQuery(
      "SELECT COUNT(*) as count FROM matches WHERE status = 'Completed'",
      [],
      0
    );
    const completedMatchesValue = completedMatchesResult && completedMatchesResult[0] ? Number(completedMatchesResult[0].count) : 0;
    
    // Get upcoming matches (with error handling)
    const upcomingMatchesResult = await safeQuery(
      "SELECT COUNT(*) as count FROM matches WHERE status != 'Completed' OR status IS NULL",
      [],
      0
    );
    const upcomingMatchesValue = upcomingMatchesResult && upcomingMatchesResult[0] ? Number(upcomingMatchesResult[0].count) : 0;
    
    // Get players by expertise level (with error handling)
    let expertiseStats = [];
    try {
      [expertiseStats] = await pool.execute(
        `SELECT 
          expertise_level, 
          COUNT(*) as count 
        FROM players 
        WHERE is_active = TRUE 
        GROUP BY expertise_level`
      );
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') {
        expertiseStats = [];
      } else {
        throw error;
      }
    }
    
    // Get matches by round type (with error handling)
    let roundStats = [];
    try {
      [roundStats] = await pool.execute(
        `SELECT 
          round_type, 
          COUNT(*) as count 
        FROM matches 
        GROUP BY round_type`
      );
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') {
        roundStats = [];
      } else {
        throw error;
      }
    }
    
    console.log('Dashboard stats calculated:', {
      totalPlayers: totalPlayersValue,
      totalTeams: totalTeamsValue,
      totalMatches: totalMatchesValue,
      completedMatches: completedMatchesValue,
      upcomingMatches: upcomingMatchesValue
    });
    
    const responseData = {
      totalPlayers: totalPlayersValue,
      totalTeams: totalTeamsValue,
      totalMatches: totalMatchesValue,
      completedMatches: completedMatchesValue,
      upcomingMatches: upcomingMatchesValue,
      expertiseLevels: expertiseStats.reduce((acc, stat) => {
        acc[stat.expertise_level] = Number(stat.count) || 0;
        return acc;
      }, {}),
      matchesByRound: roundStats.reduce((acc, stat) => {
        acc[stat.round_type] = Number(stat.count) || 0;
        return acc;
      }, {})
    };
    
    console.log('Sending dashboard stats response:', responseData);
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    // Sanitize error before sending
    const sanitizeError = (err) => {
      if (!err) return 'An error occurred';
      let message = typeof err === 'string' ? err : err.message || 'An error occurred';
      message = message.replace(/table_tennis_tournament/gi, 'database');
      message = message.replace(/\b(players|teams|matches|statistics|match_details)\b/gi, 'table');
      message = message.replace(/Table\s+['"]?[\w_]+['"]?\s+doesn't exist/gi, 'Required table does not exist');
      return message;
    };
    
    console.error('Dashboard stats error:', error.message);
    res.status(500).json({
      success: false,
      message: sanitizeError('Failed to load dashboard statistics. Please seed the database first.'),
      error: sanitizeError(error.message)
    });
  }
};



