import pool from '../utils/database.js';
import { buildDefaultTeamName, normalizeTeamName } from '@shared/tournament/teamNaming.js';
import {
  canFormTeams,
  isSinglesFormat,
  VALID_LEAGUES,
} from '@shared/tournament/competitionFormat.js';
import {
  getCompetitionFormat,
  TEAM_SELECT,
} from '../services/leagueSettingsService.js';
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

const getPlayersForLeague = async (league) => {
  if (league === 'Expert') {
    const [rows] = await pool.execute(
      'SELECT id, name, email, expertise_level, category FROM players WHERE is_active = TRUE AND expertise_level = "Expert" AND (category = "Men" OR category IS NULL)'
    );
    return rows;
  }
  if (league === 'Intermediate') {
    const [rows] = await pool.execute(
      'SELECT id, name, email, expertise_level, category FROM players WHERE is_active = TRUE AND expertise_level = "Intermediate" AND (category = "Men" OR category IS NULL)'
    );
    return rows;
  }
  if (league === 'Women') {
    const [rows] = await pool.execute(
      'SELECT id, name, email, expertise_level, category FROM players WHERE is_active = TRUE AND category = "Women"'
    );
    return rows;
  }
  return [];
};

const resolveLeagueFromPlayer = (player) => {
  const category = player.category || 'Men';
  if (category === 'Women') return 'Women';
  if (player.expertise_level === 'Expert') return 'Expert';
  if (player.expertise_level === 'Intermediate') return 'Intermediate';
  return null;
};

const validatePlayersForLeague = (player1, player2, league, competitionFormat) => {
  const player1League = resolveLeagueFromPlayer(player1);
  if (player1League !== league) {
    return `Player ${player1.name} does not belong to ${league} league.`;
  }

  if (isSinglesFormat(competitionFormat)) {
    return null;
  }

  if (!player2) {
    return 'Doubles teams require two players.';
  }

  const player2League = resolveLeagueFromPlayer(player2);
  if (player2League !== league) {
    return `Player ${player2.name} does not belong to ${league} league.`;
  }

  if (player1.id === player2.id) {
    return 'A doubles team must have two different players.';
  }

  return null;
};

// Get all teams with player information
export const getAllTeams = async (req, res, next) => {
  try {
    const { league } = req.query;
    const params = [];
    let leagueFilter = '';

    if (league) {
      if (!VALID_LEAGUES.includes(league)) {
        return res.status(400).json({ success: false, message: 'Invalid league' });
      }
      leagueFilter = 'WHERE t.league = ?';
      params.push(league);
    }

    const [rows] = await pool.execute(
      `${TEAM_SELECT} ${leagueFilter} ORDER BY t.created_at DESC`,
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
    const { team_name, player1_id, player2_id, league: requestedLeague } = req.body;

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
    const league = requestedLeague || resolveLeagueFromPlayer(player1);

    if (!league || !VALID_LEAGUES.includes(league)) {
      return res.status(400).json({
        success: false,
        message: 'Could not determine league for this player.',
      });
    }

    const competitionFormat = await getCompetitionFormat(pool, league);
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
        message: 'Singles leagues use one player per team.',
      });
    }

    const validationError = validatePlayersForLeague(player1, player2, league, competitionFormat);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const normalizedName = normalizeTeamName(
      String(team_name || '').trim() || (singles ? player1.name : ''),
      league
    );
    if (!normalizedName) {
      return res.status(400).json({ success: false, message: 'Team name is required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO teams (team_name, player1_id, player2_id, league) VALUES (?, ?, ?, ?)',
      [normalizedName, player1_id, singles ? null : player2_id, league]
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
        league,
        competition_format: competitionFormat,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'This player or team combination already exists in this league',
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
      'SELECT id, league, player1_id, player2_id FROM teams WHERE id = ?',
      [id]
    );

    if (existingTeam.length === 0) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const league = existingTeam[0].league;
    const competitionFormat = await getCompetitionFormat(pool, league);
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

      const validationError = validatePlayersForLeague(
        player1Rows[0],
        player2,
        league,
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
      const trimmedName = normalizeTeamName(String(team_name).trim(), league);
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
        message: 'This player or team combination already exists in this league',
      });
    }
    next(error);
  }
};

