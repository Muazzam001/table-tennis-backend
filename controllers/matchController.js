import pool from '../utils/database.js';

// Helper function to format date for MySQL (YYYY-MM-DD HH:MM:SS)
const formatDateForMySQL = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Helper function to check if a date is a weekend (Saturday = 6, Sunday = 0)
const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
};

// Helper function to skip weekends and move to next weekday
const skipWeekends = (date) => {
  let currentDate = new Date(date);
  while (isWeekend(currentDate)) {
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return currentDate;
};

// Helper function to get next available time slot (7PM-10PM, 30-minute intervals)
// Returns a date object with the next available slot
// Maximum 6 matches per day (7:00 PM, 7:30 PM, 8:00 PM, 8:30 PM, 9:00 PM, 9:30 PM)
// Each match is 30 minutes long
// Excludes weekends (Saturday and Sunday)
const getNextTimeSlot = (currentDate) => {
  let slot = new Date(currentDate);
  
  // Skip weekends first
  slot = skipWeekends(slot);
  
  // Get current hour and minute
  const currentHour = slot.getHours();
  const currentMinute = slot.getMinutes();
  
  // If current time is before 7PM, set to 7PM on the same day
  if (currentHour < 19) {
    slot.setHours(19, 0, 0, 0);
    // Check if this is a weekend after setting time
    if (isWeekend(slot)) {
      slot.setDate(slot.getDate() + 1);
      slot = skipWeekends(slot);
      slot.setHours(19, 0, 0, 0);
    }
    return slot;
  }
  
  // If current time is 10PM or later, move to next weekday at 7PM
  if (currentHour >= 22) {
    slot.setDate(slot.getDate() + 1);
    slot = skipWeekends(slot);
    slot.setHours(19, 0, 0, 0);
    return slot;
  }
  
  // Calculate next 30-minute slot within 7PM-10PM window
  // Available slots: 19:00, 19:30, 20:00, 20:30, 21:00, 21:30
  let nextHour = currentHour;
  let nextMinute = 0;
  
  // If current minute is 0, next slot is :30 of same hour
  // If current minute is 30, next slot is :00 of next hour
  if (currentMinute < 30) {
    nextMinute = 30;
  } else {
    nextMinute = 0;
    nextHour += 1;
  }
  
  // If next slot is 10PM or later, move to next weekday at 7PM
  if (nextHour >= 22) {
    slot.setDate(slot.getDate() + 1);
    slot = skipWeekends(slot);
    slot.setHours(19, 0, 0, 0);
    return slot;
  }
  
  slot.setHours(nextHour, nextMinute, 0, 0);
  return slot;
};

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
        m.round_type,
        m.pool,
        m.winner_team_id,
        m.score_team1,
        m.score_team2,
        m.is_abandoned,
        m.abandoned_reason,
        t1.team_name as team1_name,
        t2.team_name as team2_name,
        m.created_at
      FROM matches m
      INNER JOIN teams t1 ON m.team1_id = t1.id
      INNER JOIN teams t2 ON m.team2_id = t2.id
      ORDER BY 
        CASE m.round_type
          WHEN 'Qualifying' THEN 1
          WHEN 'Quarter Final' THEN 2
          WHEN 'Semi Final' THEN 3
          WHEN 'Final' THEN 4
        END,
        m.scheduled_date ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// Get matches by round type
export const getMatchesByRound = async (req, res, next) => {
  try {
    const { roundType } = req.params;
    const [rows] = await pool.execute(`
      SELECT 
        m.*,
        t1.team_name as team1_name,
        t2.team_name as team2_name
      FROM matches m
      INNER JOIN teams t1 ON m.team1_id = t1.id
      INNER JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.round_type = ?
      ORDER BY m.scheduled_date ASC
    `, [roundType]);
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
    const { team1_id, team2_id, scheduled_date, venue, round_type, pool } = req.body;
    
    if (team1_id === team2_id) {
      return res.status(400).json({ success: false, message: 'Teams must be different' });
    }
    
    // Format date for MySQL if it's in ISO format
    let formattedDate = scheduled_date;
    if (scheduled_date && scheduled_date.includes('T')) {
      formattedDate = formatDateForMySQL(new Date(scheduled_date));
    }
    
    const [result] = await pool.execute(
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool) VALUES (?, ?, ?, ?, ?, ?)',
      [team1_id, team2_id, formattedDate, venue, round_type || 'Qualifying', pool || null]
    );
    
    res.status(201).json({
      success: true,
      message: 'Match created successfully',
      data: { id: result.insertId, team1_id, team2_id, scheduled_date: formattedDate, venue, round_type, pool }
    });
  } catch (error) {
    next(error);
  }
};

