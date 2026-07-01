import pool from '../utils/database.js';
import { isDuplicateKeyError, isMissingTableError } from '../utils/dbErrors.js';
import {
  distributeIntoGroups,
  generateGroupStageMatches,
  countQualifyingMatches,
  calculateGroupStandings,
  getQualifiedTeams,
  generateFirstKnockoutPairings,
  generateFinalPairingFromQuarterFinals,
  resolveThirdPlacePairing,
  resolveQualifiersPerGroup,
  getFullGroupStandings,
  generateSingleGroupThirdPlacePairing,
  resolveTournamentConfig,
  buildConfigFromCounts,
  scheduleFixtures,
  scheduleRoundRobinGroups,
  validateDateRangeForMatches,
  inferSingleGroupTeamCount,
} from '@shared/tournament/index.js';
import {
  formatDateForMySQL,
  resolveTimeSlotConfig,
  resolveCourtConfig,
  createMatchSlotCursor,
} from '@shared/tournament/scheduling.js';
import { tryAutoProgressKnockout, ensureThirdPlaceMatch } from '../services/matchProgressionService.js';
import { tryAutoProgressTierPyramid } from '../services/tierPyramidProgressionService.js';
import { rejectInvalidDivision, requireDivision } from '../utils/divisionParam.js';
import { getDivisionSettings } from '../services/divisionSettingsService.js';
import { generateTierPyramidLevel1Schedule } from '../services/tierPyramidService.js';
import { isTierPyramidFormat } from '@shared/tournament/formats/registry.js';
import { ensureMatchSchema } from '../services/matchSchemaService.js';
import { autoFillMatchResults as runAutoFillMatchResults } from '../services/autoFillMatchResultsService.js';
import { countPlayersForDivision } from '../services/tournamentService.js';
import { buildMatchRoundSortCase } from '@shared/tournament/roundTypes.js';
import { validateMatchResultUpdate } from '@shared/tournament/validateMatchResult.js';

const parseTimeSlotConfigFromBody = (body = {}) => {
  const { timeSlotConfig } = body;
  if (!timeSlotConfig) {
    return resolveTimeSlotConfig();
  }
  return resolveTimeSlotConfig(timeSlotConfig);
};

const parseCourtConfigFromBody = (body = {}) => {
  const { courtConfig, courtCount } = body;
  return resolveCourtConfig({
    courtCount: courtConfig?.courtCount ?? courtCount,
    venueBase: courtConfig?.venueBase ?? body.venue,
  });
};

