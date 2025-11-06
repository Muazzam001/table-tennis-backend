import pool from '../utils/database.js';

// Get all teams with player information
export const getAllTeams = async (req, res, next) => {
  try {
    // Query to get all teams with player names and expertise levels
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
        t.created_at,
        t.updated_at
      FROM teams t
      INNER JOIN players p1 ON t.player1_id = p1.id
      INNER JOIN players p2 ON t.player2_id = p2.id
      ORDER BY t.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    // Handle table not found errors gracefully
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') {
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
};

// Get a single team by ID
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
        t.created_at,
        t.updated_at
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

// Create a new team (manual creation)
export const createTeam = async (req, res, next) => {
  try {
    const { team_name, player1_id, player2_id } = req.body;
    
    // Check if players are different
    if (player1_id === player2_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'A team must have two different players' 
      });
    }
    
    // Get player information to validate expertise levels
    const [player1] = await pool.execute(
      'SELECT id, name, expertise_level FROM players WHERE id = ? AND is_active = TRUE',
      [player1_id]
    );
    const [player2] = await pool.execute(
      'SELECT id, name, expertise_level FROM players WHERE id = ? AND is_active = TRUE',
      [player2_id]
    );
    
    // Check if both players exist
    if (player1.length === 0 || player2.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'One or both players not found or inactive' 
      });
    }
    
    // IMPORTANT RULE: Each team must have one Intermediate and one Expert player
    const player1Level = player1[0].expertise_level;
    const player2Level = player2[0].expertise_level;
    
    if (player1Level === player2Level) {
      return res.status(400).json({ 
        success: false, 
        message: `Each team must have one Intermediate and one Expert player. Both players are ${player1Level}.` 
      });
    }
    
    // Create the team
    const [result] = await pool.execute(
      'INSERT INTO teams (team_name, player1_id, player2_id) VALUES (?, ?, ?)',
      [team_name, player1_id, player2_id]
    );
    
    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: { 
        id: result.insertId, 
        team_name, 
        player1_id, 
        player2_id,
        player1_name: player1[0].name,
        player1_expertise: player1Level,
        player2_name: player2[0].name,
        player2_expertise: player2Level
      }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        success: false, 
        message: 'This team combination already exists' 
      });
    }
    next(error);
  }
};

// Update an existing team
export const updateTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { team_name, player1_id, player2_id } = req.body;
    
    // Check if team exists
    const [existingTeam] = await pool.execute(
      'SELECT id FROM teams WHERE id = ?',
      [id]
    );
    
    if (existingTeam.length === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    // If players are being updated, validate them
    if (player1_id || player2_id) {
      // Get current team players if not provided
      const [currentTeam] = await pool.execute(
        'SELECT player1_id, player2_id FROM teams WHERE id = ?',
        [id]
      );
      
      const finalPlayer1Id = player1_id || currentTeam[0].player1_id;
      const finalPlayer2Id = player2_id || currentTeam[0].player2_id;
      
      // Check if players are different
      if (finalPlayer1Id === finalPlayer2Id) {
        return res.status(400).json({ 
          success: false, 
          message: 'A team must have two different players' 
        });
      }
      
      // Validate expertise levels
      const [player1] = await pool.execute(
        'SELECT expertise_level FROM players WHERE id = ? AND is_active = TRUE',
        [finalPlayer1Id]
      );
      const [player2] = await pool.execute(
        'SELECT expertise_level FROM players WHERE id = ? AND is_active = TRUE',
        [finalPlayer2Id]
      );
      
      if (player1.length === 0 || player2.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'One or both players not found or inactive' 
        });
      }
      
      // Check expertise levels
      if (player1[0].expertise_level === player2[0].expertise_level) {
        return res.status(400).json({ 
          success: false, 
          message: `Each team must have one Intermediate and one Expert player. Both players are ${player1[0].expertise_level}.` 
        });
      }
    }
    
    // Build update query dynamically
    const updateFields = [];
    const values = [];
    
    if (team_name !== undefined) {
      updateFields.push('team_name = ?');
      values.push(team_name);
    }
    if (player1_id !== undefined) {
      updateFields.push('player1_id = ?');
      values.push(player1_id);
    }
    if (player2_id !== undefined) {
      updateFields.push('player2_id = ?');
      values.push(player2_id);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No fields to update' 
      });
    }
    
    values.push(id);
    
    await pool.execute(
      `UPDATE teams SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    res.json({ success: true, message: 'Team updated successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        success: false, 
        message: 'This team combination already exists' 
      });
    }
    next(error);
  }
};

// Delete a team
export const deleteTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.execute(
      'DELETE FROM teams WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    
    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Generate random teams automatically
// Each team will have one Intermediate and one Expert player
export const generateRandomTeams = async (req, res, next) => {
  try {
    // Step 1: Get all active players
    const [players] = await pool.execute(
      'SELECT id, name, expertise_level FROM players WHERE is_active = TRUE'
    );
    
    // Step 2: Check if we have even number of players (for pairing)
    if (players.length % 2 !== 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot create teams. You have ${players.length} players. Need an even number of players.`
      });
    }
    
    // Step 3: Split players by expertise level
    const intermediatePlayers = players.filter(p => p.expertise_level === 'Intermediate');
    const expertPlayers = players.filter(p => p.expertise_level === 'Expert');
    
    // Step 4: Check if we have equal number of Intermediate and Expert players
    if (intermediatePlayers.length !== expertPlayers.length) {
      return res.status(400).json({
        success: false,
        message: `Cannot create teams. You have ${intermediatePlayers.length} Intermediate and ${expertPlayers.length} Expert players. Need equal numbers of each.`
      });
    }
    
    // Step 5: Shuffle players randomly (using ORDER BY RAND() in SQL)
    const [shuffledIntermediate] = await pool.execute(
      'SELECT id, name, expertise_level FROM players WHERE is_active = TRUE AND expertise_level = "Intermediate" ORDER BY RAND()'
    );
    const [shuffledExpert] = await pool.execute(
      'SELECT id, name, expertise_level FROM players WHERE is_active = TRUE AND expertise_level = "Expert" ORDER BY RAND()'
    );
    
    // Step 6: Clear existing teams (optional - you can modify this behavior)
    await pool.execute('DELETE FROM teams');
    
    // Step 7: Create teams - one Intermediate + one Expert per team
    const teams = [];
    const teamCount = shuffledIntermediate.length;
    
    for (let i = 0; i < teamCount; i++) {
      const teamName = `Team ${i + 1}`;
      const intermediatePlayer = shuffledIntermediate[i];
      const expertPlayer = shuffledExpert[i];
      
      // Insert team into database
      await pool.execute(
        'INSERT INTO teams (team_name, player1_id, player2_id) VALUES (?, ?, ?)',
        [teamName, intermediatePlayer.id, expertPlayer.id]
      );
      
      teams.push({
        teamName,
        player1: intermediatePlayer,
        player2: expertPlayer
      });
    }
    
    res.status(201).json({
      success: true,
      message: `${teamCount} teams generated successfully`,
      data: teams
    });
  } catch (error) {
    next(error);
  }
};