// Create multiple matches at once
export const createMultipleMatches = async (req, res, next) => {
  try {
    const { matches } = req.body; // Array of match objects
    
    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ success: false, message: 'Matches array is required' });
    }
    
    // Verify pool is available
    if (!pool || typeof pool.execute !== 'function') {
      console.error('Pool error:', { pool, hasExecute: typeof pool?.execute });
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection error. Pool not initialized correctly.' 
      });
    }
    
    const createdMatches = [];
    
    for (const match of matches) {
      const { team1_id, team2_id, scheduled_date, venue, round_type, pool: poolName } = match;
      
      if (team1_id === team2_id) {
        continue; // Skip invalid matches
      }
      
      // Format date for MySQL if it's in ISO format
      let formattedDate = scheduled_date;
      if (scheduled_date && scheduled_date.includes('T')) {
        formattedDate = formatDateForMySQL(new Date(scheduled_date));
      }
      
      const [result] = await pool.execute(
        'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool) VALUES (?, ?, ?, ?, ?, ?)',
        [team1_id, team2_id, formattedDate, venue, round_type || 'Qualifying', poolName || null]
      );
      
      createdMatches.push({
        id: result.insertId,
        ...match
      });
    }
    
    res.status(201).json({
      success: true,
      message: `${createdMatches.length} matches created successfully`,
      data: createdMatches
    });
  } catch (error) {
    console.error('Error in createMultipleMatches:', error);
    next(error);
  }
};

