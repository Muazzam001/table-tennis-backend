import pool from '../utils/database.js';

// Get all active players from database
export const getAllPlayers = async (req, res, next) => {
  try {
    // Query database to get all active players, sorted by name
    const [rows] = await pool.execute(
      'SELECT * FROM players WHERE is_active = TRUE ORDER BY name'
    );
    // Send success response with player data
    res.json({ success: true, data: rows });
  } catch (error) {
    // If error occurs, pass it to error handler middleware
    next(error);
  }
};

// Get a single player by their ID
export const getPlayerById = async (req, res, next) => {
  try {
    // Get the ID from URL parameters (e.g., /api/players/5)
    const { id } = req.params;
    
    // Query database to find player with this ID
    const [rows] = await pool.execute(
      'SELECT * FROM players WHERE id = ? AND is_active = TRUE',
      [id]
    );
    
    // If player not found, return 404 error
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    
    // Send player data
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

// Create a new player
export const createPlayer = async (req, res, next) => {
  try {
    // Get player data from request body (sent from frontend)
    const { name, email, expertise_level } = req.body;
    
    // Insert new player into database
    const [result] = await pool.execute(
      'INSERT INTO players (name, email, expertise_level) VALUES (?, ?, ?)',
      [name, email, expertise_level]
    );
    
    // Return success response with created player info
    res.status(201).json({
      success: true,
      message: 'Player created successfully',
      data: { id: result.insertId, name, email, expertise_level }
    });
  } catch (error) {
    // If email already exists, return specific error message
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already exists' 
      });
    }
    next(error);
  }
};

// Update an existing player
export const updatePlayer = async (req, res, next) => {
  try {
    // Get player ID from URL and update data from request body
    const { id } = req.params;
    const { name, email, expertise_level, is_active } = req.body;
    
    // Build update query dynamically (only update fields that are provided)
    const updateFields = [];
    const values = [];
    
    if (name !== undefined) {
      updateFields.push('name = ?');
      values.push(name);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      values.push(email);
    }
    if (expertise_level !== undefined) {
      updateFields.push('expertise_level = ?');
      values.push(expertise_level);
    }
    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      values.push(is_active);
    }
    
    // Add player ID at the end for WHERE clause
    values.push(id);
    
    // Update player in database
    const [result] = await pool.execute(
      `UPDATE players SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    // If no rows were updated, player doesn't exist
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    
    res.json({ success: true, message: 'Player updated successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete a player (soft delete - sets is_active to false instead of removing from database)
export const deletePlayer = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Soft delete: set is_active to false instead of deleting the record
    const [result] = await pool.execute(
      'UPDATE players SET is_active = FALSE WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    
    res.json({ success: true, message: 'Player deleted successfully' });
  } catch (error) {
    next(error);
  }
};

