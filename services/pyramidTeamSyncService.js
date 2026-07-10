import { getDefaultTierPyramidConfig, normalizeTierPyramidConfig, deriveTierPyramidConfigFromAssignments } from '@shared/tournament/formats/tierPyramid/config.js';
import { ensureTierPyramidSchema } from './tierPyramidSchemaService.js';
import { setCompetitionFormat, setTournamentFormat, getDivisionSettings } from './divisionSettingsService.js';
import { assignTiers } from './tierPyramidService.js';
import { getPyramidPlayersFromDb } from './playerSeedService.js';
import { isSinglesFormat } from '@shared/tournament/competitionFormat.js';

/**
 * Copy players.pyramid_tier onto existing singles teams.
 * When matches already exist, only sync the tier number — never wipe pyramid_stage /
 * advancement_source mid-tournament (that incorrectly puts Tier 1 players into L1B UI).
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 * @param {{ resetStages?: boolean }} [options]
 */
export async function propagatePyramidTiersFromPlayers(db, division, options = {}) {
  await ensureTierPyramidSchema(db);

  const settings = await getDivisionSettings(db, division);
  if (settings.tournament_format !== 'tier-pyramid') {
    return { propagated: false, reason: 'not_tier_pyramid', division };
  }

  const hasMatches = await divisionHasPyramidMatches(db, division);
  const resetStages = options.resetStages === true && !hasMatches;

  const [assigned] = await db.execute(
    resetStages
      ? `UPDATE teams t
         SET tier = p.pyramid_tier,
             pyramid_stage = 'registered',
             pyramid_status = 'active',
             advancement_source = NULL
         FROM players p
         WHERE p.id = t.player1_id
           AND t.player2_id IS NULL
           AND t.division = ?
           AND p.is_active = TRUE
           AND p.pyramid_tier IS NOT NULL`
      : `UPDATE teams t
         SET tier = p.pyramid_tier
         FROM players p
         WHERE p.id = t.player1_id
           AND t.player2_id IS NULL
           AND t.division = ?
           AND p.is_active = TRUE
           AND p.pyramid_tier IS NOT NULL`,
    [division]
  );

  // Never clear stage/status for teams that already have matches in this division.
  const [cleared] = resetStages
    ? await db.execute(
        `UPDATE teams t
         SET tier = NULL,
             pyramid_stage = NULL,
             pyramid_status = NULL,
             advancement_source = NULL
         FROM players p
         WHERE p.id = t.player1_id
           AND t.player2_id IS NULL
           AND t.division = ?
           AND (p.pyramid_tier IS NULL OR NOT p.is_active)`,
        [division]
      )
    : await db.execute(
        `UPDATE teams t
         SET tier = NULL
         FROM players p
         WHERE p.id = t.player1_id
           AND t.player2_id IS NULL
           AND t.division = ?
           AND (p.pyramid_tier IS NULL OR NOT p.is_active)`,
        [division]
      );

  return {
    propagated: true,
    division,
    teamsTiered: assigned.affectedRows,
    teamsCleared: cleared.affectedRows,
    stagesPreserved: !resetStages,
  };
}

/**
 * Propagate when teams exist; create teams from players when none exist.
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 */
export async function ensurePyramidTiersSyncedFromPlayers(db, division) {
  if (await divisionHasPyramidMatches(db, division)) {
    return { synced: false, reason: 'has_matches', division };
  }

  const settings = await getDivisionSettings(db, division);
  if (settings.tournament_format !== 'tier-pyramid') {
    return { synced: false, reason: 'not_tier_pyramid', division };
  }

  const pyramidPlayers = await getPyramidPlayersFromDb(db, division);
  if (pyramidPlayers.length === 0) {
    return { synced: false, reason: 'no_pyramid_players', division };
  }

  const [teamRows] = await db.execute(
    'SELECT COUNT(*) AS team_count FROM teams WHERE division = ?',
    [division]
  );
  const teamCount = Number(teamRows[0]?.team_count ?? 0);

  if (teamCount === 0) {
    return syncPyramidTeamsFromPlayers(db, division);
  }

  return propagatePyramidTiersFromPlayers(db, division, { resetStages: true });
}

/**
 * After teams are created or replaced for a tier-pyramid singles division.
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 */
export async function afterDivisionTeamsChanged(db, division) {
  const settings = await getDivisionSettings(db, division);
  if (settings.tournament_format !== 'tier-pyramid') {
    return { applied: false, reason: 'not_tier_pyramid' };
  }
  if (!isSinglesFormat(settings.competition_format)) {
    return { applied: false, reason: 'not_singles' };
  }
  // Preserve live pyramid stages when the division already has matches.
  return propagatePyramidTiersFromPlayers(db, division, { resetStages: false });
}

/**
 * Ensure singles entrants + team tiers match players.pyramid_tier in the database.
 * Replaces all teams in the division with one entrant per pyramid-eligible player.
 *
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 * @param {{ formatConfig?: object | null }} [options]
 */