// Get all matches
export const getAllMatches = async (req, res, next) => {
  try {
    await ensureMatchSchema(pool);

    const { division } = req.query;
    const resolvedDivision = division ? rejectInvalidDivision(res, division) : null;
    if (division && resolvedDivision === undefined) return;

    if (resolvedDivision) {
      try {
        await ensureThirdPlaceMatch(pool, resolvedDivision);
      } catch (healError) {
        console.error('Third place auto-heal skipped:', healError.message);
      }
    }

    let whereClause = '';
    const params = [];
    if (resolvedDivision) {
      whereClause = 'WHERE m.division = ?';
      params.push(resolvedDivision);
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
        m.division,
        m.winner_team_id,
        m.score_team1,
        m.score_team2,
        m.set_game_scores,
        m.game_point_format,
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
        ${buildMatchRoundSortCase('m.round_type')},
        m.stage_sequence ASC,
        m.scheduled_date ASC
    `, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    // Handle table not found errors gracefully
    if (isMissingTableError(error)) {
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
};

// Get matches by round type
export const getMatchesByRound = async (req, res, next) => {
  try {
    const { roundType } = req.params;
    const { division } = req.query;
    const params = [roundType];
    let whereDivision = '';
    if (division) {
      whereDivision = ' AND m.division = ?';
      params.push(division);
    }
    const [rows] = await pool.execute(`
      SELECT 
        m.*,
        t1.team_name as team1_name,
        t2.team_name as team2_name
      FROM matches m
      INNER JOIN teams t1 ON m.team1_id = t1.id
      INNER JOIN teams t2 ON m.team2_id = t2.id
      WHERE m.round_type = ?${whereDivision}
      ORDER BY m.scheduled_date ASC
    `, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    // Handle table not found errors gracefully
    if (isMissingTableError(error)) {
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
    if (isMissingTableError(error)) {
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
    
    // Validate teams exist and belong to the same division
    const [team1Rows] = await pool.execute('SELECT id, division FROM teams WHERE id = ?', [team1_id]);
    const [team2Rows] = await pool.execute('SELECT id, division FROM teams WHERE id = ?', [team2_id]);
    if (team1Rows.length === 0 || team2Rows.length === 0) {
      return res.status(400).json({ success: false, message: 'One or both teams not found' });
    }
    const team1Division = team1Rows[0].division;
    const team2Division = team2Rows[0].division;
    if (team1Division !== team2Division) {
      return res.status(400).json({ success: false, message: 'Both teams must belong to the same division' });
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
       AND division = ?
       AND (pool = ? OR (pool IS NULL AND ? IS NULL))
       AND status != 'Cancelled'`,
      [normalizedTeam1Id, normalizedTeam2Id, round_type || 'Qualifying', team1Division, pool, pool]
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
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, division) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [normalizedTeam1Id, normalizedTeam2Id, formattedDate, venue, round_type || 'Qualifying', pool || null, team1Division]
    );
    
    res.status(201).json({
      success: true,
      message: 'Match created successfully',
      data: { id: result.insertId, team1_id, team2_id, scheduled_date: formattedDate, venue, round_type, pool, division: team1Division }
    });
  } catch (error) {
    // Handle duplicate entry error from database
    if (isDuplicateKeyError(error)) {
      return res.status(400).json({ 
        success: false, 
        message: 'A match with these exact details already exists' 
      });
    }
    next(error);
  }
};

