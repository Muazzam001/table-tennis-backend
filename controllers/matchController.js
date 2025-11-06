import pool from '../utils/database.js';

// Get all matches
export const getAllMatches = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        m.id,
        m.team1_id,
        m.team2_id,
        m.scheduled_date,
        m.venue,
        m.status,
        m.winner_team_id,
        m.score_team1,
        m.score_team2,
        t1.team_name as team1_name,
        t2.team_name as team2_name,
        m.created_at
      FROM matches m
      INNER JOIN teams t1 ON m.team1_id = t1.id
      INNER JOIN teams t2 ON m.team2_id = t2.id
      ORDER BY m.scheduled_date ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// Get match by ID
export const getMatchById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(`
      SELECT 
        m.*,
        t1.team_name as team1_name,
        t2.team_name as team2_name
      FROM matches m
      INNER JOIN teams t1 ON m.team1_id = t1.id
      INNER JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

// Create match
export const createMatch = async (req, res, next) => {
  try {
    const { team1_id, team2_id, scheduled_date, venue } = req.body;
    
    if (team1_id === team2_id) {
      return res.status(400).json({ success: false, message: 'Teams must be different' });
    }
    
    const [result] = await pool.execute(
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue) VALUES (?, ?, ?, ?)',
      [team1_id, team2_id, scheduled_date, venue]
    );
    
    res.status(201).json({
      success: true,
      message: 'Match created successfully',
      data: { id: result.insertId, team1_id, team2_id, scheduled_date, venue }
    });
  } catch (error) {
    next(error);
  }
};

// Update match result
export const updateMatchResult = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { score_team1, score_team2, winner_team_id, status } = req.body;
    
    const [result] = await pool.execute(
      'UPDATE matches SET score_team1 = ?, score_team2 = ?, winner_team_id = ?, status = ? WHERE id = ?',
      [score_team1, score_team2, winner_team_id, status || 'Completed', id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }
    
    res.json({ success: true, message: 'Match result updated successfully' });
  } catch (error) {
    next(error);
  }
};