export async function syncPyramidTeamsFromPlayers(db, division, options = {}) {
  const { formatConfig: formatConfigOverride = null } = options;
  await ensureTierPyramidSchema(db);

  const pyramidPlayers = await getPyramidPlayersFromDb(db, division);
  if (pyramidPlayers.length === 0) {
    return {
      synced: false,
      reason: 'no_pyramid_players',
      division,
      teamsCreated: 0,
      tiersAssigned: false,
      tierErrors: [],
    };
  }

  const settings = await getDivisionSettings(db, division);

  await db.execute('DELETE FROM teams WHERE division = ?', [division]);

  let tierState = null;
  let tierAssignError = null;
  try {
    // Multi-row INSERT to create all teams in one query
    const values = pyramidPlayers.map(() => '(?, ?, NULL, ?)').join(',');
    const params = pyramidPlayers.flatMap(row => [row.name, row.id, division]);
    const [result] = await db.execute(
      `INSERT INTO teams (team_name, player1_id, player2_id, division) VALUES ${values}`,
      params
    );
    const firstId = result.insertId;
    /** @type {{ teamId: number, tier: number }[]} */
    const tierAssignments = pyramidPlayers.map((row, i) => ({
      teamId: firstId + i,
      tier: row.tier,
    }));

    await db.execute(
      `UPDATE teams t
       SET team_name = p.name
       FROM players p
       WHERE p.id = t.player1_id
         AND t.division = ?
         AND t.player2_id IS NULL`,
      [division]
    );

    const derivedConfig = deriveTierPyramidConfigFromAssignments(tierAssignments);
    const formatConfig = normalizeTierPyramidConfig(
      formatConfigOverride ?? derivedConfig ?? settings.format_config ?? getDefaultTierPyramidConfig()
    );
    tierState = await assignTiers(db, division, tierAssignments, formatConfig);
  } catch (error) {
    tierAssignError = error.message;
  }

  return {
    synced: true,
    division,
    teamsCreated: pyramidPlayers.length,
    tiersAssigned: tierState?.isComplete ?? false,
    tierErrors: tierState?.errors ?? (tierAssignError ? [tierAssignError] : []),
    tierState,
  };
}

/**
 * Configure division for tier pyramid (settings only — teams come from Teams page or sync).
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 */
export async function bootstrapPyramidDivisionSettings(db, division) {
  const pyramidPlayers = await getPyramidPlayersFromDb(db, division);
  if (pyramidPlayers.length === 0) {
    return null;
  }

  const formatConfig = getDefaultTierPyramidConfig();
  await setCompetitionFormat(db, division, 'singles');
  await setTournamentFormat(db, division, 'tier-pyramid', formatConfig);

  return {
    division,
    pyramidPlayerCount: pyramidPlayers.length,
    settingsConfigured: true,
  };
}

/**
 * Configure division for tier pyramid and sync teams from player pyramid_tier values.
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 */
export async function bootstrapPyramidDivisionFromPlayers(db, division) {
  const settingsResult = await bootstrapPyramidDivisionSettings(db, division);
  if (!settingsResult) {
    return null;
  }

  const formatConfig = getDefaultTierPyramidConfig();
  return syncPyramidTeamsFromPlayers(db, division, { formatConfig });
}

/**
 * Bootstrap every division that has pyramid-tier players after seeding (settings only).
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 */
export async function bootstrapPyramidTracksFromPlayers(db) {
  const [rows] = await db.execute(
    `SELECT DISTINCT category AS division
     FROM players
     WHERE is_active = TRUE AND pyramid_tier IS NOT NULL`
  );

  const results = [];
  for (const { division } of rows) {
    const result = await bootstrapPyramidDivisionSettings(db, division);
    if (result) results.push(result);
  }
  return results;
}

/**
 * @deprecated Use bootstrapPyramidDivisionSettings for player-only seeding.
 */
export async function bootstrapPyramidTracksFromSeedRoster(db) {
  return bootstrapPyramidTracksFromPlayers(db);
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function divisionHasPyramidMatches(db, division) {
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS match_count FROM matches WHERE division = ?',
    [division]
  );
  return Number(rows[0]?.match_count ?? 0) > 0;
}


/**
 * Whether tier sync should run when loading tier assignments.
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {{ teams: object[], tierAssignments: object[], isComplete: boolean }} state
 */
export async function shouldAutoSyncPyramidTeams(db, division, state) {
  if (state.isComplete) return false;
  if (await divisionHasPyramidMatches(db, division)) return false;

  const settings = await getDivisionSettings(db, division);
  if (settings.tournament_format !== 'tier-pyramid') return false;

  const pyramidPlayers = await getPyramidPlayersFromDb(db, division);
  if (pyramidPlayers.length === 0 && state.teams.length === 0) return false;

  return state.teams.length === 0 || state.teams.some((t) => t.tier == null);
}
