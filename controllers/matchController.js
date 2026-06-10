import pool from '../utils/database.js';
import {
  distributeIntoGroups,
  generateGroupStageMatches,
  countQualifyingMatches,
  calculateGroupStandings,
  getQualifiedTeams,
  generateCrossoverQuarterFinalPairings,
  generateLegacyQuarterFinalPairings,
  generateFinalPairingFromQuarterFinals,
  generateThirdPlaceFromQuarterFinals,
  resolveTournamentConfig,
  buildConfigFromCounts,
  scheduleFixtures,
  validateDateRangeForMatches,
} from '../../shared/tournament/index.js';
import { tryAutoProgressKnockout } from '../services/matchProgressionService.js';
import { getGroupsFromMatches, detectFormat } from '../services/tournamentService.js';

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
    const { league } = req.query;
    let whereClause = '';
    const params = [];
    if (league) {
      whereClause = 'WHERE m.league = ?';
      params.push(league);
    }
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
        m.league,
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
      ${whereClause}
      ORDER BY 
        CASE m.round_type
          WHEN 'Qualifying' THEN 1
          WHEN 'Quarter Final' THEN 2
          WHEN 'Semi Final' THEN 3
          WHEN 'Third Place' THEN 4
          WHEN 'Final' THEN 5
        END,
        m.scheduled_date ASC
    `, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    // Handle table not found errors gracefully
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') {
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
};

// Get matches by round type
export const getMatchesByRound = async (req, res, next) => {
  try {
    const { roundType } = req.params;
    const { league } = req.query;
    const params = [roundType];
    let whereLeague = '';
    if (league) {
      whereLeague = ' AND m.league = ?';
      params.push(league);
    }
    const [rows] = await pool.execute(`
      SELECT 
        m.*,
        t1.team_name as team1_name,
        t2.team_name as team2_name
      FROM matches m
      INNER JOIN teams t1 ON m.team1_id = t1.id
      INNER JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.round_type = ?${whereLeague}
      ORDER BY m.scheduled_date ASC
    `, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    // Handle table not found errors gracefully
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') {
      return res.json({ success: true, data: [] });
    }
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
    // Handle table not found errors gracefully
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }
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
    
    // Validate teams exist and belong to the same league
    const [team1Rows] = await pool.execute('SELECT id, league FROM teams WHERE id = ?', [team1_id]);
    const [team2Rows] = await pool.execute('SELECT id, league FROM teams WHERE id = ?', [team2_id]);
    if (team1Rows.length === 0 || team2Rows.length === 0) {
      return res.status(400).json({ success: false, message: 'One or both teams not found' });
    }
    const team1League = team1Rows[0].league;
    const team2League = team2Rows[0].league;
    if (team1League !== team2League) {
      return res.status(400).json({ success: false, message: 'Both teams must belong to the same league' });
    }

    // Format date for MySQL if it's in ISO format
    let formattedDate = scheduled_date;
    if (scheduled_date && scheduled_date.includes('T')) {
      formattedDate = formatDateForMySQL(new Date(scheduled_date));
    }
    
    // Normalize team IDs: always store smaller ID as team1_id to ensure unique constraint works
    const normalizedTeam1Id = team1_id < team2_id ? team1_id : team2_id;
    const normalizedTeam2Id = team1_id < team2_id ? team2_id : team1_id;
    
    // Check for duplicate match between same teams (same round_type and pool)
    // Since we normalize, we only need to check one order
    const [existingMatches] = await pool.execute(
      `SELECT id FROM matches 
       WHERE team1_id = ? AND team2_id = ?
       AND round_type = ? 
       AND league = ?
       AND (pool = ? OR (pool IS NULL AND ? IS NULL))
       AND status != 'Cancelled'`,
      [normalizedTeam1Id, normalizedTeam2Id, round_type || 'Qualifying', team1League, pool, pool]
    );
    
    if (existingMatches.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'A match between these teams already exists for this round and pool' 
      });
    }
    
    // Check for time slot conflict (same scheduled_date and venue)
    const [conflictingMatches] = await pool.execute(
      `SELECT id, team1_id, team2_id FROM matches 
       WHERE scheduled_date = ? 
       AND venue = ? 
       AND status != 'Cancelled'`,
      [formattedDate, venue || 'Main Court']
    );
    
    if (conflictingMatches.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Time slot conflict: Another match is already scheduled at ${formattedDate} at ${venue || 'Main Court'}` 
      });
    }
    
    const [result] = await pool.execute(
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, league) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [normalizedTeam1Id, normalizedTeam2Id, formattedDate, venue, round_type || 'Qualifying', pool || null, team1League]
    );
    
    res.status(201).json({
      success: true,
      message: 'Match created successfully',
      data: { id: result.insertId, team1_id, team2_id, scheduled_date: formattedDate, venue, round_type, pool, league: team1League }
    });
  } catch (error) {
    // Handle duplicate entry error from database
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        success: false, 
        message: 'A match with these exact details already exists' 
      });
    }
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
      
      // Validate teams and league
      const [team1Rows] = await pool.execute('SELECT id, league FROM teams WHERE id = ?', [team1_id]);
      const [team2Rows] = await pool.execute('SELECT id, league FROM teams WHERE id = ?', [team2_id]);
      if (team1Rows.length === 0 || team2Rows.length === 0) {
        continue;
      }
      const teamLeague = team1Rows[0].league;
      if (teamLeague !== team2Rows[0].league) {
        continue;
      }

      // Format date for MySQL if it's in ISO format
      let formattedDate = scheduled_date;
      if (scheduled_date && scheduled_date.includes('T')) {
        formattedDate = formatDateForMySQL(new Date(scheduled_date));
      }
      
      // Normalize team IDs: always store smaller ID as team1_id
      const normalizedTeam1Id = team1_id < team2_id ? team1_id : team2_id;
      const normalizedTeam2Id = team1_id < team2_id ? team2_id : team1_id;
      
      const [result] = await pool.execute(
        'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, league) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [normalizedTeam1Id, normalizedTeam2Id, formattedDate, venue, round_type || 'Qualifying', poolName || null, teamLeague]
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
    
    const [matchRows] = await pool.execute('SELECT league FROM matches WHERE id = ?', [id]);
    const league = matchRows[0]?.league;

    let progression = null;
    if (league && (status === 'Completed' || winner_team_id)) {
      try {
        progression = await tryAutoProgressKnockout(pool, league);
      } catch (progressError) {
        console.error('Auto-progression skipped:', progressError.message);
      }
    }

    res.json({
      success: true,
      message: 'Match updated successfully. Standings and knockout bracket update automatically.',
      data: { progression },
    });
  } catch (error) {
    next(error);
  }
};

