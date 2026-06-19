import pool from '../utils/database.js';
import { buildDefaultTeamName, normalizeTeamName } from '@shared/tournament/teamNaming.js';
import {
  canFormTeams,
  isSinglesFormat,
  VALID_DIVISIONS,
  parseTournamentDivision,
  resolveTournamentDivisionFromPlayer,
  resolveDivisionParam,
} from '@shared/tournament/competitionFormat.js';
import { rejectInvalidDivision } from '../utils/divisionParam.js';
import {
  getCompetitionFormat,
  TEAM_SELECT,
} from '../services/divisionSettingsService.js';
import { getMergedPairingRules } from '../services/pairingRuleService.js';
import { buildDoublesTeamsWithPairingRules } from '@shared/tournament/teamPairing.js';

const shufflePlayers = (players) => {
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const getPlayersForDivision = async (division) => {
  const { category } = parseTournamentDivision(division);
  const [rows] = await pool.execute(
    'SELECT id, name, email, expertise_level, category FROM players WHERE is_active = TRUE AND category = ?',
    [category]
  );
  return rows;
};

const resolveDivisionFromPlayer = (player) => resolveTournamentDivisionFromPlayer(player);

const validatePlayersForDivision = (player1, player2, division, competitionFormat) => {
  const player1Division = resolveDivisionFromPlayer(player1);
  if (player1Division !== division) {
    return `Player ${player1.name} does not belong to ${division} division.`;
  }

  if (isSinglesFormat(competitionFormat)) {
    return null;
  }

  if (!player2) {
    return 'Doubles teams require two players.';
  }

  const player2Division = resolveDivisionFromPlayer(player2);
  if (player2Division !== division) {
    return `Player ${player2.name} does not belong to ${division} division.`;
  }

  if (player1.id === player2.id) {
    return 'A doubles team must have two different players.';
  }

  return null;
};

// Get all teams with player information
export const getAllTeams = async (req, res, next) => {
  try {
    const { division } = req.query;
    const params = [];
    let divisionFilter = '';

    if (division) {
      const resolved = rejectInvalidDivision(res, division);
      if (resolved === undefined) return;
      divisionFilter = 'WHERE t.division = ?';
      params.push(resolved);
    }

    const [rows] = await pool.execute(
      `${TEAM_SELECT} ${divisionFilter} ORDER BY t.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (error) {
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
    const [rows] = await pool.execute(`${TEAM_SELECT} WHERE t.id = ?`, [id]);

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
    const { team_name, player1_id, player2_id, division: requestedDivision } = req.body;

    const [player1Rows] = await pool.execute(
      'SELECT id, name, expertise_level, category FROM players WHERE id = ? AND is_active = TRUE',
      [player1_id]
    );

    if (player1Rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Player not found or inactive',
      });
    }

    const player1 = player1Rows[0];
    const division =
      resolveDivisionParam(requestedDivision) || resolveDivisionFromPlayer(player1);

    if (!division || !VALID_DIVISIONS.includes(division)) {
      return res.status(400).json({
        success: false,
        message: 'Could not determine division for this player.',
      });
    }

    const competitionFormat = await getCompetitionFormat(pool, division);
    const singles = isSinglesFormat(competitionFormat);

    let player2 = null;
    if (!singles) {
      if (player2_id == null) {
        return res.status(400).json({
          success: false,
          message: 'Doubles teams require two players.',
        });
      }

      const [player2Rows] = await pool.execute(
        'SELECT id, name, expertise_level, category FROM players WHERE id = ? AND is_active = TRUE',
        [player2_id]
      );

      if (player2Rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Second player not found or inactive',
        });
      }

      player2 = player2Rows[0];
    } else if (player2_id != null) {
      return res.status(400).json({
        success: false,
        message: 'Singles divisions use one player per team.',
      });
    }

    const validationError = validatePlayersForDivision(player1, player2, division, competitionFormat);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const normalizedName = normalizeTeamName(
      String(team_name || '').trim() || (singles ? player1.name : ''),
      division
    );
    if (!normalizedName) {
      return res.status(400).json({ success: false, message: 'Team name is required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO teams (team_name, player1_id, player2_id, division) VALUES (?, ?, ?, ?)',
      [normalizedName, player1_id, singles ? null : player2_id, division]
    );

    res.status(201).json({
      success: true,
      message: singles ? 'Entrant created successfully' : 'Team created successfully',
      data: {
        id: result.insertId,
        team_name: normalizedName,
        player1_id,
        player2_id: singles ? null : player2_id,
        player1_name: player1.name,
        player1_expertise: player1.expertise_level,
        player1_category: player1.category || 'Men',
        player2_name: player2?.name ?? null,
        player2_expertise: player2?.expertise_level ?? null,
        player2_category: player2?.category ?? null,
        division,
        competition_format: competitionFormat,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'This player or team combination already exists in this division',
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

    const [existingTeam] = await pool.execute(
      'SELECT id, division, player1_id, player2_id FROM teams WHERE id = ?',
      [id]
    );

    if (existingTeam.length === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const division = existingTeam[0].division;
    const competitionFormat = await getCompetitionFormat(pool, division);
    const singles = isSinglesFormat(competitionFormat);

    const updateFields = [];
    const values = [];

    if (player1_id !== undefined || player2_id !== undefined) {
      const finalPlayer1Id = player1_id !== undefined ? player1_id : existingTeam[0].player1_id;
      const finalPlayer2Id = singles
        ? null
        : player2_id !== undefined
          ? player2_id
          : existingTeam[0].player2_id;

      const [player1Rows] = await pool.execute(
        'SELECT id, name, expertise_level, category FROM players WHERE id = ? AND is_active = TRUE',
        [finalPlayer1Id]
      );

      if (player1Rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Player not found or inactive',
        });
      }

      let player2 = null;
      if (!singles) {
        const [player2Rows] = await pool.execute(
          'SELECT id, name, expertise_level, category FROM players WHERE id = ? AND is_active = TRUE',
          [finalPlayer2Id]
        );

        if (player2Rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Second player not found or inactive',
          });
        }

        player2 = player2Rows[0];
      }

      const validationError = validatePlayersForDivision(
        player1Rows[0],
        player2,
        division,
        competitionFormat
      );
      if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
      }

      if (player1_id !== undefined) {
        updateFields.push('player1_id = ?');
        values.push(finalPlayer1Id);
      }
      if (!singles && player2_id !== undefined) {
        updateFields.push('player2_id = ?');
        values.push(finalPlayer2Id);
      }
    }

    if (team_name !== undefined) {
      const trimmedName = normalizeTeamName(String(team_name).trim(), division);
      if (!trimmedName) {
        return res.status(400).json({ success: false, message: 'Team name is required' });
      }
      updateFields.push('team_name = ?');
      values.push(trimmedName);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    values.push(id);

    await pool.execute(`UPDATE teams SET ${updateFields.join(', ')} WHERE id = ?`, values);

    res.json({ success: true, message: 'Team updated successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'This player or team combination already exists in this division',
      });
    }
    next(error);
  }
};

// Delete all teams for a division (cascades to that division's matches via FK)
export const deleteTeamsByDivision = async (req, res, next) => {
  try {
    const { division } = req.params;
    const resolved = rejectInvalidDivision(res, division);
    if (resolved === undefined) return;

    const [result] = await pool.execute('DELETE FROM teams WHERE division = ?', [resolved]);

    res.json({
      success: true,
      message: `Deleted ${result.affectedRows} team(s) from ${division} division`,
      data: { division, deleted: result.affectedRows },
    });
  } catch (error) {
    next(error);
  }
};

// Delete a team
export const deleteTeam = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM teams WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    res.json({ success: true, message: 'Team deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Generate random teams for one division (or all eligible divisions if division omitted)
export const generateRandomTeams = async (req, res, next) => {
  try {
    const { division: requestedDivision } = req.body;
    const resolvedRequest = requestedDivision ? resolveDivisionParam(requestedDivision) : null;
    if (requestedDivision && !resolvedRequest) {
      return res.status(400).json({ success: false, message: 'Invalid division' });
    }

    const divisionsToCreate = resolvedRequest ? [resolvedRequest] : VALID_DIVISIONS;

    const allTeams = [];
    const skippedDivisions = [];
    const pairingRules = await getMergedPairingRules();

    for (const divisionName of divisionsToCreate) {
      const competitionFormat = await getCompetitionFormat(pool, divisionName);
      const singles = isSinglesFormat(competitionFormat);
      const divisionPlayers = await getPlayersForDivision(divisionName);

      if (!canFormTeams(divisionPlayers.length, competitionFormat)) {
        if (requestedDivision) {
          return res.status(400).json({
            success: false,
            message: `Cannot create ${divisionName} ${singles ? 'entrants' : 'teams'}. Need an even number of players (≥ 2). Found ${divisionPlayers.length}.`,
          });
        }
        skippedDivisions.push({ division: divisionName, playerCount: divisionPlayers.length });
        continue;
      }

      await pool.execute('DELETE FROM teams WHERE division = ?', [divisionName]);

      const shuffledPlayers = shufflePlayers(divisionPlayers);

      if (singles) {
        for (let i = 0; i < shuffledPlayers.length; i += 1) {
          const player = shuffledPlayers[i];
          const teamName = buildDefaultTeamName(i + 1);

          await pool.execute(
            'INSERT INTO teams (team_name, player1_id, player2_id, division) VALUES (?, ?, NULL, ?)',
            [teamName, player.id, divisionName]
          );

          allTeams.push({
            teamName,
            division: divisionName,
            player1: player,
            player2: null,
          });
        }
      } else {
        const teamPairs = buildDoublesTeamsWithPairingRules(
          divisionPlayers,
          pairingRules,
          divisionName
        );

        for (let i = 0; i < teamPairs.length; i += 1) {
          const [player1, player2] = teamPairs[i];
          const teamName = buildDefaultTeamName(i + 1);

          await pool.execute(
            'INSERT INTO teams (team_name, player1_id, player2_id, division) VALUES (?, ?, ?, ?)',
            [teamName, player1.id, player2.id, divisionName]
          );

          allTeams.push({
            teamName,
            division: divisionName,
            player1,
            player2,
          });
        }
      }
    }

    if (allTeams.length === 0) {
      const detail = requestedDivision
        ? `Need an even number of players for ${requestedDivision} division.`
        : 'No division had enough players with an even count.';
      return res.status(400).json({
        success: false,
        message: `Cannot create teams. ${detail}`,
        data: { skippedDivisions },
      });
    }

    const scope = requestedDivision ? `${requestedDivision} division` : 'eligible divisions';
    res.status(201).json({
      success: true,
      message: `${allTeams.length} entrant(s) generated for ${scope}`,
      data: { teams: allTeams, skippedDivisions },
    });
  } catch (error) {
    next(error);
  }
};
