/**
 * Legacy MySQL league→division upgrades are handled by Supabase SQL migrations.
 * @param {import('./pgAdapter.js').createPgPool} _db
 */
export async function ensureDivisionSchema(_db) {
  return { applied: false, changes: [] };
}