// Get team standings with full tie-breaker ranking
export const getTeamStandings = async (req, res, next) => {
  try {
    const { pool: poolName, roundType, league } = req.query;

    if (!poolName || !league) {
      return res.status(400).json({ success: false, message: 'pool and league query parameters are required' });
    }

    const groups = await getGroupsFromMatches(pool, league);
    const teams = groups[poolName] || [];

    if (teams.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const [matchRows] = await pool.execute(
      `SELECT m.* FROM matches m
       WHERE m.league = ? AND m.pool = ? AND m.round_type = ?`,
      [league, poolName, roundType || 'Qualifying']
    );

    const standings = calculateGroupStandings(teams, matchRows);
    res.json({ success: true, data: standings });
  } catch (error) {
    console.error('Error in getTeamStandings:', error);
    next(error);
  }
};

// Generate Quarter Finals from group stage results
export const generateQuarterFinals = async (req, res, next) => {
  try {
    const { startDate, venue, league } = req.body;
    if (!league) {
      return res.status(400).json({ success: false, message: 'League is required to generate Quarter Finals' });
    }

    const [existingQF] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Quarter Final' AND league = ?",
      [league]
    );
    if (existingQF[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Quarter Finals already generated.',
      });
    }

    const [allMatches] = await pool.execute(
      "SELECT * FROM matches WHERE league = ? AND round_type = 'Qualifying'",
      [league]
    );
    const groups = await getGroupsFromMatches(pool, league);
    const format = detectFormat(allMatches, groups);
    const groupOrder = Object.keys(groups).sort();
    const qualifiersPerGroup = format === 'pools-2' ? 4 : 2;
    const qualified = getQualifiedTeams(groups, allMatches, qualifiersPerGroup);

    const pairings =
      format === 'pools-2'
        ? generateLegacyQuarterFinalPairings(qualified.A || [], qualified.B || [])
        : generateCrossoverQuarterFinalPairings(qualified, groupOrder);

    let currentDate = getNextTimeSlot(new Date(startDate || new Date()));
    const createdMatches = [];

    for (const pairing of pairings) {
      const normalizedTeam1Id = pairing.team1.id < pairing.team2.id ? pairing.team1.id : pairing.team2.id;
      const normalizedTeam2Id = pairing.team1.id < pairing.team2.id ? pairing.team2.id : pairing.team1.id;
      const scheduled = formatDateForMySQL(currentDate);

      const [result] = await pool.execute(
        'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, league) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [normalizedTeam1Id, normalizedTeam2Id, scheduled, venue || 'Main Court', 'Quarter Final', null, league]
      );

      createdMatches.push({
        id: result.insertId,
        team1_id: normalizedTeam1Id,
        team2_id: normalizedTeam2Id,
        scheduled_date: scheduled,
        venue: venue || 'Main Court',
        round_type: 'Quarter Final',
        label: pairing.label,
        league,
      });

      currentDate = getNextTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
    }

    res.json({
      success: true,
      message: 'Quarter Finals generated successfully',
      data: { matches: createdMatches, qualifiedTeams: qualified, format },
    });
  } catch (error) {
    next(error);
  }
};

