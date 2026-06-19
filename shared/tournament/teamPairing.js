/**
 * Doubles team pairing rules for random team generation.
 * These rules do not apply to singles divisions (one player per entrant).
 *
 * Application order:
 * 1. Random doubles pairing with never-pair constraints only
 * 2. Must-pair rules (swaps)
 * 3. Prefer-pair rules (probabilistic swaps)
 */

import { DEFAULT_TEAM_PAIRING_RULES } from './defaultTeamPairingRules.js';

/** @typedef {{ id: number, name?: string, email?: string }} PlayerRef */

/** @typedef {{ player_id: number, related_player_id: number, rule_type: 'must_pair' | 'never_pair' | 'prefer_pair', division?: string, priority?: number, source?: string }} PairingRule */

export const DEFAULT_PREFER_PAIR_CHANCE = 50;

export const PAIRING_RULE_LABELS = {
  must_pair: 'Must pair',
  never_pair: 'Never pair',
  prefer_pair: 'Prefer pair',
};

/**
 * @param {number} a
 * @param {number} b
 */
export function normalizePlayerPairKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * @param {number} id1
 * @param {number} id2
 */
export function normalizePlayerIds(id1, id2) {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

import {
  resolveTournamentDivisionFromPlayer,
} from './divisions.js';

/**
 * @param {{ category?: string, expertise_level?: string }} player
 */
export function resolvePlayerDivision(player) {
  return resolveTournamentDivisionFromPlayer(player);
}

/**
 * @param {Set<string>} neverPairSet
 * @param {number} idA
 * @param {number} idB
 */
export function canPairPlayers(neverPairSet, idA, idB) {
  return !neverPairSet.has(normalizePlayerPairKey(idA, idB));
}

/**
 * Fisher–Yates shuffle (mutates array).
 * @param {unknown[]} array
 * @param {() => number} [random]
 */
export function shufflePlayers(array, random = Math.random) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * @param {PairingRule} rule
 */
function pairingRuleKey(rule) {
  return `${rule.division}|${rule.rule_type}|${normalizePlayerPairKey(rule.player_id, rule.related_player_id)}`;
}

/**
 * @param {PairingRule[]} rules
 * @param {string} division
 * @param {number} id1
 * @param {number} id2
 */
function hasNeverPairRule(rules, division, id1, id2) {
  const pairKey = normalizePlayerPairKey(id1, id2);
  return rules.some(
    (rule) =>
      rule.division === division &&
      rule.rule_type === 'never_pair' &&
      normalizePlayerPairKey(rule.player_id, rule.related_player_id) === pairKey
  );
}

/**
 * @param {PairingRule[]} rules
 * @param {string} division
 * @param {number} id1
 * @param {number} id2
 */
function hasMustPairRule(rules, division, id1, id2) {
  const pairKey = normalizePlayerPairKey(id1, id2);
  return rules.some(
    (rule) =>
      rule.division === division &&
      rule.rule_type === 'must_pair' &&
      normalizePlayerPairKey(rule.player_id, rule.related_player_id) === pairKey
  );
}

/**
 * @param {PairingRule} rule
 */
export function getPreferPairChance(rule) {
  const chance = rule.priority ?? DEFAULT_PREFER_PAIR_CHANCE;
  return Math.min(100, Math.max(0, chance));
}

/**
 * @param {Array<{ id: number, email?: string }>} players
 * @param {import('./defaultTeamPairingRules.js').DefaultPairingRuleDef[]} [defaultDefs]
 */
export function resolveDefaultPairingRules(players, defaultDefs = DEFAULT_TEAM_PAIRING_RULES) {
  const emailToId = new Map(
    players.filter((player) => player.email).map((player) => [player.email.toLowerCase(), player.id])
  );

  const resolved = [];
  for (const def of defaultDefs) {
    const id1 = emailToId.get(def.playerEmail.toLowerCase());
    const id2 = emailToId.get(def.relatedPlayerEmail.toLowerCase());
    if (!id1 || !id2 || id1 === id2) continue;

    const [player_id, related_player_id] = normalizePlayerIds(id1, id2);
    resolved.push({
      player_id,
      related_player_id,
      rule_type: def.rule_type,
      division: def.division,
      priority:
        def.priority ??
        (def.rule_type === 'must_pair' ? 100 : def.rule_type === 'prefer_pair' ? DEFAULT_PREFER_PAIR_CHANCE : 0),
      source: 'default',
    });
  }

  return resolved;
}

/**
 * @param {PairingRule[]} defaultRules
 * @param {PairingRule[]} dbRules
 */
export function mergePairingRules(defaultRules, dbRules) {
  const merged = [...defaultRules];
  const existingKeys = new Set(merged.map(pairingRuleKey));

  for (const dbRule of dbRules) {
    const normalized = {
      ...dbRule,
      priority: dbRule.priority ?? 0,
      source: dbRule.source || 'database',
    };
    const key = pairingRuleKey(normalized);
    if (existingKeys.has(key)) continue;

    if (
      (normalized.rule_type === 'must_pair' || normalized.rule_type === 'prefer_pair') &&
      hasNeverPairRule(merged, normalized.division, normalized.player_id, normalized.related_player_id)
    ) {
      continue;
    }

    if (
      normalized.rule_type === 'prefer_pair' &&
      hasMustPairRule(merged, normalized.division, normalized.player_id, normalized.related_player_id)
    ) {
      continue;
    }

    merged.push(normalized);
    existingKeys.add(key);
  }

  return merged;
}

/**
 * @param {Array<{ id: number, email?: string }>} players
 * @param {PairingRule[]} [dbRules]
 */
export function getEffectivePairingRules(players, dbRules = []) {
  const defaults = resolveDefaultPairingRules(players);
  return mergePairingRules(defaults, dbRules);
}

export function buildNeverPairSet(rules, division) {
  const set = new Set();
  for (const rule of rules) {
    if (rule.division !== division || rule.rule_type !== 'never_pair') continue;
    set.add(normalizePlayerPairKey(rule.player_id, rule.related_player_id));
  }
  return set;
}

/**
 * @param {PlayerRef[][]} teams
 * @param {number} playerId
 */
function findPlayerTeam(teams, playerId) {
  for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
    const playerIndex = teams[teamIndex].findIndex((player) => player.id === playerId);
    if (playerIndex !== -1) {
      return { teamIndex, playerIndex };
    }
  }
  return null;
}

