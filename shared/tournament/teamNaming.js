export const DIVISION_LABELS = {
  Expert: 'Expert Division',
  Intermediate: 'Intermediate Division',
  Women: 'Women Division',
};

const LEGACY_NAME_PREFIXES = {
  Expert: 'Expert Division - Team',
  Intermediate: 'Intermediate Division - Team',
  Women: 'Women Division - Team',
};

/**
 * @param {string} division
 */
export function getDivisionLabel(division) {
  return DIVISION_LABELS[division] || division || 'Team';
}

/**
 * Resolve division from team row (DB division column or player metadata).
 * @param {{ division?: string, player1_expertise?: string, player2_expertise?: string, player1_category?: string, player2_category?: string }} team
 */
export function resolveTeamDivision(team) {
  if (team?.division && DIVISION_LABELS[team.division]) {
    return team.division;
  }

  const c1 = team?.player1_category || 'Men';
  const c2 = team?.player2_category || 'Men';
  if (c1 === 'Women' || c2 === 'Women') {
    return 'Women';
  }

  const e1 = team?.player1_expertise;
  const e2 = team?.player2_expertise;
  if (e1 === 'Expert' && e2 === 'Expert') return 'Expert';
  if (e1 === 'Intermediate' && e2 === 'Intermediate') return 'Intermediate';

  return team?.division || 'Expert';
}

/**
 * Default team name when none is provided (number only; division is stored separately).
 * @param {number} teamNumber
 */
export function buildDefaultTeamName(teamNumber) {
  return String(teamNumber);
}

/**
 * Strip legacy "Expert Division - Team …" values to name-only.
 * @param {string} teamName
 * @param {string} [division]
 */
export function normalizeTeamName(teamName, division) {
  const name = (teamName || '').trim();
  if (!name) return name;

  const prefixes = division
    ? [LEGACY_NAME_PREFIXES[division]].filter(Boolean)
    : Object.values(LEGACY_NAME_PREFIXES);

  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      const stripped = name.slice(prefix.length).trim();
      return stripped || name;
    }
  }

  return name;
}