// Generate Semi Finals from Quarter Finals results
export const generateSemiFinals = async (req, res, next) => {
  try {
    const { startDate, venue, league } = req.body;
    if (!league) {
      return res.status(400).json({ success: false, message: 'League is required to generate Semi Finals' });
    }
    
    // Check if Quarter Finals exist and are all completed
    const [quarterFinals] = await pool.execute(
      "SELECT * FROM matches WHERE round_type = 'Quarter Final' AND league = ? ORDER BY scheduled_date",
      [league]
    );
    
    if (quarterFinals.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No Quarter Finals found. Please generate Quarter Finals first.'
      });
    }

    if (quarterFinals.length === 2) {
      return res.status(400).json({
        success: false,
        message:
          'This league has 4 knockout teams (2 groups). Complete both Quarter Final matches and generate the Final directly — Semi Finals are not used.',
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
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Semi Final' AND league = ?",
      [league]
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
      // Normalize team IDs: always store smaller ID as team1_id
      const normalizedTeam1Id = match.team1.id < match.team2.id ? match.team1.id : match.team2.id;
      const normalizedTeam2Id = match.team1.id < match.team2.id ? match.team2.id : match.team1.id;
      
      matches.push({
        team1_id: normalizedTeam1Id,
        team2_id: normalizedTeam2Id,
        scheduled_date: formatDateForMySQL(currentDate),
        venue: venue || 'Main Court',
        round_type: 'Semi Final',
        pool: null,
        league
      });
      // Get next available time slot (30-minute intervals, 7PM-10PM)
      currentDate = getNextTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
    }
    
    // Insert matches into database
    const createdMatches = [];
    for (const match of matches) {
      const [result] = await pool.execute(
        'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, league) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [match.team1_id, match.team2_id, match.scheduled_date, match.venue, match.round_type, match.pool, match.league]
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
    const { startDate, venue, league } = req.body;
    if (!league) {
      return res.status(400).json({ success: false, message: 'League is required to generate Final' });
    }
    
    const [semiFinals] = await pool.execute(
      "SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name FROM matches m INNER JOIN teams t1 ON m.team1_id = t1.id INNER JOIN teams t2 ON m.team2_id = t2.id WHERE m.round_type = 'Semi Final' AND m.league = ? ORDER BY m.scheduled_date",
      [league]
    );

    const [quarterFinals] = await pool.execute(
      "SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name FROM matches m INNER JOIN teams t1 ON m.team1_id = t1.id INNER JOIN teams t2 ON m.team2_id = t2.id WHERE m.round_type = 'Quarter Final' AND m.league = ? ORDER BY m.scheduled_date",
      [league]
    );

    const [existingFinal] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Final' AND league = ?",
      [league]
    );

    if (existingFinal[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Final already generated. Delete existing Final match to regenerate.'
      });
    }

    let normalizedTeam1Id;
    let normalizedTeam2Id;
    let qualifiedTeams;

    if (semiFinals.length === 2) {
      const incompleteSF = semiFinals.filter((m) => m.status !== 'Completed' || !m.winner_team_id);
      if (incompleteSF.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Please complete all Semi Final matches first. ${incompleteSF.length} match(es) remaining.`,
        });
      }

      const winners = semiFinals.map((m) => m.winner_team_id);
      normalizedTeam1Id = Math.min(winners[0], winners[1]);
      normalizedTeam2Id = Math.max(winners[0], winners[1]);
      qualifiedTeams = winners;
    } else if (quarterFinals.length === 2) {
      const incompleteQF = quarterFinals.filter((m) => m.status !== 'Completed' || !m.winner_team_id);
      if (incompleteQF.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Please complete both Quarter Final matches first. ${incompleteQF.length} match(es) remaining.`,
        });
      }

      const pairing = generateFinalPairingFromQuarterFinals(quarterFinals);
      normalizedTeam1Id = Math.min(pairing.team1.id, pairing.team2.id);
      normalizedTeam2Id = Math.max(pairing.team1.id, pairing.team2.id);
      qualifiedTeams = [pairing.team1.id, pairing.team2.id];
    } else {
      return res.status(400).json({
        success: false,
        message: 'Complete Semi Finals first, or complete both Quarter Finals when this league uses 2 groups.',
      });
    }

    const [winnerTeams] = await pool.execute(
      `SELECT id, team_name FROM teams WHERE id IN (${qualifiedTeams.join(',')})`
    );

    const winnerMap = {};
    winnerTeams.forEach((team) => {
      winnerMap[team.id] = team;
    });
    
    const finalMatch = {
      team1_id: normalizedTeam1Id,
      team2_id: normalizedTeam2Id,
      scheduled_date: formatDateForMySQL(getNextTimeSlot(new Date(startDate || new Date()))),
      venue: venue || 'Main Court',
      round_type: 'Final',
      pool: null,
      league
    };
    
    // Insert match into database
    const [result] = await pool.execute(
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, league) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [finalMatch.team1_id, finalMatch.team2_id, finalMatch.scheduled_date, finalMatch.venue, finalMatch.round_type, finalMatch.pool, finalMatch.league]
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

