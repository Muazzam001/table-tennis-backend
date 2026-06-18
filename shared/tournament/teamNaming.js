export const LEAGUE_LABELS = {
  Expert: 'Expert League',
  Intermediate: 'Intermediate League',
  Women: 'Women League',
};

const LEGACY_NAME_PREFIXES = {
  Expert: 'Expert League - Team',
  Intermediate: 'Intermediate League - Team',
  Women: 'Women League - Team',
};

/**
 * @param {string} league
 */
export function getLeagueLabel(league) {
  return LEAGUE_LABELS[league] || league || 'Team';
}

/**
 * Resolve league from team row (DB league column or player metadata).
 * @param {{ league?: string, player1_expertise?: string, player2_expertise?: string, player1_category?: string, player2_category?: string }} team
 */
export function resolveTeamLeague(team) {
  if (team?.league && LEAGUE_LABELS[team.league]) {
    return team.league;
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

  return team?.league || 'Expert';
}

/**
 * Default team name when none is provided (number only; league is stored separately).
 * @param {number} teamNumber
 */
export function buildDefaultTeamName(teamNumber) {
  return String(teamNumber);
}

/**
 * Strip legacy "Expert League - Team …" values to name-only.
 * @param {string} teamName
 * @param {string} [league]
 */
export function normalizeTeamName(teamName, league) {
  const name = (teamName || '').trim();
  if (!name) return name;

  const prefixes = league
    ? [LEGACY_NAME_PREFIXES[league]].filter(Boolean)
    : Object.values(LEGACY_NAME_PREFIXES);

  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      const stripped = name.slice(prefix.length).trim();
      return stripped || name;
    }
  }

  return name;
}