// Delete all teams for a league (cascades to that league's matches via FK)
export const deleteTeamsByLeague = async (req, res, next) => {
  try {
    const { league } = req.params;

    if (!VALID_LEAGUES.includes(league)) {
      return res.status(400).json({ success: false, message: 'Invalid league' });
    }

    const [result] = await pool.execute('DELETE FROM teams WHERE league = ?', [league]);

    res.json({
      success: true,
      message: `Deleted ${result.affectedRows} team(s) from ${league} league`,
      data: { league, deleted: result.affectedRows },
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

// Generate random teams for one league (or all eligible leagues if league omitted)
export const generateRandomTeams = async (req, res, next) => {
  try {
    const { league: requestedLeague } = req.body;

    if (requestedLeague && !VALID_LEAGUES.includes(requestedLeague)) {
      return res.status(400).json({ success: false, message: 'Invalid league' });
    }

    const leaguesToCreate = requestedLeague ? [requestedLeague] : VALID_LEAGUES;

    const allTeams = [];
    const skippedLeagues = [];
    const pairingRules = await getMergedPairingRules();

    for (const leagueName of leaguesToCreate) {
      const competitionFormat = await getCompetitionFormat(pool, leagueName);
      const singles = isSinglesFormat(competitionFormat);
      const leaguePlayers = await getPlayersForLeague(leagueName);

      if (!canFormTeams(leaguePlayers.length, competitionFormat)) {
        if (requestedLeague) {
          return res.status(400).json({
            success: false,
            message: `Cannot create ${leagueName} ${singles ? 'entrants' : 'teams'}. Need an even number of players (≥ 2). Found ${leaguePlayers.length}.`,
          });
        }
        skippedLeagues.push({ league: leagueName, playerCount: leaguePlayers.length });
        continue;
      }

      await pool.execute('DELETE FROM teams WHERE league = ?', [leagueName]);

      const shuffledPlayers = shufflePlayers(leaguePlayers);

      if (singles) {
        for (let i = 0; i < shuffledPlayers.length; i += 1) {
          const player = shuffledPlayers[i];
          const teamName = buildDefaultTeamName(i + 1);

          await pool.execute(
            'INSERT INTO teams (team_name, player1_id, player2_id, league) VALUES (?, ?, NULL, ?)',
            [teamName, player.id, leagueName]
          );

          allTeams.push({
            teamName,
            league: leagueName,
            player1: player,
            player2: null,
          });
        }
      } else {
        const teamPairs = buildDoublesTeamsWithPairingRules(
          leaguePlayers,
          pairingRules,
          leagueName
        );

        for (let i = 0; i < teamPairs.length; i += 1) {
          const [player1, player2] = teamPairs[i];
          const teamName = buildDefaultTeamName(i + 1);

          await pool.execute(
            'INSERT INTO teams (team_name, player1_id, player2_id, league) VALUES (?, ?, ?, ?)',
            [teamName, player1.id, player2.id, leagueName]
          );

          allTeams.push({
            teamName,
            league: leagueName,
            player1,
            player2,
          });
        }
      }
    }

    if (allTeams.length === 0) {
      const detail = requestedLeague
        ? `Need an even number of players for ${requestedLeague} league.`
        : 'No league had enough players with an even count.';
      return res.status(400).json({
        success: false,
        message: `Cannot create teams. ${detail}`,
        data: { skippedLeagues },
      });
    }

    const scope = requestedLeague ? `${requestedLeague} league` : 'eligible leagues';
    res.status(201).json({
      success: true,
      message: `${allTeams.length} entrant(s) generated for ${scope}`,
      data: { teams: allTeams, skippedLeagues },
    });
  } catch (error) {
    next(error);
  }
};