// Generate group-stage match schedule (4 groups of 3 by default, or legacy 2-pool)
export const generateMatchSchedule = async (req, res, next) => {
  try {
    const {
      startDate,
      endDate,
      venue,
      league,
      format = 'groups',
      groupCount,
      replaceExisting = false,
    } = req.body;

    if (!league) {
      return res.status(400).json({ success: false, message: 'League is required to generate schedule' });
    }
    if (!startDate) {
      return res.status(400).json({ success: false, message: 'Start date is required' });
    }

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    if (end && end < start) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    const [teams] = await pool.execute(
      'SELECT id, team_name FROM teams WHERE league = ? ORDER BY id',
      [league]
    );

    const teamCount = teams.length;

    const [existingQualifying] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE league = ? AND round_type = 'Qualifying'",
      [league]
    );
    const existingQualifyingCount = existingQualifying[0].count;

    if (existingQualifyingCount > 0 && !replaceExisting) {
      return res.status(400).json({
        success: false,
        message: `${existingQualifyingCount} qualifying match(es) already exist for ${league} league. Regenerate with replaceExisting to replace them.`,
        data: { existingQualifyingCount, teamCount },
      });
    }

    if (existingQualifyingCount > 0 && replaceExisting) {
      await pool.execute(
        "DELETE FROM matches WHERE league = ? AND round_type = 'Qualifying'",
        [league]
      );
    }

    let config;
    try {
      if (format === 'pools-2') {
        if (teamCount < 8 || teamCount % 2 !== 0) {
          return res.status(400).json({
            success: false,
            message: 'Legacy 2-pool format requires an even number of teams (minimum 8).',
          });
        }
        config = buildConfigFromCounts(teamCount, 2, { format: 'pools-2' });
      } else {
        if (teamCount < 4 || teamCount % 2 !== 0) {
          return res.status(400).json({
            success: false,
            message: `Tournament requires an even number of teams (minimum 4). ${league} league has ${teamCount}.`,
          });
        }
        config = groupCount
          ? buildConfigFromCounts(teamCount, groupCount)
          : resolveTournamentConfig(teamCount);
      }
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }

    const participants = teams;
    const groups = distributeIntoGroups(participants, config.groupCount);
    const fixtures = generateGroupStageMatches(groups).map((f) => ({ ...f, league }));
    const expectedMatchCount = countQualifyingMatches(teamCount, config.groupCount);
    const rangeCheck = validateDateRangeForMatches(startDate, endDate, expectedMatchCount);
    if (!rangeCheck.ok) {
      return res.status(400).json({
        success: false,
        message: rangeCheck.message,
        data: {
          slotsRequired: rangeCheck.slotsRequired,
          availableSlots: rangeCheck.availableSlots,
          suggestedEndDate: rangeCheck.suggestedEndDate,
          weekdaysNeeded: rangeCheck.weekdaysNeeded,
        },
      });
    }

    const { matches, availableSlots } = scheduleFixtures(
      fixtures,
      startDate,
      venue || 'Main Court',
      endDate
    );

    const groupSummary = Object.fromEntries(
      Object.entries(groups).map(([id, groupTeams]) => [
        id,
        groupTeams.map((t) => ({ id: t.id, name: t.team_name })),
      ])
    );

    res.json({
      success: true,
      message: `Group stage schedule generated. ${matches.length} qualifying matches across ${config.groupCount} groups (${config.groupSize} teams each).`,
      data: {
        matches,
        groups: groupSummary,
        config,
        format: config.format,
        expectedMatchCount,
        availableSlots,
        dateRange: {
          startDate,
          endDate: endDate || null,
          totalDays: end ? Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1 : null,
          matchesScheduled: matches.length,
          firstMatch: matches[0]?.scheduled_date ?? null,
          lastMatch: matches[matches.length - 1]?.scheduled_date ?? null,
        },
        league,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Generate Third Place match from Semi Final losers
export const generateThirdPlace = async (req, res, next) => {
  try {
    const { startDate, venue, league } = req.body;
    if (!league) {
      return res.status(400).json({ success: false, message: 'League is required' });
    }

    const [existing] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Third Place' AND league = ?",
      [league]
    );
    if (existing[0].count > 0) {
      return res.status(400).json({ success: false, message: 'Third Place match already generated.' });
    }

    const [semiFinals] = await pool.execute(
      `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name
       FROM matches m
       INNER JOIN teams t1 ON m.team1_id = t1.id
       INNER JOIN teams t2 ON m.team2_id = t2.id
       WHERE m.round_type = 'Semi Final' AND m.league = ?
       ORDER BY m.scheduled_date`,
      [league]
    );

    const [quarterFinals] = await pool.execute(
      `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name
       FROM matches m
       INNER JOIN teams t1 ON m.team1_id = t1.id
       INNER JOIN teams t2 ON m.team2_id = t2.id
       WHERE m.round_type = 'Quarter Final' AND m.league = ?
       ORDER BY m.scheduled_date`,
      [league]
    );

    let pairing;
    if (semiFinals.length === 2) {
      const incomplete = semiFinals.filter((m) => m.status !== 'Completed' || !m.winner_team_id);
      if (incomplete.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Complete all Semi Final matches before generating Third Place match.',
        });
      }
      const { generateThirdPlacePairing } = await import('../../shared/tournament/knockout.js');
      pairing = generateThirdPlacePairing(semiFinals);
    } else if (quarterFinals.length === 2) {
      const incomplete = quarterFinals.filter((m) => m.status !== 'Completed' || !m.winner_team_id);
      if (incomplete.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Complete both Quarter Final matches before generating Third Place match.',
        });
      }
      pairing = generateThirdPlaceFromQuarterFinals(quarterFinals);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Complete Semi Finals or both Quarter Finals before generating Third Place match.',
      });
    }
    const team1Id = pairing.team1.id < pairing.team2.id ? pairing.team1.id : pairing.team2.id;
    const team2Id = pairing.team1.id < pairing.team2.id ? pairing.team2.id : pairing.team1.id;
    const scheduled = formatDateForMySQL(getNextTimeSlot(new Date(startDate || new Date())));

    const [result] = await pool.execute(
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, league) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [team1Id, team2Id, scheduled, venue || 'Main Court', 'Third Place', null, league]
    );

    res.json({
      success: true,
      message: 'Third Place match generated successfully',
      data: {
        match: {
          id: result.insertId,
          team1_id: team1Id,
          team2_id: team2Id,
          scheduled_date: scheduled,
          round_type: 'Third Place',
          league,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};