// Update match result
export const updateMatchResult = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { 
      score_team1, 
      score_team2, 
      winner_team_id, 
      status, 
      is_abandoned, 
      abandoned_reason,
      scheduled_date,
      venue
    } = req.body;
    
    // Build update query dynamically
    const updateFields = [];
    const values = [];
    
    if (score_team1 !== undefined) {
      updateFields.push('score_team1 = ?');
      values.push(score_team1);
    }
    if (score_team2 !== undefined) {
      updateFields.push('score_team2 = ?');
      values.push(score_team2);
    }
    if (winner_team_id !== undefined) {
      updateFields.push('winner_team_id = ?');
      values.push(winner_team_id);
      // Points are automatically calculated in standings query (2 points per win)
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      values.push(status);
    }
    if (is_abandoned !== undefined) {
      updateFields.push('is_abandoned = ?');
      values.push(is_abandoned);
    }
    if (abandoned_reason !== undefined) {
      updateFields.push('abandoned_reason = ?');
      values.push(abandoned_reason || null);
    }
    if (scheduled_date !== undefined) {
      // Format date for MySQL if it's in ISO format
      let formattedDate = scheduled_date;
      if (scheduled_date && scheduled_date.includes('T')) {
        formattedDate = formatDateForMySQL(new Date(scheduled_date));
      }
      updateFields.push('scheduled_date = ?');
      values.push(formattedDate);
    }
    if (venue !== undefined) {
      updateFields.push('venue = ?');
      values.push(venue);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    
    values.push(id);
    
    const [result] = await pool.execute(
      `UPDATE matches SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }
    
    // Points are automatically calculated when querying standings
    // Winner gets 2 points for normal win, 1 point for abandoned match win
    res.json({ 
      success: true, 
      message: 'Match updated successfully. Points will be automatically calculated (2 points per win, 1 point for abandoned match).' 
    });
  } catch (error) {
    next(error);
  }
};

// Get team standings (points calculation)
export const getTeamStandings = async (req, res, next) => {
  try {
    const { pool: poolName, roundType } = req.query; // Rename to poolName to avoid shadowing the imported pool
    
    let query = `
      SELECT 
        t.id,
        t.team_name,
        COALESCE(
          SUM(
            CASE 
              WHEN m.winner_team_id = t.id AND (m.is_abandoned = FALSE OR m.is_abandoned IS NULL) THEN 2
              WHEN m.winner_team_id = t.id AND m.is_abandoned = TRUE THEN 1
              ELSE 0 
            END
          ), 
          0
        ) as points,
        COUNT(CASE WHEN (m.team1_id = t.id OR m.team2_id = t.id) AND m.status = 'Completed' THEN 1 END) as matches_played,
        COUNT(CASE WHEN m.winner_team_id = t.id AND (m.is_abandoned = FALSE OR m.is_abandoned IS NULL) THEN 1 END) as matches_won,
        COUNT(CASE WHEN m.winner_team_id != t.id AND m.winner_team_id IS NOT NULL AND (m.is_abandoned = FALSE OR m.is_abandoned IS NULL) THEN 1 END) as matches_lost,
        COUNT(CASE WHEN m.is_abandoned = TRUE AND (m.team1_id = t.id OR m.team2_id = t.id) AND m.winner_team_id = t.id THEN 1 END) as abandoned_wins
      FROM teams t
      INNER JOIN matches m ON (m.team1_id = t.id OR m.team2_id = t.id)
    `;
    
    const conditions = [];
    const params = [];
    
    if (poolName) {
      conditions.push('m.pool = ?');
      params.push(poolName);
    }
    
    if (roundType) {
      conditions.push('m.round_type = ?');
      params.push(roundType);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += `
      GROUP BY t.id, t.team_name
      ORDER BY points DESC, matches_won DESC
    `;
    
    const [rows] = await pool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error in getTeamStandings:', error);
    next(error);
  }
};

// Generate Quarter Finals from qualifying round results
export const generateQuarterFinals = async (req, res, next) => {
  try {
    const { startDate, venue } = req.body;
    
    // Get top 4 teams from each pool based on standings
    const [poolAStandings] = await pool.execute(`
      SELECT 
        t.id,
        t.team_name,
        COALESCE(
          SUM(
            CASE 
              WHEN m.winner_team_id = t.id AND (m.is_abandoned = FALSE OR m.is_abandoned IS NULL) THEN 2
              WHEN m.winner_team_id = t.id AND m.is_abandoned = TRUE THEN 1
              ELSE 0 
            END
          ), 
          0
        ) as points,
        COUNT(CASE WHEN m.winner_team_id = t.id AND (m.is_abandoned = FALSE OR m.is_abandoned IS NULL) THEN 1 END) as matches_won
      FROM teams t
      INNER JOIN matches m ON (m.team1_id = t.id OR m.team2_id = t.id)
      WHERE m.pool = 'A' AND m.round_type = 'Qualifying'
      GROUP BY t.id, t.team_name
      ORDER BY points DESC, matches_won DESC
      LIMIT 4
    `);
    
    const [poolBStandings] = await pool.execute(`
      SELECT 
        t.id,
        t.team_name,
        COALESCE(
          SUM(
            CASE 
              WHEN m.winner_team_id = t.id AND (m.is_abandoned = FALSE OR m.is_abandoned IS NULL) THEN 2
              WHEN m.winner_team_id = t.id AND m.is_abandoned = TRUE THEN 1
              ELSE 0 
            END
          ), 
          0
        ) as points,
        COUNT(CASE WHEN m.winner_team_id = t.id AND (m.is_abandoned = FALSE OR m.is_abandoned IS NULL) THEN 1 END) as matches_won
      FROM teams t
      INNER JOIN matches m ON (m.team1_id = t.id OR m.team2_id = t.id)
      WHERE m.pool = 'B' AND m.round_type = 'Qualifying'
      GROUP BY t.id, t.team_name
      ORDER BY points DESC, matches_won DESC
      LIMIT 4
    `);
    
    if (poolAStandings.length < 4 || poolBStandings.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Need top 4 teams from each pool. Please complete all qualifying matches first.'
      });
    }
    
    // Check if Quarter Finals already exist
    const [existingQF] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Quarter Final'"
    );
    
    if (existingQF[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Quarter Finals already generated. Delete existing Quarter Final matches to regenerate.'
      });
    }
    
    // Generate Quarter Final matches
    // Format: Pool A #1 vs Pool B #4, Pool A #2 vs Pool B #3, Pool A #3 vs Pool B #2, Pool A #4 vs Pool B #1
    const quarterFinalMatches = [
      { team1: poolAStandings[0], team2: poolBStandings[3] }, // A1 vs B4
      { team1: poolAStandings[1], team2: poolBStandings[2] }, // A2 vs B3
      { team1: poolAStandings[2], team2: poolBStandings[1] }, // A3 vs B2
      { team1: poolAStandings[3], team2: poolBStandings[0] }  // A4 vs B1
    ];
    
    const matches = [];
    let currentDate = new Date(startDate || new Date());
    // Set to first available time slot (7PM on start date)
    currentDate = getNextTimeSlot(currentDate);
    
    for (const match of quarterFinalMatches) {
      matches.push({
        team1_id: match.team1.id,
        team2_id: match.team2.id,
        scheduled_date: formatDateForMySQL(currentDate),
        venue: venue || 'Main Court',
        round_type: 'Quarter Final',
        pool: null
      });
      // Get next available time slot (30-minute intervals, 7PM-10PM)
      currentDate = getNextTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
    }
    
    // Insert matches into database
    const createdMatches = [];
    for (const match of matches) {
      const [result] = await pool.execute(
        'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool) VALUES (?, ?, ?, ?, ?, ?)',
        [match.team1_id, match.team2_id, match.scheduled_date, match.venue, match.round_type, match.pool]
      );
      createdMatches.push({
        id: result.insertId,
        ...match
      });
    }
    
    res.json({
      success: true,
      message: 'Quarter Finals generated successfully',
      data: {
        matches: createdMatches,
        qualifiedTeams: {
          poolA: poolAStandings.map(t => ({ id: t.id, name: t.team_name, points: t.points })),
          poolB: poolBStandings.map(t => ({ id: t.id, name: t.team_name, points: t.points }))
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Generate Semi Finals from Quarter Finals results
export const generateSemiFinals = async (req, res, next) => {
  try {
    const { startDate, venue } = req.body;
    
    // Check if Quarter Finals exist and are all completed
    const [quarterFinals] = await pool.execute(
      "SELECT * FROM matches WHERE round_type = 'Quarter Final' ORDER BY scheduled_date"
    );
    
    if (quarterFinals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No Quarter Finals found. Please generate Quarter Finals first.'
      });
    }
    
    if (quarterFinals.length !== 4) {
      return res.status(400).json({
        success: false,
        message: `Expected 4 Quarter Final matches, found ${quarterFinals.length}.`
      });
    }
    
    const incompleteQF = quarterFinals.filter(m => m.status !== 'Completed' || !m.winner_team_id);
    if (incompleteQF.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Please complete all Quarter Final matches first. ${incompleteQF.length} match(es) remaining.`
      });
    }
    
    // Check if Semi Finals already exist
    const [existingSF] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Semi Final'"
    );
    
    if (existingSF[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Semi Finals already generated. Delete existing Semi Final matches to regenerate.'
      });
    }
    
    // Get winners from Quarter Finals
    const winners = quarterFinals.map(m => m.winner_team_id);
    
    if (winners.length !== 4) {
      return res.status(400).json({
        success: false,
        message: 'Could not determine all Quarter Final winners.'
      });
    }
    
    // Get team details for winners
    const [winnerTeams] = await pool.execute(
      `SELECT id, team_name FROM teams WHERE id IN (${winners.join(',')})`
    );
    
    const winnerMap = {};
    winnerTeams.forEach(team => {
      winnerMap[team.id] = team;
    });
    
    // Generate Semi Final matches
    // QF1 winner vs QF4 winner, QF2 winner vs QF3 winner
    const semiFinalMatches = [
      { team1: winnerMap[winners[0]], team2: winnerMap[winners[3]] }, // QF1 vs QF4
      { team1: winnerMap[winners[1]], team2: winnerMap[winners[2]] }  // QF2 vs QF3
    ];
    
    const matches = [];
    let currentDate = new Date(startDate || new Date());
    // Set to first available time slot (7PM on start date)
    currentDate = getNextTimeSlot(currentDate);
    
    for (const match of semiFinalMatches) {
      matches.push({
        team1_id: match.team1.id,
        team2_id: match.team2.id,
        scheduled_date: formatDateForMySQL(currentDate),
        venue: venue || 'Main Court',
        round_type: 'Semi Final',
        pool: null
      });
      // Get next available time slot (30-minute intervals, 7PM-10PM)
      currentDate = getNextTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
    }
    
    // Insert matches into database
    const createdMatches = [];
    for (const match of matches) {
      const [result] = await pool.execute(
        'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool) VALUES (?, ?, ?, ?, ?, ?)',
        [match.team1_id, match.team2_id, match.scheduled_date, match.venue, match.round_type, match.pool]
      );
      createdMatches.push({
        id: result.insertId,
        ...match
      });
    }
    
    res.json({
      success: true,
      message: 'Semi Finals generated successfully',
      data: {
        matches: createdMatches,
        qualifiedTeams: winners.map(id => {
          const team = winnerMap[id];
          return { id: team.id, name: team.team_name };
        })
      }
    });
  } catch (error) {
    next(error);
  }
};

