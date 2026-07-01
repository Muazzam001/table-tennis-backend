/** All valid DB `matches.round_type` values (group stage + pyramid + knockout). */
export const MATCH_ROUND_TYPES = [
  'Qualifying',
  'S1',
  'S2',
  'Quarter Final',
  'Level 2',
  'Level 3',
  'Semi Final',
  'Third Place',
  'Final',
];

/** Sort order for listing matches across formats (qualifying → pyramid → knockout). */
export const MATCH_ROUND_SORT_ORDER = Object.fromEntries(
  MATCH_ROUND_TYPES.map((roundType, index) => [roundType, index + 1])
);

/**
 * SQL `CASE` expression fragment for `ORDER BY` on `round_type`.
 * @param {string} [column='m.round_type']
 */
export function buildMatchRoundSortCase(column = 'm.round_type') {
  const whenClauses = MATCH_ROUND_TYPES.map(
    (roundType, index) => `WHEN '${roundType}' THEN ${index + 1}`
  ).join('\n          ');
  return `CASE ${column}\n          ${whenClauses}\n          ELSE 99\n        END`;
}
