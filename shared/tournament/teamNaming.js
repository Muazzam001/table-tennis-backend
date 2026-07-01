import {
  getTournamentDivisionLabel,
  resolveTournamentDivisionFromPlayer,
  migrateLegacyDivisionValue,
  TOURNAMENT_DIVISIONS,
} from './divisions.js';

export const DIVISION_LABELS = Object.fromEntries(
  TOURNAMENT_DIVISIONS.map((d) => [d.value, d.label])
);

const LEGACY_NAME_PREFIXES = [
  ...TOURNAMENT_DIVISIONS.map((d) => `${d.label} - Team`),
  'Expert Division - Team',
  'Intermediate Division - Team',
  'Women Division - Team',
];

/** @deprecated Use getTournamentDivisionLabel */
export function getDivisionLabel(division) {
  return getTournamentDivisionLabel(migrateLegacyDivisionValue(division));
}

/**
 * Resolve tournament division from team row (DB division column or player gender).
 * @param {{ division?: string, player1_category?: string, player2_category?: string }} team
 */
export function resolveTeamDivision(team) {
  if (team?.division) {
    const migrated = migrateLegacyDivisionValue(team.division);
    if (DIVISION_LABELS[migrated]) {
      return migrated;
    }
  }

  if (team?.player1_category === 'Women' || team?.player2_category === 'Women') {
    return 'Women';
  }

  return 'Men';
}

/**
 * Default team name when none is provided (number only; division is stored separately).
 * @param {number} teamNumber
 */
export function buildDefaultTeamName(teamNumber) {
  return String(teamNumber);
}

/**
 * Strip legacy prefixed team names to name-only.
 * @param {string} teamName
 * @param {string} [division]
 */
export function normalizeTeamName(teamName, division) {
  const name = (teamName || '').trim();
  if (!name) return name;

  for (const prefix of LEGACY_NAME_PREFIXES) {
    if (name.startsWith(prefix)) {
      const stripped = name.slice(prefix.length).trim();
      return stripped || name;
    }
  }

  return name;
}