// Create multiple matches at once (optional division scopes and validates inserts)
export const createMultipleMatches = async (req, res, next) => {
  try {
    const { matches, division: requestedDivision } = req.body;
    
    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ success: false, message: 'Matches array is required' });
    }
    
    if (!pool || typeof pool.execute !== 'function') {
      console.error('Pool error:', { pool, hasExecute: typeof pool?.execute });
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection error. Pool not initialized correctly.' 
      });
    }
    
    const createdMatches = [];
    
    for (const match of matches) {
      const {
        team1_id,
        team2_id,
        scheduled_date,
        venue,
        round_type,
        pool: poolName,
        division: matchDivision,
      } = match;
      
      if (team1_id === team2_id) {
        continue;
      }
      
      const [team1Rows] = await pool.execute('SELECT id, division FROM teams WHERE id = ?', [team1_id]);
      const [team2Rows] = await pool.execute('SELECT id, division FROM teams WHERE id = ?', [team2_id]);
      if (team1Rows.length === 0 || team2Rows.length === 0) {
        continue;
      }
      const teamDivision = team1Rows[0].division;
      if (teamDivision !== team2Rows[0].division) {
        continue;
      }

      const resolvedDivision = matchDivision || requestedDivision || teamDivision;
      if (resolvedDivision !== teamDivision) {
        return res.status(400).json({
          success: false,
          message: `Team division (${teamDivision}) does not match requested division (${resolvedDivision}).`,
        });
      }
      if (requestedDivision && resolvedDivision !== requestedDivision) {
        return res.status(400).json({
          success: false,
          message: `Cannot create ${resolvedDivision} match while scoped to ${requestedDivision} division.`,
        });
      }

      let formattedDate = scheduled_date;
      if (scheduled_date && scheduled_date.includes('T')) {
        formattedDate = formatDateForMySQL(new Date(scheduled_date));
      }
      
      const normalizedTeam1Id = team1_id < team2_id ? team1_id : team2_id;
      const normalizedTeam2Id = team1_id < team2_id ? team2_id : team1_id;
      
      const [result] = await pool.execute(
        'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, division) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [normalizedTeam1Id, normalizedTeam2Id, formattedDate, venue, round_type || 'Qualifying', poolName || null, resolvedDivision]
      );
      
      createdMatches.push({
        id: result.insertId,
        ...match,
        division: resolvedDivision,
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
    await ensureMatchSchema(pool);

    const { id } = req.params;
    const { 
      score_team1, 
      score_team2,
      set_game_scores,
      game_point_format,
      winner_team_id, 
      status, 
      is_abandoned, 
      abandoned_reason,
      scheduled_date,
      venue
    } = req.body;

    const [existingRows] = await pool.execute(
      `SELECT id, team1_id, team2_id, round_type, score_team1, score_team2,
              set_game_scores, game_point_format, is_abandoned, abandoned_reason
       FROM matches WHERE id = ?`,
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const existingMatch = existingRows[0];
    const validation = validateMatchResultUpdate(existingMatch, req.body);
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
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
    if (set_game_scores !== undefined) {
      updateFields.push('set_game_scores = ?');
      values.push(
        set_game_scores && Array.isArray(set_game_scores) && set_game_scores.length > 0
          ? JSON.stringify(set_game_scores)
          : null
      );
    }
    if (game_point_format !== undefined) {
      updateFields.push('game_point_format = ?');
      values.push(Number(game_point_format) === 21 ? 21 : 11);
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
    
    const [matchRows] = await pool.execute('SELECT division FROM matches WHERE id = ?', [id]);
    const division = matchRows[0]?.division;

    let progression = null;
    if (division && (status === 'Completed' || winner_team_id)) {
      try {
        const settings = await getDivisionSettings(pool, division);
        if (isTierPyramidFormat(settings.tournament_format)) {
          progression = await tryAutoProgressTierPyramid(pool, division, Number(id));
        } else {
          progression = await tryAutoProgressKnockout(pool, division);
        }
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
    const { pool: poolName, roundType, division } = req.query;

    if (!poolName || !division) {
      return res.status(400).json({ success: false, message: 'pool and division query parameters are required' });
    }

    const groups = await getGroupsFromMatches(pool, division);
    const teams = groups[poolName] || [];

    if (teams.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const [matchRows] = await pool.execute(
      `SELECT m.* FROM matches m
       WHERE m.division = ? AND m.pool = ? AND m.round_type = ?`,
      [division, poolName, roundType || 'Qualifying']
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
    const { startDate, venue, division } = req.body;
    if (!division) {
      return res.status(400).json({ success: false, message: 'Division is required to generate Quarter Finals' });
    }

    let timeSlotConfig;
    try {
      timeSlotConfig = parseTimeSlotConfigFromBody(req.body);
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }

    let courtConfig;
    try {
      courtConfig = parseCourtConfigFromBody(req.body);
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }

    const [existingQF] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Quarter Final' AND division = ?",
      [division]
    );
    if (existingQF[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Quarter Finals already generated.',
      });
    }

    const [allMatches] = await pool.execute(
      "SELECT * FROM matches WHERE division = ? AND round_type = 'Qualifying'",
      [division]
    );
    const groups = await getGroupsFromMatches(pool, division);
    const format = detectFormat(allMatches, groups);
    const groupOrder = Object.keys(groups).sort();
    const teamCount = inferSingleGroupTeamCount(allMatches, format) ?? groupOrder.reduce(
      (sum, id) => sum + (groups[id]?.length || 0),
      0
    );
    const qualifiersPerGroup = resolveQualifiersPerGroup(teamCount, groupOrder.length, format);
    const qualified = getQualifiedTeams(groups, allMatches, qualifiersPerGroup);

    const { roundType, pairings } = generateFirstKnockoutPairings(
      qualified,
      groupOrder,
      format,
      teamCount
    );

    const slotCursor = createMatchSlotCursor(startDate || new Date(), timeSlotConfig, courtConfig);
    const createdMatches = [];

    for (const pairing of pairings) {
      const normalizedTeam1Id = pairing.team1.id < pairing.team2.id ? pairing.team1.id : pairing.team2.id;
      const normalizedTeam2Id = pairing.team1.id < pairing.team2.id ? pairing.team2.id : pairing.team1.id;
      const { scheduled_date: scheduled, venue: matchVenue } = slotCursor.getNext();

      const [result] = await pool.execute(
        'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, division) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [normalizedTeam1Id, normalizedTeam2Id, scheduled, matchVenue, roundType, null, division]
      );

      createdMatches.push({
        id: result.insertId,
        team1_id: normalizedTeam1Id,
        team2_id: normalizedTeam2Id,
        scheduled_date: scheduled,
        venue: matchVenue,
        round_type: roundType,
        label: pairing.label,
        division,
      });
    }

    if (roundType === 'Final' && format === 'single-group' && teamCount === 4) {
      const [existingThird] = await pool.execute(
        "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Third Place' AND division = ?",
        [division]
      );
      if (existingThird[0].count === 0) {
        const fullStandings = getFullGroupStandings(groups, allMatches, groupOrder[0]);
        const thirdPairing = generateSingleGroupThirdPlacePairing(fullStandings);
        const normalizedTeam1Id =
          thirdPairing.team1.id < thirdPairing.team2.id
            ? thirdPairing.team1.id
            : thirdPairing.team2.id;
        const normalizedTeam2Id =
          thirdPairing.team1.id < thirdPairing.team2.id
            ? thirdPairing.team2.id
            : thirdPairing.team1.id;
        const { scheduled_date: scheduled, venue: matchVenue } = slotCursor.getNext();

        const [thirdResult] = await pool.execute(
          'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, division) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            normalizedTeam1Id,
            normalizedTeam2Id,
            scheduled,
            matchVenue,
            'Third Place',
            null,
            division,
          ]
        );

        createdMatches.push({
          id: thirdResult.insertId,
          team1_id: normalizedTeam1Id,
          team2_id: normalizedTeam2Id,
          scheduled_date: scheduled,
          venue: matchVenue,
          round_type: 'Third Place',
          label: thirdPairing.label,
          division,
        });
      }
    } else if (roundType === 'Final') {
      try {
        await ensureThirdPlaceMatch(pool, division);
      } catch (progressError) {
        console.error('Third place auto-creation skipped:', progressError.message);
      }
    }

    const thirdPlaceCreated = createdMatches.some((m) => m.round_type === 'Third Place');
    const roundLabel =
      roundType === 'Final' ? 'Final' : roundType === 'Semi Final' ? 'Semi Finals' : 'Quarter Finals';

    res.json({
      success: true,
      message: thirdPlaceCreated
        ? `${roundLabel} and Third Place matches generated successfully`
        : `${roundLabel} generated successfully`,
      data: {
        matches: createdMatches,
        qualifiedTeams: qualified,
        format,
        roundType,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Generate Semi Finals from Quarter Finals results
export const generateSemiFinals = async (req, res, next) => {
  try {
    const { startDate, venue, division } = req.body;
    if (!division) {
      return res.status(400).json({ success: false, message: 'Division is required to generate Semi Finals' });
    }

    let timeSlotConfig;
    try {
      timeSlotConfig = parseTimeSlotConfigFromBody(req.body);
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }

    let courtConfig;
    try {
      courtConfig = parseCourtConfigFromBody(req.body);
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }
    
    // Check if Quarter Finals exist and are all completed
    const [quarterFinals] = await pool.execute(
      "SELECT * FROM matches WHERE round_type = 'Quarter Final' AND division = ? ORDER BY scheduled_date",
      [division]
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
          'This division has 4 knockout teams (2 groups). Complete both Quarter Final matches and generate the Final directly — Semi Finals are not used.',
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
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Semi Final' AND division = ?",
      [division]
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
    const slotCursor = createMatchSlotCursor(startDate || new Date(), timeSlotConfig, courtConfig);
    
    for (const match of semiFinalMatches) {
      // Normalize team IDs: always store smaller ID as team1_id
      const normalizedTeam1Id = match.team1.id < match.team2.id ? match.team1.id : match.team2.id;
      const normalizedTeam2Id = match.team1.id < match.team2.id ? match.team2.id : match.team1.id;
      const slot = slotCursor.getNext();
      
      matches.push({
        team1_id: normalizedTeam1Id,
        team2_id: normalizedTeam2Id,
        scheduled_date: slot.scheduled_date,
        venue: slot.venue,
        round_type: 'Semi Final',
        pool: null,
        division
      });
    }
    
    // Insert matches into database
    const createdMatches = [];
    for (const match of matches) {
      const [result] = await pool.execute(
        'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, division) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [match.team1_id, match.team2_id, match.scheduled_date, match.venue, match.round_type, match.pool, match.division]
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
    const { startDate, venue, division } = req.body;
    if (!division) {
      return res.status(400).json({ success: false, message: 'Division is required to generate Final' });
    }

    let timeSlotConfig;
    try {
      timeSlotConfig = parseTimeSlotConfigFromBody(req.body);
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }

    let courtConfig;
    try {
      courtConfig = parseCourtConfigFromBody(req.body);
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }
    
    const [semiFinals] = await pool.execute(
      "SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name FROM matches m INNER JOIN teams t1 ON m.team1_id = t1.id INNER JOIN teams t2 ON m.team2_id = t2.id WHERE m.round_type = 'Semi Final' AND m.division = ? ORDER BY m.scheduled_date",
      [division]
    );

    const [quarterFinals] = await pool.execute(
      "SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name FROM matches m INNER JOIN teams t1 ON m.team1_id = t1.id INNER JOIN teams t2 ON m.team2_id = t2.id WHERE m.round_type = 'Quarter Final' AND m.division = ? ORDER BY m.scheduled_date",
      [division]
    );

    const [existingFinal] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Final' AND division = ?",
      [division]
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
        message: 'Complete Semi Finals first, or complete both Quarter Finals when this division uses 2 groups.',
      });
    }

    const [winnerTeams] = await pool.execute(
      `SELECT id, team_name FROM teams WHERE id IN (${qualifiedTeams.join(',')})`
    );

    const winnerMap = {};
    winnerTeams.forEach((team) => {
      winnerMap[team.id] = team;
    });
    
    const finalSlot = createMatchSlotCursor(startDate || new Date(), timeSlotConfig, courtConfig).getNext();
    const finalMatch = {
      team1_id: normalizedTeam1Id,
      team2_id: normalizedTeam2Id,
      scheduled_date: finalSlot.scheduled_date,
      venue: finalSlot.venue,
      round_type: 'Final',
      pool: null,
      division
    };
    
    // Insert match into database
    const [result] = await pool.execute(
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, division) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [finalMatch.team1_id, finalMatch.team2_id, finalMatch.scheduled_date, finalMatch.venue, finalMatch.round_type, finalMatch.pool, finalMatch.division]
    );
    
    const createdMatch = {
      id: result.insertId,
      ...finalMatch
    };

    let progression = null;
    try {
      const thirdPlace = await ensureThirdPlaceMatch(pool, division);
      if (thirdPlace.created) {
        progression = { progressed: true, round: 'Third Place', matches: thirdPlace.matches };
      }
    } catch (progressError) {
      console.error('Third place auto-creation skipped:', progressError.message);
    }

    const thirdPlaceCreated = progression?.matches?.length > 0;

    res.json({
      success: true,
      message: thirdPlaceCreated
        ? 'Final and Third Place matches generated successfully'
        : 'Final generated successfully',
      data: {
        match: createdMatch,
        qualifiedTeams: winners.map(id => {
          const team = winnerMap[id];
          return { id: team.id, name: team.team_name };
        }),
        progression,
      }
    });
  } catch (error) {
    next(error);
  }
};

// Generate group-stage match schedule (4 groups of 3 by default, or legacy 2-pool)
export const generateMatchSchedule = async (req, res, next) => {
  try {
    let {
      startDate,
      endDate,
      venue,
      division,
      format,
      groupCount,
      replaceExisting = false,
    } = req.body;

    if (!division) {
      return res.status(400).json({ success: false, message: 'Division is required to generate schedule' });
    }
    const resolvedDivision = rejectInvalidDivision(res, division);
    if (resolvedDivision === undefined) return;
    division = resolvedDivision;
    if (!startDate) {
      return res.status(400).json({ success: false, message: 'Start date is required' });
    }

    let timeSlotConfig;
    try {
      timeSlotConfig = parseTimeSlotConfigFromBody(req.body);
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }

    let courtConfig;
    try {
      courtConfig = parseCourtConfigFromBody(req.body);
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }

    const divisionSettings = await getDivisionSettings(pool, division);
    const resolvedFormat = format ?? divisionSettings.tournament_format ?? 'groups';
    const formatConfig =
      req.body.formatConfig ?? req.body.format_config ?? divisionSettings.format_config;

    if (isTierPyramidFormat(resolvedFormat)) {
      try {
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : null;
        if (end && end < start) {
          return res.status(400).json({ success: false, message: 'End date must be after start date' });
        }

        const schedule = await generateTierPyramidLevel1Schedule(pool, {
          division,
          startDate,
          endDate,
          venue: venue || 'Main Court',
          timeSlotConfig,
          courtConfig,
          replaceExisting,
          formatConfig,
        });

        return res.json({
          success: true,
          message: `Tier Pyramid Level 1 schedule generated for ${division}. ${schedule.matches.length} matches (S1: ${schedule.matchCounts.s1}, S2: ${schedule.matchCounts.s2}).`,
          data: {
            ...schedule,
            dateRange: {
              startDate,
              endDate: endDate || null,
              totalDays: end ? Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1 : null,
              matchesScheduled: schedule.matches.length,
              firstMatch: schedule.matches[0]?.scheduled_date ?? null,
              lastMatch: schedule.matches[schedule.matches.length - 1]?.scheduled_date ?? null,
            },
            division,
          },
        });
      } catch (pyramidError) {
        if (pyramidError.statusCode) {
          return res.status(pyramidError.statusCode).json({
            success: false,
            message: pyramidError.message,
            data: pyramidError.data ?? undefined,
          });
        }
        throw pyramidError;
      }
    }

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    if (end && end < start) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    const [teams] = await pool.execute(
      'SELECT id, team_name FROM teams WHERE division = ? ORDER BY id',
      [division]
    );

    const teamCount = teams.length;
    const playerCount = await countPlayersForDivision(pool, division);

    const [existingQualifying] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE division = ? AND round_type = 'Qualifying'",
      [division]
    );
    const existingQualifyingCount = existingQualifying[0].count;

    if (existingQualifyingCount > 0 && !replaceExisting) {
      return res.status(400).json({
        success: false,
        message: `${existingQualifyingCount} qualifying match(es) already exist for ${division} division. Regenerate with replaceExisting to replace them.`,
        data: { existingQualifyingCount, teamCount },
      });
    }

    if (existingQualifyingCount > 0 && replaceExisting) {
      await pool.execute(
        "DELETE FROM matches WHERE division = ? AND round_type = 'Qualifying'",
        [division]
      );
    }

    let config;
    try {
      if ((resolvedFormat ?? 'groups') === 'pools-2') {
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
            message: `Tournament requires an even number of teams (minimum 4). ${division} division has ${teamCount}.`,
          });
        }
        config = groupCount
          ? buildConfigFromCounts(teamCount, groupCount, { playerCount })
          : resolveTournamentConfig(teamCount, groupCount, playerCount);
      }
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }

    const participants = teams;
    const groups = distributeIntoGroups(participants, config.groupCount);
    const fixtures = generateGroupStageMatches(groups).map((f) => ({ ...f, division }));
    const expectedMatchCount = countQualifyingMatches(teamCount, config.groupCount);
    const rangeCheck = validateDateRangeForMatches(
      startDate,
      endDate,
      expectedMatchCount,
      timeSlotConfig,
      courtConfig
    );
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

    const { matches, availableSlots } = scheduleRoundRobinGroups(
      fixtures,
      startDate,
      venue || 'Main Court',
      endDate,
      timeSlotConfig,
      courtConfig
    );

    const createdMatches = [];
    for (const match of matches) {
      const { team1_id, team2_id, scheduled_date, round_type, pool: poolName } = match;
      if (team1_id === team2_id) continue;

      const [team1Rows] = await pool.execute(
        'SELECT id, division FROM teams WHERE id = ? AND division = ?',
        [team1_id, division]
      );
      const [team2Rows] = await pool.execute(
        'SELECT id, division FROM teams WHERE id = ? AND division = ?',
        [team2_id, division]
      );
      if (team1Rows.length === 0 || team2Rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: `Schedule fixture references teams outside ${division} division. Regenerate teams for this division and try again.`,
        });
      }

      const normalizedTeam1Id = team1_id < team2_id ? team1_id : team2_id;
      const normalizedTeam2Id = team1_id < team2_id ? team2_id : team1_id;

      const [result] = await pool.execute(
        'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, division) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          normalizedTeam1Id,
          normalizedTeam2Id,
          scheduled_date,
          match.venue || venue || 'Main Court',
          round_type || 'Qualifying',
          poolName || null,
          division,
        ]
      );

      createdMatches.push({
        id: result.insertId,
        team1_id: normalizedTeam1Id,
        team2_id: normalizedTeam2Id,
        scheduled_date,
        venue: match.venue || venue || 'Main Court',
        round_type: round_type || 'Qualifying',
        pool: poolName || null,
        division,
      });
    }

    const groupSummary = Object.fromEntries(
      Object.entries(groups).map(([id, groupTeams]) => [
        id,
        groupTeams.map((t) => ({ id: t.id, name: t.team_name })),
      ])
    );

    res.json({
      success: true,
      message: `Group stage schedule generated for ${division} division. ${createdMatches.length} qualifying matches across ${config.groupCount} groups (${config.groupSize} teams each).`,
      data: {
        matches: createdMatches,
        groups: groupSummary,
        config,
        format: config.format,
        expectedMatchCount,
        availableSlots,
        dateRange: {
          startDate,
          endDate: endDate || null,
          totalDays: end ? Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1 : null,
          matchesScheduled: createdMatches.length,
          firstMatch: createdMatches[0]?.scheduled_date ?? null,
          lastMatch: createdMatches[createdMatches.length - 1]?.scheduled_date ?? null,
        },
        division,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Generate Third Place match from Semi Final losers
export const generateThirdPlace = async (req, res, next) => {
  try {
    const { startDate, venue, division } = req.body;
    if (!division) {
      return res.status(400).json({ success: false, message: 'Division is required' });
    }

    let timeSlotConfig;
    try {
      timeSlotConfig = parseTimeSlotConfigFromBody(req.body);
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }

    let courtConfig;
    try {
      courtConfig = parseCourtConfigFromBody(req.body);
    } catch (configError) {
      return res.status(400).json({ success: false, message: configError.message });
    }

    const [existing] = await pool.execute(
      "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Third Place' AND division = ?",
      [division]
    );
    if (existing[0].count > 0) {
      return res.status(400).json({ success: false, message: 'Third Place match already generated.' });
    }

    const [semiFinals] = await pool.execute(
      `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name
       FROM matches m
       INNER JOIN teams t1 ON m.team1_id = t1.id
       INNER JOIN teams t2 ON m.team2_id = t2.id
       WHERE m.round_type = 'Semi Final' AND m.division = ?
       ORDER BY m.scheduled_date`,
      [division]
    );

    const [quarterFinals] = await pool.execute(
      `SELECT m.*, t1.team_name as team1_name, t2.team_name as team2_name
       FROM matches m
       INNER JOIN teams t1 ON m.team1_id = t1.id
       INNER JOIN teams t2 ON m.team2_id = t2.id
       WHERE m.round_type = 'Quarter Final' AND m.division = ?
       ORDER BY m.scheduled_date`,
      [division]
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
      pairing = resolveThirdPlacePairing({ semiFinals });
    } else if (quarterFinals.length === 2) {
      const incomplete = quarterFinals.filter((m) => m.status !== 'Completed' || !m.winner_team_id);
      if (incomplete.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Complete both Quarter Final matches before generating Third Place match.',
        });
      }
      pairing = resolveThirdPlacePairing({ quarterFinals });
    } else {
      const [allMatches] = await pool.execute(
        "SELECT * FROM matches WHERE division = ? AND round_type = 'Qualifying'",
        [division]
      );
      const incompleteQualifying = allMatches.filter(
        (m) => m.status !== 'Completed' || !m.winner_team_id
      );
      if (incompleteQualifying.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Complete all qualifying matches before generating Third Place match.',
        });
      }

      const [existingFinal] = await pool.execute(
        "SELECT COUNT(*) as count FROM matches WHERE round_type = 'Final' AND division = ?",
        [division]
      );
      if (existingFinal[0].count === 0) {
        return res.status(400).json({
          success: false,
          message: 'Generate the Final before creating the Third Place match.',
        });
      }

      const groups = await getGroupsFromMatches(pool, division);
      const format = detectFormat(allMatches, groups);
      const groupOrder = Object.keys(groups).sort();
      const teamCount =
        inferSingleGroupTeamCount(allMatches, format) ??
        groupOrder.reduce((sum, id) => sum + (groups[id]?.length || 0), 0);
      const fullStandings = getFullGroupStandings(groups, allMatches, groupOrder[0]);

      try {
        pairing = resolveThirdPlacePairing({ standings: fullStandings });
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
    }
    const team1Id = pairing.team1.id < pairing.team2.id ? pairing.team1.id : pairing.team2.id;
    const team2Id = pairing.team1.id < pairing.team2.id ? pairing.team2.id : pairing.team1.id;
    const thirdPlaceSlot = createMatchSlotCursor(startDate || new Date(), timeSlotConfig, courtConfig).getNext();
    const scheduled = thirdPlaceSlot.scheduled_date;
    const matchVenue = thirdPlaceSlot.venue;

    const [result] = await pool.execute(
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, division) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [team1Id, team2Id, scheduled, matchVenue, 'Third Place', null, division]
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
          venue: matchVenue,
          round_type: 'Third Place',
          division,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin testing helper: auto-fill valid results for pending matches
export const autoFillMatchResults = async (req, res, next) => {
  try {
    await ensureMatchSchema(pool);

    const { roundType, fillAll, setConfig, gamePointsPerSet, division: bodyDivision } = req.body ?? {};
    let division;
    try {
      division = requireDivision(bodyDivision);
    } catch {
      return res.status(400).json({ success: false, message: 'Valid division is required.' });
    }

    const result = await runAutoFillMatchResults(pool, division, {
      roundType: fillAll ? null : roundType ?? null,
      fillAll: Boolean(fillAll),
      setConfig,
      gamePointsPerSet,
    });

    const message =
      result.filled > 0
        ? `Auto-filled ${result.filled} match result(s). Lower team ID wins each match for predictable testing.`
        : 'No pending matches to fill for the selected scope.';

    res.json({
      success: true,
      message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};


