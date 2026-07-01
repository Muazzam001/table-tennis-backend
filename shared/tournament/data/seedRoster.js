/**
 * Canonical seed roster — single source of truth for demo players.
 *
 * Used by:
 * - Group-stage / bracket seeding (category + expertise_level)
 * - Tier pyramid seeding (pyramid_tier on Men Expert players)
 *
 * At runtime, player records in the database are authoritative after seeding.
 * Edit this file to change bootstrap data, or edit players in the UI.
 */

/** @typedef {'Men' | 'Women'} PlayerCategory */
/** @typedef {'Beginner' | 'Intermediate' | 'Expert'} ExpertiseLevel */
/** @typedef {1 | 2 | 3} PyramidTier */

/**
 * @typedef {Object} SeedPlayerDef
 * @property {string} name
 * @property {string} email
 * @property {PlayerCategory} category
 * @property {ExpertiseLevel} expertise_level
 * @property {PyramidTier} [pyramid_tier] Men Expert tier-pyramid assignment (1 = top)
 */

/** Division used for tier-pyramid Men singles track */
export const TIER_PYRAMID_SEED_DIVISION = 'Men';

/** @type {SeedPlayerDef[]} */
export const SEED_PLAYERS = [
  // Men Expert — Tier 1
  { name: 'Zaigham B', email: 'zaigham.b@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 1 },
  { name: 'Zafar A', email: 'zafar.a@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 1 },
  { name: 'Ali R', email: 'ali.r@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 1 },
  { name: 'Besalat A', email: 'besalat.a@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 1 },
  { name: 'Shahrukh K', email: 'shahrukh.k@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 1 },
  { name: 'Muazzam Y', email: 'muazzam.y@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 1 },
  { name: 'Uzair A', email: 'uzair.a@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 1 },
  { name: 'Ramzan K', email: 'ramzan.k@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 1 },
  // Men Expert — Tier 2
  { name: 'Mehroz K', email: 'mehroz.k@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'Salman M', email: 'salman.m@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'Haroon R', email: 'haroon.r@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'M Inamullah', email: 'm.inamullah@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'Arslan QA', email: 'arslan.qa@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'Hamza QA', email: 'hamza.qa@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'M Ahsan', email: 'm.ahsan@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'Ahsan Afzal', email: 'ahsan.a@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'Usama S', email: 'usama.s@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'Bilal S', email: 'bilal.s@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'Aizaz A', email: 'aizaz.a@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  { name: 'Faizan R', email: 'faizan.r@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 2 },
  // Men Expert — Tier 3
  { name: 'M Arshad', email: 'm.arshad@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'Zaeem A', email: 'zaeem.a@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'Ghulam D', email: 'ghulam.gd@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'M Naseem', email: 'm.naseem@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'Zeeshan F', email: 'zeeshan.f@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'Osaid M', email: 'osaid.m@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'Anees R', email: 'anees.r@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'M Usman', email: 'm.usman@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'Hamza I', email: 'hamza.i@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'Ahmad T', email: 'ahmad.t@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'M Waqas', email: 'm.waqas@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  { name: 'Aqib M', email: 'aqib.m@ebitlogix.com', category: 'Men', expertise_level: 'Expert', pyramid_tier: 3 },
  // Women Expert
  { name: 'Ayesha A', email: 'ayesha.a@ebitlogix.com', category: 'Women', expertise_level: 'Expert' },
  { name: 'Benish A', email: 'benish.a@ebitlogix.com', category: 'Women', expertise_level: 'Expert' },
  { name: 'Urwah A', email: 'urwah.a@ebitlogix.com', category: 'Women', expertise_level: 'Expert' },
  { name: 'Hafsa S', email: 'hafsa.s@ebitlogix.com', category: 'Women', expertise_level: 'Expert' },
  { name: 'Mahnoor T', email: 'mahnoor.t@ebitlogix.com', category: 'Women', expertise_level: 'Expert' },
  { name: 'Malaika K', email: 'malaika.k@ebitlogix.com', category: 'Women', expertise_level: 'Expert' },
];

/**
 * Players eligible for tier-pyramid (have a tier assignment).
 * @returns {Required<Pick<SeedPlayerDef, 'name' | 'email' | 'pyramid_tier'>>[]}
 */
export function getPyramidSeedRoster() {
  return SEED_PLAYERS.filter((p) => p.pyramid_tier != null).map((p) => ({
    name: p.name,
    email: p.email,
    tier: p.pyramid_tier,
  }));
}

/** @type {Record<1 | 2 | 3, number>} */
export const PYRAMID_TIER_COUNTS = getPyramidSeedRoster().reduce(
  (acc, row) => {
    acc[row.tier] += 1;
    return acc;
  },
  { 1: 0, 2: 0, 3: 0 }
);

// Legacy aliases for tier-pyramid seed service
export const TIER_PYRAMID_ROSTER = getPyramidSeedRoster();
export const TIER_PYRAMID_ROSTER_COUNTS = PYRAMID_TIER_COUNTS;
