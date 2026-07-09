/**
 * Coerce PostgreSQL aggregate/count values to integers.
 * node-pg returns BIGINT (COUNT, SUM on int columns) as strings by default.
 * @param {unknown} value
 * @param {number} [fallback=0]
 */
export function sqlInt(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * Read COUNT(*) (or similar) from the first row of a mysql2-compatible result.
 * @param {object[] | null | undefined} rows
 * @param {string} [field='count']
 * @param {number} [fallback=0]
 */
export function sqlCount(rows, field = 'count', fallback = 0) {
  return sqlInt(rows?.[0]?.[field], fallback);
}

/** PostgreSQL enum casts for parameterized queries (node-pg sends text). */
export const PG_ENUM = {
  pyramidTeamStage: 'pyramid_team_stage',
  pyramidTeamStatus: 'pyramid_team_status',
  matchRoundType: 'match_round_type',
  matchPyramidStage: 'match_pyramid_stage',
  level1bStatus: 'level1b_status',
  progressionReason: 'progression_reason',
  genderDivision: 'gender_division',
};

/**
 * @param {string} pgEnumName
 */
export function pgCast(pgEnumName) {
  return `::${pgEnumName}`;
}
