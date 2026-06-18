/**
 * Built-in doubles pairing rules — applied only when a division uses doubles format.
 * Identified by email so they survive player ID changes after re-seeding.
 *
 * Rule types:
 * - never_pair: blocks two players from being on the same doubles team
 * - must_pair: always on the same doubles team (applied after random assignment)
 * - prefer_pair: sometimes on the same team (priority = chance 0–100)
 */

/** @typedef {'must_pair' | 'never_pair' | 'prefer_pair'} PairingRuleType */

/** @typedef {'Expert' | 'Intermediate' | 'Women'} PairingDivision */

/**
 * @typedef {Object} DefaultPairingRuleDef
 * @property {string} playerEmail
 * @property {string} relatedPlayerEmail
 * @property {PairingRuleType} rule_type
 * @property {PairingDivision} division
 * @property {number} [priority]
 * @property {string} [note]
 */

/** @type {DefaultPairingRuleDef[]} */
export const DEFAULT_TEAM_PAIRING_RULES = [
  // Add built-in doubles pairing rules here, e.g.:
  // { playerEmail: 'a@example.com', relatedPlayerEmail: 'b@example.com', rule_type: 'never_pair', division: 'Expert' },
];
