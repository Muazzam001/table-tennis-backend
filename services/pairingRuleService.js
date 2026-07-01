import pool from '../utils/database.js';
import { isMissingTableError } from '../utils/dbErrors.js';
import { getEffectivePairingRules } from '@shared/tournament/teamPairing.js';

async function loadDatabasePairingRules() {
  try {
    const [rows] = await pool.execute(
      `SELECT player_id, related_player_id, rule_type, division, priority
       FROM team_pairing_rules`
    );
    return rows.map((row) => ({ ...row, source: 'database' }));
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Load active players and return merged default + database doubles pairing rules.
 */
export async function getMergedPairingRules() {
  const [players] = await pool.execute(
    'SELECT id, email FROM players WHERE is_active = TRUE'
  );
  const dbRules = await loadDatabasePairingRules();
  return getEffectivePairingRules(players, dbRules);
}
