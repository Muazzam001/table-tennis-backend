import pool from '../utils/database.js';

// Get all players
export const getAllPlayers = async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM players WHERE is_active = TRUE ORDER BY name'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// Get player by ID
export const getPlayerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT * FROM players WHERE id = ? AND is_active = TRUE',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

// Create player
export const createPlayer = async (req, res, next) => {
  try {
    const { name, email, expertise_level } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO players (name, email, expertise_level) VALUES (?, ?, ?)',
      [name, email, expertise_level]
    );
    
    res.status(201).json({
      success: true,
      message: 'Player created successfully',
      data: { id: result.insertId, name, email, expertise_level }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    next(error);
  }
};

// Update player
export const updatePlayer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, expertise_level, is_active } = req.body;
    
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
    
    values.push(id);
    
    const [result] = await pool.execute(
      `UPDATE players SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    
    res.json({ success: true, message: 'Player updated successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete player (soft delete)
export const deletePlayer = async (req, res, next) => {
  try {
    const { id } = req.params;
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

