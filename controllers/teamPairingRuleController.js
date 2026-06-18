import pool from '../utils/database.js';
import { DEFAULT_TEAM_PAIRING_RULES } from '@shared/tournament/defaultTeamPairingRules.js';
import {
  normalizePlayerIds,
  resolvePlayerLeague,
} from '@shared/tournament/teamPairing.js';
import { isSinglesFormat, VALID_LEAGUES } from '@shared/tournament/competitionFormat.js';
import { getCompetitionFormat } from '../services/leagueSettingsService.js';
import { getMergedPairingRules } from '../services/pairingRuleService.js';

const RULE_TYPES = ['must_pair', 'never_pair', 'prefer_pair'];

async function assertDoublesLeague(league) {
  const format = await getCompetitionFormat(pool, league);
  if (isSinglesFormat(format)) {
    const error = new Error(
      `Pairing rules only apply to doubles leagues. ${league} is set to singles.`
    );
    error.statusCode = 400;
    throw error;
  }
}

function enrichRulesWithNames(rules, players) {
  const nameById = new Map(players.map((player) => [player.id, player.name]));
  return rules.map((rule) => ({
    ...rule,
    player_name: nameById.get(rule.player_id) || `Player ${rule.player_id}`,
    related_player_name:
      nameById.get(rule.related_player_id) || `Player ${rule.related_player_id}`,
  }));
}

export const getAllPairingRules = async (req, res, next) => {
  try {
    const { league } = req.query;

    let query = `
      SELECT r.id, r.player_id, r.related_player_id, r.rule_type, r.league, r.priority,
             p1.name AS player_name, p2.name AS related_player_name
      FROM team_pairing_rules r
      JOIN players p1 ON p1.id = r.player_id
      JOIN players p2 ON p2.id = r.related_player_id
    `;
    const params = [];

    if (league) {
      if (!VALID_LEAGUES.includes(league)) {
        return res.status(400).json({ success: false, message: 'Invalid league' });
      }
      query += ' WHERE r.league = ?';
      params.push(league);
    }

    query += ' ORDER BY r.league, r.rule_type, p1.name, p2.name';

    const [rows] = await pool.execute(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

export const getBuiltInPairingRules = async (req, res) => {
  res.json({
    success: true,
    data: DEFAULT_TEAM_PAIRING_RULES,
  });
};

export const getEffectivePairingRulesHandler = async (req, res, next) => {
  try {
    const rules = await getMergedPairingRules();
    const [players] = await pool.execute(
      'SELECT id, name FROM players WHERE is_active = TRUE'
    );

    res.json({
      success: true,
      data: enrichRulesWithNames(rules, players),
    });
  } catch (error) {
    next(error);
  }
};

export const createPairingRule = async (req, res, next) => {
  try {
    const {
      player_id: rawPlayerId,
      related_player_id: rawRelatedPlayerId,
      rule_type,
      league,
      priority = 0,
    } = req.body;

    if (!VALID_LEAGUES.includes(league)) {
      return res.status(400).json({ success: false, message: 'Invalid league' });
    }

    await assertDoublesLeague(league);

    if (!RULE_TYPES.includes(rule_type)) {
      return res.status(400).json({
        success: false,
        message: 'rule_type must be must_pair, never_pair, or prefer_pair',
      });
    }

    const playerId = Number(rawPlayerId);
    const relatedPlayerId = Number(rawRelatedPlayerId);

    if (!Number.isInteger(playerId) || !Number.isInteger(relatedPlayerId)) {
      return res.status(400).json({
        success: false,
        message: 'player_id and related_player_id must be valid integers',
      });
    }

    if (playerId === relatedPlayerId) {
      return res.status(400).json({
        success: false,
        message: 'A player cannot have a pairing rule with themselves',
      });
    }

    const [players] = await pool.execute(
      'SELECT id, name, expertise_level, category, is_active FROM players WHERE id IN (?, ?)',
      [playerId, relatedPlayerId]
    );

    if (players.length !== 2) {
      return res.status(400).json({ success: false, message: 'Both players must exist' });
    }

    const playerMap = new Map(players.map((player) => [player.id, player]));
    const player = playerMap.get(playerId);
    const relatedPlayer = playerMap.get(relatedPlayerId);

    if (!player.is_active || !relatedPlayer.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Both players must be active',
      });
    }

    const playerLeague = resolvePlayerLeague(player);
    const relatedLeague = resolvePlayerLeague(relatedPlayer);

    if (playerLeague !== league || relatedLeague !== league) {
      return res.status(400).json({
        success: false,
        message: `Both players must belong to the ${league} league`,
      });
    }

    const [normalizedPlayerId, normalizedRelatedId] = normalizePlayerIds(playerId, relatedPlayerId);

    const [existing] = await pool.execute(
      `SELECT id FROM team_pairing_rules
       WHERE player_id = ? AND related_player_id = ? AND rule_type = ? AND league = ?`,
      [normalizedPlayerId, normalizedRelatedId, rule_type, league]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This pairing rule already exists',
      });
    }

    const resolvedPriority =
      rule_type === 'prefer_pair'
        ? Math.min(100, Math.max(0, Number(priority) || 50))
        : rule_type === 'must_pair'
          ? Math.max(0, Number(priority) || 100)
          : 0;

    const [result] = await pool.execute(
      `INSERT INTO team_pairing_rules (player_id, related_player_id, rule_type, league, priority)
       VALUES (?, ?, ?, ?, ?)`,
      [normalizedPlayerId, normalizedRelatedId, rule_type, league, resolvedPriority]
    );

    res.status(201).json({
      success: true,
      message: 'Pairing rule created',
      data: {
        id: result.insertId,
        player_id: normalizedPlayerId,
        related_player_id: normalizedRelatedId,
        rule_type,
        league,
        priority: resolvedPriority,
        player_name: player.name,
        related_player_name: relatedPlayer.name,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const deletePairingRule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM team_pairing_rules WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Pairing rule not found' });
    }

    res.json({ success: true, message: 'Pairing rule deleted' });
  } catch (error) {
    next(error);
  }
};
