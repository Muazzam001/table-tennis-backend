import { SEED_PLAYERS } from '@shared/tournament/data/seedRoster.js';

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {import('@shared/tournament/data/seedRoster.js').SeedPlayerDef} player
 */
export async function upsertSeedPlayer(db, player) {
  const email = player.email?.trim();
  if (!email) {
    throw new Error(`Seed player "${player.name}" requires an email`);
  }

  const pyramidTier = player.pyramid_tier ?? null;

  const [existing] = await db.execute('SELECT id FROM players WHERE email = ?', [email]);
  if (existing.length > 0) {
    await db.execute(
      `UPDATE players
       SET name = ?, expertise_level = ?, category = ?, pyramid_tier = ?, is_active = TRUE
       WHERE id = ?`,
      [player.name, player.expertise_level, player.category, pyramidTier, existing[0].id]
    );
    return { id: existing[0].id, created: false };
  }

  const [result] = await db.execute(
    `INSERT INTO players (name, email, expertise_level, category, pyramid_tier, is_active)
     VALUES (?, ?, ?, ?, ?, TRUE)`,
    [player.name, email, player.expertise_level, player.category, pyramidTier]
  );
  return { id: result.insertId, created: true };
}

/**
 * Upsert all canonical seed players.
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 */
export async function upsertAllSeedPlayers(db) {
  let playersCreated = 0;
  /** @type {Map<string, number>} */
  const emailToPlayerId = new Map();

  for (const player of SEED_PLAYERS) {
    const { id, created } = await upsertSeedPlayer(db, player);
    emailToPlayerId.set(player.email.toLowerCase(), id);
    if (created) playersCreated += 1;
  }

  return { playersCreated, emailToPlayerId };
}

/**
 * Load pyramid-eligible players from the database (runtime source of truth).
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 */
export async function getPyramidPlayersFromDb(db, division) {
  const [rows] = await db.execute(
    `SELECT id, name, email, pyramid_tier AS tier
     FROM players
     WHERE is_active = TRUE
       AND category = ?
       AND pyramid_tier IS NOT NULL
     ORDER BY pyramid_tier ASC, name ASC`,
    [division]
  );
  return rows;
}