/**
 * @param {PlayerRef[][]} teams
 * @param {number} playerAId
 * @param {number} playerBId
 * @param {Set<string>} neverPairSet
 */
function trySwapToPairTeams(teams, playerAId, playerBId, neverPairSet) {
  const locA = findPlayerTeam(teams, playerAId);
  const locB = findPlayerTeam(teams, playerBId);
  if (!locA || !locB) return false;
  if (locA.teamIndex === locB.teamIndex) return true;

  const teamA = teams[locA.teamIndex];
  const teamB = teams[locB.teamIndex];
  const playerA = teamA[locA.playerIndex];
  const playerB = teamB[locB.playerIndex];
  const partnerA = teamA[1 - locA.playerIndex];
  const partnerB = teamB[1 - locB.playerIndex];

  if (!canPairPlayers(neverPairSet, playerA.id, playerB.id)) return false;
  if (!canPairPlayers(neverPairSet, partnerA.id, partnerB.id)) return false;

  teamA[1 - locA.playerIndex] = playerB;
  teamB[locB.playerIndex] = partnerA;
  return true;
}

/**
 * @param {PlayerRef[]} players
 * @param {Set<string>} neverPairSet
 * @param {() => number} random
 */
function randomPairDoublesWithNeverRules(players, neverPairSet, random) {
  const pool = [...players];
  const teams = [];

  shufflePlayers(pool, random);

  while (pool.length >= 2) {
    const anchor = pool.shift();
    const partnerIndex = pool.findIndex((candidate) =>
      canPairPlayers(neverPairSet, anchor.id, candidate.id)
    );

    if (partnerIndex === -1) {
      throw new Error(
        `Cannot pair ${anchor.name || anchor.id}: no compatible doubles partner left (never-pair rules may be too restrictive).`
      );
    }

    teams.push([anchor, pool.splice(partnerIndex, 1)[0]]);
  }

  if (pool.length === 1) {
    const leftover = pool[0];
    throw new Error(
      `Cannot complete doubles pairing: ${leftover.name || leftover.id} has no partner.`
    );
  }

  return teams;
}

/**
 * @param {PlayerRef[][]} teams
 * @param {PairingRule[]} mustPairRules
 * @param {Set<string>} neverPairSet
 */
function applyMustPairRulesToTeams(teams, mustPairRules, neverPairSet) {
  for (const rule of mustPairRules) {
    const locA = findPlayerTeam(teams, rule.player_id);
    const locB = findPlayerTeam(teams, rule.related_player_id);
    if (!locA || !locB) continue;
    if (locA.teamIndex === locB.teamIndex) continue;

    if (!canPairPlayers(neverPairSet, rule.player_id, rule.related_player_id)) {
      throw new Error(
        `Cannot apply must-pair rule: players ${rule.player_id} and ${rule.related_player_id} are blocked by a never-pair rule.`
      );
    }

    const swapped = trySwapToPairTeams(teams, rule.player_id, rule.related_player_id, neverPairSet);
    if (!swapped) {
      throw new Error(
        `Cannot apply must-pair rule: players ${rule.player_id} and ${rule.related_player_id} could not be paired without breaking never-pair rules.`
      );
    }
  }
}

/**
 * @param {PlayerRef[][]} teams
 * @param {PairingRule[]} preferPairRules
 * @param {Set<string>} neverPairSet
 * @param {() => number} random
 */
function applyPreferPairRulesToTeams(teams, preferPairRules, neverPairSet, random) {
  for (const rule of preferPairRules) {
    const locA = findPlayerTeam(teams, rule.player_id);
    const locB = findPlayerTeam(teams, rule.related_player_id);
    if (!locA || !locB) continue;
    if (locA.teamIndex === locB.teamIndex) continue;
    if (!canPairPlayers(neverPairSet, rule.player_id, rule.related_player_id)) continue;

    const chance = getPreferPairChance(rule) / 100;
    if (random() < chance) {
      trySwapToPairTeams(teams, rule.player_id, rule.related_player_id, neverPairSet);
    }
  }
}

/**
 * Build doubles teams from a player pool while honoring pairing rules.
 * For singles divisions, use individual entrant generation instead.
 *
 * @param {PlayerRef[]} players
 * @param {PairingRule[]} rules
 * @param {string} division
 * @param {() => number} [random]
 * @returns {PlayerRef[][]}
 */
export function buildDoublesTeamsWithPairingRules(players, rules, division, random = Math.random) {
  const neverPairSet = buildNeverPairSet(rules, division);

  const mustPairRules = rules
    .filter((rule) => rule.division === division && rule.rule_type === 'must_pair')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const preferPairRules = rules
    .filter((rule) => rule.division === division && rule.rule_type === 'prefer_pair')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const teams = randomPairDoublesWithNeverRules(players, neverPairSet, random);
  applyMustPairRulesToTeams(teams, mustPairRules, neverPairSet);
  applyPreferPairRulesToTeams(teams, preferPairRules, neverPairSet, random);

  return teams;
}
