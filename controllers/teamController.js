import pool from '../utils/database.js';

// Get all teams
export const getAllTeams = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        t.id,
        t.team_name,
        t.player1_id,
        t.player2_id,
        p1.name as player1_name,
        p1.expertise_level as player1_expertise,
        p2.name as player2_name,
        p2.expertise_level as player2_expertise,
        t.created_at
      FROM teams t
      INNER JOIN players p1 ON t.player1_id = p1.id
      INNER JOIN players p2 ON t.player2_id = p2.id
      ORDER BY t.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// Get team by ID
export const getTeamById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(`
      SELECT 
        t.id,
        t.team_name,
        t.player1_id,
        t.player2_id,
        p1.name as player1_name,
        p1.expertise_level as player1_expertise,
        p2.name as player2_name,
        p2.expertise_level as player2_expertise,
        t.created_at
      FROM teams t
      INNER JOIN players p1 ON t.player1_id = p1.id
      INNER JOIN players p2 ON t.player2_id = p2.id
      WHERE t.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

// Create team
export const createTeam = async (req, res, next) => {
  try {
    const { team_name, player1_id, player2_id } = req.body;
    
    if (player1_id === player2_id) {
      return res.status(400).json({ success: false, message: 'Players must be different' });
    }
    
    const [result] = await pool.execute(
      'INSERT INTO teams (team_name, player1_id, player2_id) VALUES (?, ?, ?)',
      [team_name, player1_id, player2_id]
    );
    
    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: { id: result.insertId, team_name, player1_id, player2_id }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Team already exists' });
    }
    next(error);
  }
};

// Generate random teams (12 teams from 24 players)
export const generateRandomTeams = async (req, res, next) => {
  try {
    // Get all active players
    const [players] = await pool.execute(
      'SELECT id, name, expertise_level FROM players WHERE is_active = TRUE ORDER BY RAND()'
    );
    
    if (players.length !== 24) {
      return res.status(400).json({
        success: false,
        message: `Expected 24 players, but found ${players.length}. Please ensure exactly 24 active players.`
      });
    }
    
    // Clear existing teams (optional - you might want to handle this differently)
    await pool.execute('DELETE FROM teams');
    
    // Split players by expertise
    const intermediate = players.filter(p => p.expertise_level === 'Intermediate');
    const expert = players.filter(p => p.expertise_level === 'Expert');
    
    // Create teams ensuring balanced distribution
    const teams = [];
    let teamNumber = 1;
    
    // Pair intermediate players (6 teams)
    for (let i = 0; i < intermediate.length; i += 2) {
      const teamName = `Team ${teamNumber}`;
      await pool.execute(
        'INSERT INTO teams (team_name, player1_id, player2_id) VALUES (?, ?, ?)',
        [teamName, intermediate[i].id, intermediate[i + 1].id]
      );
      teams.push({ teamName, player1: intermediate[i], player2: intermediate[i + 1] });
      teamNumber++;
    }
    
    // Pair expert players (6 teams)
    for (let i = 0; i < expert.length; i += 2) {
      const teamName = `Team ${teamNumber}`;
      await pool.execute(
        'INSERT INTO teams (team_name, player1_id, player2_id) VALUES (?, ?, ?)',
        [teamName, expert[i].id, expert[i + 1].id]
      );
      teams.push({ teamName, player1: expert[i], player2: expert[i + 1] });
      teamNumber++;
    }
    
    res.status(201).json({
      success: true,
      message: '12 teams generated successfully',
      data: teams
    });
  } catch (error) {
    next(error);
  }
};

