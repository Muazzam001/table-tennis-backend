export const VALID_DIVISIONS = ['Expert', 'Intermediate', 'Women'];

export const COMPETITION_FORMATS = ['doubles', 'singles'];

export const COMPETITION_FORMAT_LABELS = {
  doubles: 'Doubles (2-player teams)',
  singles: 'Singles (individual players)',
};

/**
 * @param {string} format
 * @returns {boolean}
 */
export function isValidCompetitionFormat(format) {
  return COMPETITION_FORMATS.includes(format);
}

/**
 * @param {string} format
 * @returns {boolean}
 */
export function isSinglesFormat(format) {
  return format === 'singles';
}

/**
 * @param {{ player2_id?: number | null }} team
 * @returns {boolean}
 */
export function isSinglesTeam(team) {
  return team?.player2_id == null;
}

/**
 * Minimum eligible players required to start a division tournament.
 * @param {string} format
 * @returns {number}
 */
export function getMinimumParticipants(format) {
  return 2;
}

/**
 * Whether a player count can form valid teams for the format.
 * @param {number} playerCount
 * @param {string} format
 */
export function canFormTeams(playerCount, format) {
  const min = getMinimumParticipants(format);
  return playerCount >= min && playerCount % 2 === 0;
}

/**
 * Human-readable requirement for team generation UI.
 * @param {string} format
 */
export function getParticipantRequirementLabel(format) {
  if (isSinglesFormat(format)) {
    return 'need an even number of players (≥ 2) — each player is one entrant';
  }
  return 'need an even number of players (≥ 2) — players are paired into teams';
}