// Generate Final from Semi Finals results
export const generateFinal = async (req, res, next) => {
  try {
    const { startDate, venue } = req.body;
    
    // Check if Semi Finals exist and are all completed
    const [semiFinals] = await pool.execute(
      "SELECT * FROM matches WHERE round_type = 'Semi Final' ORDER BY scheduled_date"
    );
    
    if (semiFinals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No Semi Finals found. Please generate Semi Finals first.'
      });
    }
    
    if (semiFinals.length !== 2) {
      return res.status(400).json({
        success: false,
        message: `Expected 2 Semi Final matches, found ${semiFinals.length}.`
      });
    }
    
    const incompleteSF = semiFinals.filter(m => m.status !== 'Completed' || !m.winner_team_id);
    if (incompleteSF.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Please complete all Semi Final matches first. ${incompleteSF.length} match(es) remaining.`
      });
    }
    
    // Check if Final already exists
    const [existingFinal] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Final'"
    );
    
    if (existingFinal[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Final already generated. Delete existing Final match to regenerate.'
      });
    }
    
    // Get winners from Semi Finals
    const winners = semiFinals.map(m => m.winner_team_id);
    
    if (winners.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Could not determine both Semi Final winners.'
      });
    }
    
    // Get team details for winners
    const [winnerTeams] = await pool.execute(
      `SELECT id, team_name FROM teams WHERE id IN (${winners.join(',')})`
    );
    
    const winnerMap = {};
    winnerTeams.forEach(team => {
      winnerMap[team.id] = team;
    });
    
    // Generate Final match
    // SF1 winner vs SF2 winner
    const finalMatch = {
      team1_id: winners[0],
      team2_id: winners[1],
      scheduled_date: formatDateForMySQL(getNextTimeSlot(new Date(startDate || new Date()))),
      venue: venue || 'Main Court',
      round_type: 'Final',
      pool: null
    };
    
    // Insert match into database
    const [result] = await pool.execute(
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool) VALUES (?, ?, ?, ?, ?, ?)',
      [finalMatch.team1_id, finalMatch.team2_id, finalMatch.scheduled_date, finalMatch.venue, finalMatch.round_type, finalMatch.pool]
    );
    
    const createdMatch = {
      id: result.insertId,
      ...finalMatch
    };
    
    res.json({
      success: true,
      message: 'Final generated successfully',
      data: {
        match: createdMatch,
        qualifiedTeams: winners.map(id => {
          const team = winnerMap[id];
          return { id: team.id, name: team.team_name };
        })
      }
    });
  } catch (error) {
    next(error);
  }
};

// Generate match schedule
export const generateMatchSchedule = async (req, res, next) => {
  try {
    const { startDate, endDate, venue, daysBetweenRounds } = req.body;
    
    // Validate date range
    if (!startDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date is required'
      });
    }
    
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    
    if (end && end < start) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }
    
    // Get all teams
    const [teams] = await pool.execute('SELECT id, team_name FROM teams ORDER BY id');
    
    if (teams.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Need at least 8 teams to generate schedule'
      });
    }
    
    // Divide teams into 2 pools
    let poolA = teams.slice(0, Math.ceil(teams.length / 2));
    let poolB = teams.slice(Math.ceil(teams.length / 2));
    
    const poolDifference = Math.abs(poolA.length - poolB.length);
    
    // If difference is more than 1, redistribute to make pools equal and even
    if (poolDifference > 1) {
      // Make both pools equal size (even number)
      const halfSize = Math.floor(teams.length / 2);
      poolA = teams.slice(0, halfSize);
      poolB = teams.slice(halfSize);
    }
    
    const matches = [];
    let currentDate = new Date(start);
    // Set to first available time slot (7PM on start date)
    currentDate = getNextTimeSlot(currentDate);
    
    // Helper to check if date is within range
    const isDateInRange = (date) => {
      if (!end) return true; // No end date, continue indefinitely
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      return dateOnly <= endOnly;
    };
    
    // Generate qualifying round matches (round-robin within each pool)
    const generateRoundRobin = (poolTeams, poolName) => {
      const poolMatches = [];
      for (let i = 0; i < poolTeams.length; i++) {
        for (let j = i + 1; j < poolTeams.length; j++) {
          // Check if we're still within the date range
          if (!isDateInRange(currentDate)) {
            // If we've exceeded the end date, stop generating matches
            break;
          }
          
          poolMatches.push({
            team1_id: poolTeams[i].id,
            team2_id: poolTeams[j].id,
            scheduled_date: formatDateForMySQL(currentDate),
            venue: venue || 'Main Court',
            round_type: 'Qualifying',
            pool: poolName
          });
          
          // Get next available time slot (30-minute intervals, 7PM-10PM)
          const nextSlot = getNextTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
          
          // If next slot is on a new day and we have an end date, check if it's still in range
          if (end && nextSlot.getDate() !== currentDate.getDate()) {
            if (!isDateInRange(nextSlot)) {
              // We've run out of dates in the range
              break;
            }
          }
          
          currentDate = nextSlot;
        }
        // Break outer loop if we've exceeded the date range
        if (end && !isDateInRange(currentDate)) {
          break;
        }
      }
      return poolMatches;
    };
    
    // Generate qualifying matches for both pools
    const poolAMatches = generateRoundRobin(poolA, 'A');
    const poolBMatches = generateRoundRobin(poolB, 'B');
    
    matches.push(...poolAMatches);
    matches.push(...poolBMatches);
    
    // Calculate match counts
    const poolAMatchCount = poolAMatches.length;
    const poolBMatchCount = poolBMatches.length;
    const matchDifference = Math.abs(poolAMatchCount - poolBMatchCount);
    
    // If difference is exactly 1 team, add additional match(es) to the smaller pool
    // to make the number of matches equal between both pools
    let additionalMatchInfo = null;
    if (poolDifference === 1) {
      const smallerPool = poolA.length < poolB.length ? 'A' : 'B';
      const smallerPoolTeams = poolA.length < poolB.length ? poolA : poolB;
      const largerPoolMatchCount = poolA.length > poolB.length ? poolAMatchCount : poolBMatchCount;
      const smallerPoolMatchCount = poolA.length < poolB.length ? poolAMatchCount : poolBMatchCount;
      
      // Calculate how many additional matches needed to balance
      const additionalMatchesNeeded = largerPoolMatchCount - smallerPoolMatchCount;
      
      if (additionalMatchesNeeded > 0 && smallerPoolTeams.length >= 2) {
        // Add additional match(es) to the smaller pool to balance match counts
        // These will be rematches or additional matches between teams in the smaller pool
        // We'll cycle through all possible team pairs to add matches
        let matchesAdded = 0;
        let pairIndex = 0;
        
        // Generate all possible pairs for the smaller pool
        const allPairs = [];
        for (let i = 0; i < smallerPoolTeams.length; i++) {
          for (let j = i + 1; j < smallerPoolTeams.length; j++) {
            allPairs.push([smallerPoolTeams[i], smallerPoolTeams[j]]);
          }
        }
        
        // Add additional matches by cycling through pairs
        // This allows rematches if needed to balance the match count
        while (matchesAdded < additionalMatchesNeeded && allPairs.length > 0) {
          const pair = allPairs[pairIndex % allPairs.length];
          const team1 = pair[0];
          const team2 = pair[1];
          
          // Check if we're still within the date range
          if (end && !isDateInRange(currentDate)) {
            break;
          }
          
          // Check if this exact match already exists (we allow rematches for balancing)
          // But we'll add it as a new match anyway to balance the count
          matches.push({
            team1_id: team1.id,
            team2_id: team2.id,
            scheduled_date: formatDateForMySQL(currentDate),
            venue: venue || 'Main Court',
            round_type: 'Qualifying',
            pool: smallerPool
          });
          
          // Get next available time slot (30-minute intervals, 7PM-10PM)
          const nextSlot = getNextTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
          if (end && nextSlot.getDate() !== currentDate.getDate() && !isDateInRange(nextSlot)) {
            break;
          }
          
          currentDate = nextSlot;
          matchesAdded++;
          pairIndex++;
        }
        
        additionalMatchInfo = {
          pool: smallerPool,
          matchesAdded: matchesAdded,
          message: `Added ${matchesAdded} additional match(es) to Pool ${smallerPool} to balance the number of matches with the larger pool (${largerPoolMatchCount} matches each).`
        };
      }
    }
    
    // Note: Quarter Finals, Semi Finals, and Final will be scheduled after qualifying results
    // This is just the qualifying round schedule
    
    // Calculate date range info
    const dateRangeInfo = {
      startDate: startDate,
      endDate: endDate || null,
      totalDays: end ? Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1 : null,
      matchesScheduled: matches.length
    };
    
    res.json({
      success: true,
      message: `Match schedule generated successfully${end ? ` for ${dateRangeInfo.totalDays} day(s)` : ''}. ${matches.length} matches scheduled.`,
      data: {
        matches,
        poolA: poolA.map(t => ({ id: t.id, name: t.team_name })),
        poolB: poolB.map(t => ({ id: t.id, name: t.team_name })),
        poolDifference,
        additionalMatch: additionalMatchInfo,
        dateRange: dateRangeInfo
      }
    });
  } catch (error) {
    next(error);
  }
};
