import pool from '../utils/database.js';
import { truncateTournamentTablesWithPool } from '../utils/tournamentDataReset.js';
import { getDefaultTierPyramidConfig } from '@shared/tournament/formats/tierPyramid/config.js';
import { TIER_PYRAMID_SEED_DIVISION } from '@shared/tournament/data/seedRoster.js';
import { upsertAllSeedPlayers, getPyramidPlayersFromDb } from './playerSeedService.js';
import { ensureTierPyramidSchema } from './tierPyramidSchemaService.js';
import {
  bootstrapPyramidDivisionFromPlayers,
  syncPyramidTeamsFromPlayers,
} from './pyramidTeamSyncService.js';

/**
 * @param {{ clearExisting?: boolean }} [options]
 */
export async function seedTierPyramidRoster(options = {}) {
  const { clearExisting = true } = options;
  await ensureTierPyramidSchema(pool);

  if (clearExisting) {
    await truncateTournamentTablesWithPool(pool, { includePlayers: true });
  } else {
    await pool.execute('DELETE FROM teams WHERE division = ?', [TIER_PYRAMID_SEED_DIVISION]);
  }

  const { playersCreated } = await upsertAllSeedPlayers(pool);
  const syncResult = await bootstrapPyramidDivisionFromPlayers(pool, TIER_PYRAMID_SEED_DIVISION);

  const formatConfig = getDefaultTierPyramidConfig();
  const pyramidPlayers = await getPyramidPlayersFromDb(pool, TIER_PYRAMID_SEED_DIVISION);

  const tierCounts = pyramidPlayers.reduce(
    (acc, row) => {
      acc[row.tier] = (acc[row.tier] || 0) + 1;
      return acc;
    },
    { 1: 0, 2: 0, 3: 0 }
  );

  const expectedTotal =
    formatConfig.tier1Count + formatConfig.tier2Count + formatConfig.tier3Count;
  const rosterTotal = pyramidPlayers.length;
  const missingTier3 = formatConfig.tier3Count - (tierCounts[3] || 0);

  return {
    division: TIER_PYRAMID_SEED_DIVISION,
    competitionFormat: 'singles',
    tournamentFormat: 'tier-pyramid',
    playersCreated,
    playersTotal: rosterTotal,
    teamsCreated: syncResult?.teamsCreated ?? 0,
    tierCounts,
    expectedTierCounts: {
      1: formatConfig.tier1Count,
      2: formatConfig.tier2Count,
      3: formatConfig.tier3Count,
    },
    rosterComplete: rosterTotal === expectedTotal,
    missingTier3Players: missingTier3 > 0 ? missingTier3 : 0,
    tiersAssigned: syncResult?.tiersAssigned ?? false,
    tierErrors: syncResult?.tierErrors ?? [],
    workflow: syncResult?.tiersAssigned
      ? [
          'Open Matches → Men → generate Tier Pyramid Level 1 schedule',
          'Enter results; L2/L3/Final auto-generate',
          'View bracket on Tournament page',
        ]
      : [
          `Add ${missingTier3} more Tier 3 player(s) on the Players page (need ${expectedTotal} total)`,
          'Set pyramid tier on each player (Players page)',
          'Teams and tier assignments sync automatically from player tiers',
          'Then generate Level 1 schedule',
        ],
  };
}

export { syncPyramidTeamsFromPlayers, bootstrapPyramidDivisionFromPlayers };
