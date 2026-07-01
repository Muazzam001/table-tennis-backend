/**
 * Database error helpers for PostgreSQL (Supabase) with legacy MySQL code compatibility.
 */

/** @param {{ code?: string } | null | undefined} error */
export function isDuplicateKeyError(error) {
  return error?.code === '23505' || error?.code === 'ER_DUP_ENTRY';
}

/** @param {{ code?: string } | null | undefined} error */
export function isMissingTableError(error) {
  return (
    error?.code === '42P01' ||
    error?.code === '3D000' ||
    error?.code === 'ER_NO_SUCH_TABLE' ||
    error?.code === 'ER_BAD_DB_ERROR'
  );
}
