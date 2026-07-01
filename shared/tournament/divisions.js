/** Gender divisions — the only tournament brackets (Men / Women) */
export const GENDERS = ['Men', 'Women'];

/** @deprecated Use GENDERS */
export const CATEGORIES = GENDERS;

/** Skill levels stored on players; not separate tournament brackets */
export const EXPERTISE_LEVELS = ['Beginner', 'Intermediate', 'Expert'];

/** Tournament divisions = gender only (2 independent brackets) */
export const TOURNAMENT_DIVISIONS = GENDERS.map((gender) => ({
  value: gender,
  label: `${gender} Division`,
  category: gender,
}));

export const VALID_DIVISIONS = TOURNAMENT_DIVISIONS.map((d) => d.value);

const DIVISION_ENUM_SQL = VALID_DIVISIONS.map((d) => `'${d}'`).join(', ');

export const DIVISION_COLUMN_ENUM = `ENUM(${DIVISION_ENUM_SQL})`;

/**
 * Resolve tournament division from player gender.
 * @param {string} category Men | Women
 */
export function buildTournamentDivision(category) {
  return category === 'Women' ? 'Women' : 'Men';
}

/**
 * @param {string} value
 * @returns {{ category: 'Men' | 'Women' }}
 */
export function parseTournamentDivision(value) {
  const migrated = migrateLegacyDivisionValue(value);
  return { category: migrated === 'Women' ? 'Women' : 'Men' };
}

/**
 * @param {{ category?: string }} player
 * @returns {'Men' | 'Women'}
 */
export function resolveTournamentDivisionFromPlayer(player) {
  return player?.category === 'Women' ? 'Women' : 'Men';
}

/**
 * @param {string} value
 */
export function isValidTournamentDivision(value) {
  return VALID_DIVISIONS.includes(migrateLegacyDivisionValue(value));
}

/**
 * @param {string} value
 */
export function getTournamentDivisionLabel(value) {
  const migrated = migrateLegacyDivisionValue(value);
  return TOURNAMENT_DIVISIONS.find((d) => d.value === migrated)?.label || migrated || 'Division';
}

/**
 * Map legacy division values to Men or Women.
 * @param {string} legacy
 * @returns {'Men' | 'Women'}
 */
export function migrateLegacyDivisionValue(legacy) {
  if (legacy === 'Women' || legacy === 'Women-Beginner' || legacy === 'Women-Intermediate' || legacy === 'Women-Expert') {
    return 'Women';
  }
  if (
    legacy === 'Men' ||
    legacy === 'Men-Beginner' ||
    legacy === 'Men-Intermediate' ||
    legacy === 'Men-Expert' ||
    legacy === 'Expert' ||
    legacy === 'Intermediate'
  ) {
    return 'Men';
  }
  if (GENDERS.includes(legacy)) return legacy;
  return 'Men';
}

/**
 * Normalize API division input (legacy composite values → Men | Women).
 * @param {string} division
 * @returns {'Men' | 'Women' | null}
 */
export function resolveDivisionParam(division) {
  if (division == null || division === '') return null;
  const normalized = migrateLegacyDivisionValue(String(division).trim());
  return VALID_DIVISIONS.includes(normalized) ? normalized : null;
}

export const DEFAULT_TOURNAMENT_DIVISION = VALID_DIVISIONS[0];

/**
 * @param {Array<{ category?: string }>} players
 * @param {string} division Men | Women
 */
export function filterPlayersForDivision(players, division) {
  const category = migrateLegacyDivisionValue(division);
  return players.filter((p) => (p?.category === 'Women' ? 'Women' : 'Men') === category);
}

/**
 * @param {*} value
 */
export function buildDivisionMap(value) {
  return Object.fromEntries(VALID_DIVISIONS.map((d) => [d, value]));
}

/**
 * @param {Array<{ category?: string }>} players
 */
export function countPlayersByDivision(players) {
  return Object.fromEntries(
    VALID_DIVISIONS.map((d) => [d, filterPlayersForDivision(players, d).length])
  );
}

/**
 * @param {Array<{ category?: string, expertise_level?: string }>} players
 */
export function countPlayersByExpertise(players) {
  return Object.fromEntries(
    EXPERTISE_LEVELS.map((level) => [
      level,
      players.filter((p) => (p?.expertise_level || 'Beginner') === level).length,
    ])
  );
}
