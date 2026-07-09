import {
  normalizeTierPyramidConfig,
  validateTierPyramidSetup,
  getTierPyramidSetupOptions,
  getTierPyramidSetupFromRoster,
  resolveTierPyramidConfigForAssignments,
  countTiersFromAssignments,
  buildTierPyramidLevel1Fixtures,
} from '@shared/tournament/formats/tierPyramid/index.js';
import { scheduleFixtures, validateDateRangeForMatches } from '@shared/tournament/scheduling.js';
import { scheduleRoundRobinGroups } from '@shared/tournament/roundRobinScheduling.js';
import { ensureTierPyramidSchema } from './tierPyramidSchemaService.js';
import { getDivisionSettings, setTournamentFormat } from './divisionSettingsService.js';
import { sqlCount, PG_ENUM } from '../utils/sql.js';
import {
  shouldAutoSyncPyramidTeams,
  ensurePyramidTiersSyncedFromPlayers,
} from './pyramidTeamSyncService.js';

const TEAM_SELECT_WITH_TIER = `
  SELECT t.id, t.team_name, t.division, t.tier, t.pyramid_stage, t.pyramid_status, t.advancement_source,
         p.pyramid_tier AS player_pyramid_tier
  FROM teams t
  LEFT JOIN players p ON p.id = t.player1_id AND t.player2_id IS NULL
`;

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
async function loadTierAssignmentState(db, division) {
  const [teams] = await db.execute(
    `${TEAM_SELECT_WITH_TIER} WHERE t.division = ? ORDER BY t.id`,
    [division]
  );
  const settings = await getDivisionSettings(db, division);
  const savedConfig = normalizeTierPyramidConfig(settings.format_config ?? {});
  const tierAssignments = teams
    .filter((t) => t.tier != null)
    .map((t) => ({ teamId: t.id, tier: t.tier }));

  const resolved =
    tierAssignments.length > 0
      ? resolveTierPyramidConfigForAssignments(tierAssignments, savedConfig)
      : { config: savedConfig, errors: [], isDerived: false, tierCounts: countTiersFromAssignments([]) };
  const config = resolved.config ?? savedConfig;

  const errors =
    teams.length > 0 && tierAssignments.length === teams.length
      ? resolved.errors.length > 0
        ? resolved.errors
        : validateTierPyramidSetup(teams.length, tierAssignments, config)
      : teams.length > 0
        ? ['Not all teams have tier assignments.']
        : [];

  return {
    division,
    teams,
    tierAssignments,
    config,
    tierCounts: resolved.tierCounts ?? countTiersFromAssignments(tierAssignments),
    tournament_format: settings.tournament_format,
    isComplete: tierAssignments.length === teams.length && errors.length === 0,
    isDerived: resolved.isDerived ?? false,
    errors,
  };
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {{ autoSync?: boolean }} [options]
 */
export async function getTierAssignments(db, division, options = {}) {
  const { autoSync = true } = options;
  await ensureTierPyramidSchema(db);

  let state = await loadTierAssignmentState(db, division);

  if (autoSync && (await shouldAutoSyncPyramidTeams(db, division, state))) {
    await ensurePyramidTiersSyncedFromPlayers(db, division);
    state = await loadTierAssignmentState(db, division);
  }

  return state;
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {{ teamId?: number, team_id?: number, tier: number }[]} assignments
 * @param {object} [formatConfig]
 */
export async function assignTiers(db, division, assignments, formatConfig = null) {
  await ensureTierPyramidSchema(db);

  const [teams] = await db.execute('SELECT id FROM teams WHERE division = ? ORDER BY id', [division]);
  const teamIds = new Set(teams.map((t) => t.id));

  const tierAssignments = assignments.map((a) => {
    const teamId = a.teamId ?? a.team_id;
    return { teamId, tier: a.tier };
  });

  const resolved = resolveTierPyramidConfigForAssignments(tierAssignments, formatConfig ?? {});
  if (!resolved.config) {
    throw Object.assign(new Error(resolved.errors.join(' ')), { statusCode: 400 });
  }
  const effectiveConfig = resolved.config;
  const errors = validateTierPyramidSetup(teams.length, tierAssignments, effectiveConfig);
  if (errors.length > 0) {
    throw Object.assign(new Error(errors.join(' ')), { statusCode: 400 });
  }

  for (const { teamId, tier } of tierAssignments) {
    if (!teamIds.has(teamId)) {
      throw Object.assign(new Error(`Team ${teamId} is not in ${division} division.`), {
        statusCode: 400,
      });
    }
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Batch UPDATE using CASE to avoid N queries
    if (tierAssignments.length > 0) {
      const whenClauses = tierAssignments.map(() => 'WHEN id = ? THEN ?').join(' ');
      const params = tierAssignments.flatMap(({ teamId, tier }) => [teamId, tier]);
      params.push(division);
      await connection.execute(
        `UPDATE teams
         SET tier = CASE ${whenClauses} END,
             pyramid_stage = 'registered',
             pyramid_status = 'active',
             advancement_source = NULL
         WHERE id IN (${tierAssignments.map(a => a.teamId).join(',')}) AND division = ?`,
        params
      );
    }

    await setTournamentFormat(connection, division, 'tier-pyramid', effectiveConfig);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getTierAssignments(db, division, { autoSync: false });
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {object} options
 */
export async function generateTierPyramidLevel1Schedule(db, options) {
  const {
    division,
    startDate,
    endDate,
    venue = 'Main Court',
    timeSlotConfig,
    courtConfig,
    replaceExisting = false,
    formatConfig = null,
    random,
  } = options;

  await ensureTierPyramidSchema(db);

  const tierState = await getTierAssignments(db, division);
  if (!tierState.isComplete) {
    throw Object.assign(
      new Error(tierState.errors.join(' ') || 'Tier assignments are incomplete.'),
      { statusCode: 400 }
    );
  }

  const config = normalizeTierPyramidConfig(formatConfig ?? tierState.config);

  const [existingRows] = await db.execute(
    `SELECT COUNT(*) AS count FROM matches
     WHERE division = ? AND round_type IN ('S1', 'S2')`,
    [division]
  );
  const existingCount = sqlCount(existingRows);

  if (existingCount > 0 && !replaceExisting) {
    throw Object.assign(
      new Error(
        `${existingCount} Level 1 match(es) already exist for ${division}. Regenerate with replaceExisting to replace them.`
      ),
      { statusCode: 400, data: { existingCount, teamCount: tierState.teams.length } }
    );
  }

  const participants = tierState.teams.map((t) => ({
    id: t.id,
    team_name: t.team_name,
    tier: t.tier,
  }));

  const level1 = buildTierPyramidLevel1Fixtures(participants, config, { random });
  const fixtures = level1.fixtures.map((f) => ({ ...f, division }));
  const expectedMatchCount = level1.matchCounts.level1Total;

  const rangeCheck = validateDateRangeForMatches(
    startDate,
    endDate,
    expectedMatchCount,
    timeSlotConfig,
    courtConfig
  );
  if (!rangeCheck.ok) {
    throw Object.assign(new Error(rangeCheck.message), {
      statusCode: 400,
      data: {
        slotsRequired: rangeCheck.slotsRequired,
        availableSlots: rangeCheck.availableSlots,
        suggestedEndDate: rangeCheck.suggestedEndDate,
        weekdaysNeeded: rangeCheck.weekdaysNeeded,
      },
    });
  }

  const { matches: scheduledMatches, availableSlots, incomplete, slotsRequired } =
    scheduleRoundRobinGroups(
      fixtures,
      startDate,
      venue,
      endDate,
      timeSlotConfig,
      courtConfig
    );

  if (incomplete || scheduledMatches.length < expectedMatchCount) {
    throw Object.assign(
      new Error(
        `Could only schedule ${scheduledMatches.length} of ${expectedMatchCount} Level 1 matches in the selected date range. Extend the end date or add more time slots/courts.`
      ),
      {
        statusCode: 400,
        data: {
          scheduledCount: scheduledMatches.length,
          expectedMatchCount,
          slotsRequired,
          availableSlots,
        },
      }
    );
  }

  const connection = await db.getConnection();
  const createdMatches = [];

  try {
    await connection.beginTransaction();

    if (existingCount > 0 && replaceExisting) {
      await connection.execute(
        `DELETE FROM matches WHERE division = ? AND round_type IN ('S1', 'S2', 'Level 1B')`,
        [division]
      );
      await connection.execute(
        `UPDATE teams SET pyramid_stage = 'registered', pyramid_status = 'active', advancement_source = NULL
         WHERE division = ? AND tier IS NOT NULL`,
        [division]
      );
      await connection.execute(
        `UPDATE division_settings SET level1b_status = 'waiting' WHERE division = ?`,
        [division]
      );
    }

    for (const match of scheduledMatches) {
      const { team1_id, team2_id, scheduled_date, round_type, pool: poolName, pyramid_stage } =
        match;
      if (team1_id === team2_id) continue;

      const normalizedTeam1Id = team1_id < team2_id ? team1_id : team2_id;
      const normalizedTeam2Id = team1_id < team2_id ? team2_id : team1_id;

      const [result] = await connection.execute(
        `INSERT INTO matches (
          team1_id, team2_id, scheduled_date, venue, round_type, pool, division, pyramid_stage, stage_sequence
        ) VALUES (?, ?, ?, ?, ?::${PG_ENUM.matchRoundType}, ?, ?, ?::${PG_ENUM.matchPyramidStage}, ?)`,
        [
          normalizedTeam1Id,
          normalizedTeam2Id,
          scheduled_date,
          match.venue || venue,
          round_type,
          poolName || null,
          division,
          pyramid_stage || null,
          match.stage_sequence ?? null,
        ]
      );

      createdMatches.push({
        id: result.insertId,
        team1_id: normalizedTeam1Id,
        team2_id: normalizedTeam2Id,
        scheduled_date,
        venue: match.venue || venue,
        round_type,
        pool: poolName || null,
        pyramid_stage: pyramid_stage || null,
        division,
      });
    }

    for (const team of participants) {
      const stage = team.tier === 1 ? 'S2' : 'S1';
      await connection.execute(
        `UPDATE teams SET pyramid_stage = ?::${PG_ENUM.pyramidTeamStage}, pyramid_status = 'active'::${PG_ENUM.pyramidTeamStatus} WHERE id = ? AND division = ?`,
        [stage, team.id, division]
      );
    }

    await setTournamentFormat(connection, division, 'tier-pyramid', config);
    await connection.execute(
      `UPDATE division_settings SET level1b_status = 'waiting' WHERE division = ?`,
      [division]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const groupSummary = Object.fromEntries(
    level1.s1Groups.map((g) => [
      g.id,
      g.teams.map((t) => ({
        id: t.id,
        name: t.team_name,
        tier: t.tier,
      })),
    ])
  );

  return {
    config: level1.config,
    format: 'tier-pyramid',
    s1Groups: groupSummary,
    s2Teams: level1.tierSummary.tier1.map((id) => {
      const team = participants.find((t) => t.id === id);
      return { id, name: team?.team_name };
    }),
    matches: createdMatches,
    matchCounts: level1.matchCounts,
    expectedMatchCount,
    availableSlots,
    teamsUsed: participants.length,
  };
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {object} [formatConfig]
 */
export async function getTierPyramidSetupForDivision(db, division, formatConfig = null) {
  await ensureTierPyramidSchema(db);
  const tierState = await loadTierAssignmentState(db, division);
  const settings = await getDivisionSettings(db, division);
  const savedConfig = normalizeTierPyramidConfig(formatConfig ?? settings.format_config ?? {});

  const tierCounts = { tier1: 0, tier2: 0, tier3: 0 };
  for (const team of tierState.teams) {
    const tier = team.tier ?? team.player_pyramid_tier;
    if (tier === 1) tierCounts.tier1 += 1;
    else if (tier === 2) tierCounts.tier2 += 1;
    else if (tier === 3) tierCounts.tier3 += 1;
  }

  const hasTierCounts = tierCounts.tier1 + tierCounts.tier2 + tierCounts.tier3 > 0;
  if (hasTierCounts) {
    return getTierPyramidSetupFromRoster(tierCounts, savedConfig);
  }

  const [teams] = await db.execute('SELECT COUNT(*) AS count FROM teams WHERE division = ?', [
    division,
  ]);
  return getTierPyramidSetupOptions(sqlCount(teams), savedConfig);
}

export { getTierPyramidSetupOptions };
