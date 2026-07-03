import pool from '../utils/database.js';
import { isMissingTableError } from '../utils/dbErrors.js';

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
    if (isMissingTableError(error)) {
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
    // Run all queries in parallel: combined counts + expertise breakdown + round breakdown
    const [countsResult, expertiseResult, roundResult] = await Promise.allSettled([
      safeQuery(
        `SELECT
          (SELECT COUNT(*) FROM players WHERE is_active = TRUE) AS total_players,
          (SELECT COUNT(*) FROM teams)                          AS total_teams,
          (SELECT COUNT(*) FROM matches)                        AS total_matches,
          (SELECT COUNT(*) FROM matches WHERE status = 'Completed') AS completed_matches,
          (SELECT COUNT(*) FROM matches WHERE status != 'Completed' OR status IS NULL) AS upcoming_matches`,
        [],
        null
      ),
      pool
        .execute(
          `SELECT expertise_level, COUNT(*) as count FROM players WHERE is_active = TRUE GROUP BY expertise_level`
        )
        .catch((error) => {
          if (isMissingTableError(error)) return [[]];
          throw error;
        }),
      pool
        .execute(`SELECT round_type, COUNT(*) as count FROM matches GROUP BY round_type`)
        .catch((error) => {
          if (isMissingTableError(error)) return [[]];
          throw error;
        }),
    ]);

    const countsRow =
      countsResult.status === 'fulfilled' && countsResult.value?.[0]
        ? countsResult.value[0]
        : {};
    const totalPlayersValue  = Number(countsRow.total_players)      || 0;
    const totalTeamsValue    = Number(countsRow.total_teams)         || 0;
    const totalMatchesValue  = Number(countsRow.total_matches)       || 0;
    const completedMatchesValue = Number(countsRow.completed_matches) || 0;
    const upcomingMatchesValue  = Number(countsRow.upcoming_matches)  || 0;

    const expertiseStats =
      expertiseResult.status === 'fulfilled' ? expertiseResult.value[0] ?? [] : [];
    const roundStats =
      roundResult.status === 'fulfilled' ? roundResult.value[0] ?? [] : [];
    
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



