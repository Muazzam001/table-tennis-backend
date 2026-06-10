import pool from '../utils/database.js';
import { buildDefaultTeamName, normalizeTeamName } from '../../shared/teamNaming.js';
import { resetTournamentData } from '../utils/tournamentDataReset.js';

// Get all teams with player information
export const getAllTeams = async (req, res, next) => {
  try {
    // Query to get all teams with player names and expertise levels
    const [rows] = await pool.execute(`
      SELECT 
        t.id,
        t.team_name,
        t.league,
        t.player1_id,
        t.player2_id,
        p1.name as player1_name,
        p1.expertise_level as player1_expertise,
        p1.category as player1_category,
        p2.name as player2_name,
        p2.expertise_level as player2_expertise,
        p2.category as player2_category,
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
        t.league,
        t.player1_id,
        t.player2_id,
        p1.name as player1_name,
        p1.expertise_level as player1_expertise,
        p1.category as player1_category,
        p2.name as player2_name,
        p2.expertise_level as player2_expertise,
        p2.category as player2_category,
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
    
    // Get player information to validate expertise levels and category
    const [player1] = await pool.execute(
      'SELECT id, name, expertise_level, category FROM players WHERE id = ? AND is_active = TRUE',
      [player1_id]
    );
    const [player2] = await pool.execute(
      'SELECT id, name, expertise_level, category FROM players WHERE id = ? AND is_active = TRUE',
      [player2_id]
    );
    
    // Check if both players exist
    if (player1.length === 0 || player2.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'One or both players not found or inactive' 
      });
    }
    
    // Get player categories
    const player1Level = player1[0].expertise_level;
    const player2Level = player2[0].expertise_level;
    const player1Category = player1[0].category || 'Men';
    const player2Category = player2[0].category || 'Men';
    
    // Determine league based on players
    let league = null;
    if (player1Category === 'Women' || player2Category === 'Women') {
      // Women league: both players must be Women
      if (player1Category !== 'Women' || player2Category !== 'Women') {
        return res.status(400).json({ 
          success: false, 
          message: 'Women League teams must have two Women players.' 
        });
      }
      league = 'Women';
    } else if (player1Level === 'Expert' && player2Level === 'Expert') {
      // Expert league: both players must be Expert
      league = 'Expert';
    } else if (player1Level === 'Intermediate' && player2Level === 'Intermediate') {
      // Intermediate league: both players must be Intermediate
      league = 'Intermediate';
    } else {
      // Mixed levels not allowed - teams must be in same league
      return res.status(400).json({ 
        success: false, 
        message: `Teams must have players from the same league. Player 1 is ${player1Level}, Player 2 is ${player2Level}.` 
      });
    }
    
    const normalizedName = normalizeTeamName(String(team_name || '').trim(), league);
    if (!normalizedName) {
      return res.status(400).json({ success: false, message: 'Team name is required' });
    }

    // Create the team
    const [result] = await pool.execute(
      'INSERT INTO teams (team_name, player1_id, player2_id, league) VALUES (?, ?, ?, ?)',
      [normalizedName, player1_id, player2_id, league]
    );
    
    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: { 
        id: result.insertId, 
        team_name: normalizedName, 
        player1_id, 
        player2_id,
        player1_name: player1[0].name,
        player1_expertise: player1Level,
        player1_category: player1Category,
        player2_name: player2[0].name,
        player2_expertise: player2Level,
        player2_category: player2Category,
        league: league
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
    
    // Build update query dynamically
    const updateFields = [];
    const values = [];
    
    // If players are being updated, validate them
    if (player1_id !== undefined || player2_id !== undefined) {
      // Get current team players if not provided
      const [currentTeam] = await pool.execute(
        'SELECT player1_id, player2_id FROM teams WHERE id = ?',
        [id]
      );
      
      const finalPlayer1Id = player1_id !== undefined ? player1_id : currentTeam[0].player1_id;
      const finalPlayer2Id = player2_id !== undefined ? player2_id : currentTeam[0].player2_id;
      
      // Check if players are different
      if (finalPlayer1Id === finalPlayer2Id) {
        return res.status(400).json({ 
          success: false, 
          message: 'A team must have two different players' 
        });
      }
      
      // Validate expertise levels and category
      const [player1] = await pool.execute(
        'SELECT expertise_level, category FROM players WHERE id = ? AND is_active = TRUE',
        [finalPlayer1Id]
      );
      const [player2] = await pool.execute(
        'SELECT expertise_level, category FROM players WHERE id = ? AND is_active = TRUE',
        [finalPlayer2Id]
      );
      
      if (player1.length === 0 || player2.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'One or both players not found or inactive' 
        });
      }
      
      // Determine league based on players
      const player1Level = player1[0].expertise_level;
      const player2Level = player2[0].expertise_level;
      const player1Category = player1[0].category || 'Men';
      const player2Category = player2[0].category || 'Men';
      
      let league = null;
      if (player1Category === 'Women' || player2Category === 'Women') {
        if (player1Category !== 'Women' || player2Category !== 'Women') {
          return res.status(400).json({ 
            success: false, 
            message: 'Women League teams must have two Women players.' 
          });
        }
        league = 'Women';
      } else if (player1Level === 'Expert' && player2Level === 'Expert') {
        league = 'Expert';
      } else if (player1Level === 'Intermediate' && player2Level === 'Intermediate') {
        league = 'Intermediate';
      } else {
        return res.status(400).json({ 
          success: false, 
          message: `Teams must have players from the same league. Player 1 is ${player1Level}, Player 2 is ${player2Level}.` 
        });
      }
      
      // Update league field when players change
      updateFields.push('league = ?');
      values.push(league);
    }
    
    if (team_name !== undefined) {
      const [currentLeagueRow] = await pool.execute('SELECT league FROM teams WHERE id = ?', [id]);
      const trimmedName = normalizeTeamName(
        String(team_name).trim(),
        currentLeagueRow[0]?.league
      );
      if (!trimmedName) {
        return res.status(400).json({ success: false, message: 'Team name is required' });
      }
      updateFields.push('team_name = ?');
      values.push(trimmedName);
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
      'SELECT id, name, expertise_level, category FROM players WHERE is_active = TRUE'
    );
    
    // Step 2: Check if we have even number of players (for pairing)
    if (players.length % 2 !== 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot create teams. You have ${players.length} players. Need an even number of players.`
      });
    }
    
    // Step 3: Split players by league
    const expertPlayers = players.filter(p => p.expertise_level === 'Expert' && (p.category === 'Men' || !p.category));
    const intermediatePlayers = players.filter(p => p.expertise_level === 'Intermediate' && (p.category === 'Men' || !p.category));
    const womenPlayers = players.filter(p => p.category === 'Women');
    
    // Step 4: Check if we have enough players for at least one league
    const leaguesToCreate = [];
    if (expertPlayers.length >= 2 && expertPlayers.length % 2 === 0) {
      leaguesToCreate.push({ name: 'Expert', players: expertPlayers });
    }
    if (intermediatePlayers.length >= 2 && intermediatePlayers.length % 2 === 0) {
      leaguesToCreate.push({ name: 'Intermediate', players: intermediatePlayers });
    }
    if (womenPlayers.length >= 2 && womenPlayers.length % 2 === 0) {
      leaguesToCreate.push({ name: 'Women', players: womenPlayers });
    }
    
    if (leaguesToCreate.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot create teams. Need at least 2 players per league with even numbers. Expert: ${expertPlayers.length}, Intermediate: ${intermediatePlayers.length}, Women: ${womenPlayers.length}`
      });
    }
    
    // Step 5: Clear teams, matches, and statistics (IDs restart from 1)
    const connection = await pool.getConnection();
    try {
      await resetTournamentData(connection, { includePlayers: false });
    } finally {
      connection.release();
    }
    
    // Step 6: Create teams for each league
    const allTeams = [];
    
    for (const league of leaguesToCreate) {
      // Shuffle players randomly for this league
      let shuffledPlayers = [];
      if (league.name === 'Expert') {
        [shuffledPlayers] = await pool.execute(
          'SELECT id, name, expertise_level, category FROM players WHERE is_active = TRUE AND expertise_level = "Expert" AND (category = "Men" OR category IS NULL) ORDER BY RAND()'
        );
      } else if (league.name === 'Intermediate') {
        [shuffledPlayers] = await pool.execute(
          'SELECT id, name, expertise_level, category FROM players WHERE is_active = TRUE AND expertise_level = "Intermediate" AND (category = "Men" OR category IS NULL) ORDER BY RAND()'
        );
      } else if (league.name === 'Women') {
        [shuffledPlayers] = await pool.execute(
          'SELECT id, name, expertise_level, category FROM players WHERE is_active = TRUE AND category = "Women" ORDER BY RAND()'
        );
      }
      
      const teamCount = Math.floor(shuffledPlayers.length / 2);
      
      for (let i = 0; i < teamCount; i++) {
        const teamName = buildDefaultTeamName(i + 1);
        const player1 = shuffledPlayers[i * 2];
        const player2 = shuffledPlayers[i * 2 + 1];
        
        // Insert team into database
        await pool.execute(
          'INSERT INTO teams (team_name, player1_id, player2_id, league) VALUES (?, ?, ?, ?)',
          [teamName, player1.id, player2.id, league.name]
        );
        
        allTeams.push({
          teamName,
          league: league.name,
          player1: player1,
          player2: player2
        });
      }
    }
    
    const teams = allTeams;
    const teamCount = teams.length;
    
    res.status(201).json({
      success: true,
      message: `${teamCount} teams generated successfully`,
      data: teams
    });
  } catch (error) {
    next(error);
  }
};





