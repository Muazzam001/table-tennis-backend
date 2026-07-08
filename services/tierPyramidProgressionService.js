import { normalizeTierPyramidConfig, PYRAMID_SEMIFINAL_TEAM_COUNT } from '@shared/tournament/formats/tierPyramid/config.js';
import {
  isPyramidStageComplete,
  isS1Complete,
  isLevel1BComplete,
  hasRoundType,
  hasAdvancementWithPrefix,
  computeS1Advancement,
  computeS2Advancement,
  computeLevel1BAdvancement,
  computeLevel1BRound1Advancement,
  buildLevel1BRound2Fixtures,
  isLevel1BRound1Complete,
  needsLevel1BRound2,
  getLevel1BRoundCount,
  computeBracketStageAdvancement,
  buildLevel1BFixtures,
  buildLevel2Fixtures,
  buildLevel3FirstRoundPlan,
  buildLevel3SemiFinalFixtures,
  buildFinalFixture,
  tryBuildThirdPlaceFixture,
} from '@shared/tournament/formats/tierPyramid/advancement.js';
import { isTierPyramidFormat } from '@shared/tournament/formats/registry.js';
import {
  buildPyramidKnockoutSlotPlanFromDivision,
  resolvePyramidMatchSchedule,
} from '@shared/tournament/formats/tierPyramid/scheduling.js';
import { getLevel3QuarterFinalMatches, getPyramidSemiFinalMatches } from '@shared/tournament/formats/tierPyramid/roundFilters.js';
import { getDivisionMatches } from './tournamentService.js';
import { getDivisionSettings } from './divisionSettingsService.js';
import { ensureTierPyramidSchema } from './tierPyramidSchemaService.js';

const TEAM_SELECT = `
  SELECT id, team_name, division, tier, pyramid_stage, pyramid_status, advancement_source
  FROM teams
`;

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 */
async function getTeamsWithTier(db, division) {
  const [teams] = await db.execute(`${TEAM_SELECT} WHERE division = ? ORDER BY id`, [division]);
  return teams;
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 * @param {'waiting' | 'ready' | 'active' | 'complete'} status
 */
async function setLevel1bStatus(db, division, status) {
  await db.execute(
    `UPDATE division_settings SET level1b_status = ? WHERE division = ?`,
    [status, division]
  );
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 * @param {object[]} teams
 * @param {object[]} matches
 */
async function insertLevel1BMatches(db, division, teams, matches) {
  const l1bEntrants = teams.filter(
    (t) => t.pyramid_stage === 'L1B' && t.advancement_source?.startsWith('S1-')
  );
  const fixtures = buildLevel1BFixtures(l1bEntrants);
  const created = await insertPyramidMatches(db, fixtures, division, matches);
  for (const entrant of l1bEntrants) {
    await db.execute(
      `UPDATE teams SET pyramid_status = 'active' WHERE id = ? AND division = ?`,
      [entrant.id, division]
    );
  }
  return created;
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 * @param {object[]} updates
 * @param {'auto' | 'manual_override' | 'withdrawal' | 'regeneration'} reason
 * @param {number|null} [triggeredByMatchId]
 * @param {number|null} [adminUserId]
 * @param {string|null} [notes]
 */
async function applyAdvancementUpdates(
  db,
  division,
  updates,
  reason,
  triggeredByMatchId = null,
  adminUserId = null,
  notes = null
) {
  if (updates.length === 0) return;

  // Batch-fetch current state for all teams
  const teamIds = updates.map(u => u.teamId);
  const [rows] = await db.execute(
    `SELECT id, pyramid_stage, pyramid_status FROM teams WHERE id IN (${teamIds.map(() => '?').join(',')}) AND division = ?`,
    [...teamIds, division]
  );
  const teamStateMap = new Map(rows.map(r => [r.id, r]));

  const validUpdates = updates.filter(u => teamStateMap.has(u.teamId));
  if (validUpdates.length === 0) return;

  // Bulk UPDATE using CASE
  const stageClauses = validUpdates.map(() => 'WHEN id = ? THEN ?').join(' ');
  const statusClauses = validUpdates.map(() => 'WHEN id = ? THEN ?').join(' ');
  const sourceClauses = validUpdates.map(() => 'WHEN id = ? THEN ?').join(' ');
  const updateParams = [
    ...validUpdates.flatMap(u => [u.teamId, u.toStage]),
    ...validUpdates.flatMap(u => [u.teamId, u.toStatus]),
    ...validUpdates.flatMap(u => [u.teamId, u.source]),
    division,
  ];
  await db.execute(
    `UPDATE teams
     SET pyramid_stage   = CASE ${stageClauses} END,
         pyramid_status  = CASE ${statusClauses} END,
         advancement_source = CASE ${sourceClauses} END
     WHERE id IN (${teamIds.join(',')}) AND division = ?`,
    updateParams
  );

  // Bulk INSERT progression log
  const logValues = validUpdates.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
  const logParams = validUpdates.flatMap(u => {
    const state = teamStateMap.get(u.teamId);
    return [
      division,
      u.teamId,
      state.pyramid_stage || u.fromStage,
      u.toStage,
      state.pyramid_status || u.fromStatus,
      u.toStatus,
      reason,
      triggeredByMatchId,
      adminUserId,
      notes,
    ];
  });
  await db.execute(
    `INSERT INTO tournament_progression_log (
      division, team_id, from_stage, to_stage, from_status, to_status,
      reason, triggered_by_match_id, admin_user_id, notes
    ) VALUES ${logValues}`,
    logParams
  );
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {object[]} matchDefs
 * @param {string} division
 * @param {object[]} [existingMatches]
 */
async function insertPyramidMatches(db, matchDefs, division, existingMatches = []) {
  const slotPlan = buildPyramidKnockoutSlotPlanFromDivision(existingMatches);
  const created = [];
  const schedulingContext = [...existingMatches];

  for (const def of matchDefs) {
    const team1Id = def.team1_id ?? def.team1?.id;
    const team2Id = def.team2_id ?? def.team2?.id;
    const normalizedTeam1Id = team1Id < team2Id ? team1Id : team2Id;
    const normalizedTeam2Id = team1Id < team2Id ? team2Id : team1Id;
    const slot = resolvePyramidMatchSchedule(def, schedulingContext, slotPlan);

    const [result] = await db.execute(
      `INSERT INTO matches (
        team1_id, team2_id, scheduled_date, venue, round_type, pool, division, pyramid_stage, stage_sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedTeam1Id,
        normalizedTeam2Id,
        slot.scheduled_date,
        slot.venue,
        def.round_type,
        def.pool ?? null,
        division,
        def.pyramid_stage ?? null,
        def.stage_sequence ?? null,
      ]
    );

    const createdMatch = {
      id: result.insertId,
      team1_id: normalizedTeam1Id,
      team2_id: normalizedTeam2Id,
      round_type: def.round_type,
      pyramid_stage: def.pyramid_stage,
      stage_sequence: def.stage_sequence,
      scheduled_date: slot.scheduled_date,
      venue: slot.venue,
      label: def.label,
    };
    created.push(createdMatch);
    schedulingContext.push(createdMatch);
  }

  return created;
}

/**
 * Create Third Place for tier pyramid when Final exists and semi-finals are complete.
 * Returns { created: false } when prerequisites are missing — never throws.
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 * @param {object[]} [matches]
 */
export async function ensurePyramidThirdPlaceMatch(db, division, matches = null) {
  const allMatches = matches ?? (await getDivisionMatches(db, division));
  if (!hasRoundType(allMatches, 'Final')) return { created: false };
  if (hasRoundType(allMatches, 'Third Place')) return { created: false };

  const thirdFixture = tryBuildThirdPlaceFixture(allMatches);
  if (!thirdFixture) return { created: false };

  const created = await insertPyramidMatches(db, [thirdFixture], division, allMatches);
  return { created: true, matches: created };
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {number|null} [triggeredByMatchId]
 */
export async function tryAutoProgressTierPyramid(db, division, triggeredByMatchId = null) {
  await ensureTierPyramidSchema(db);
  const settings = await getDivisionSettings(db, division);
  if (!isTierPyramidFormat(settings.tournament_format)) {
    return { progressed: false };
  }

  const config = normalizeTierPyramidConfig(settings.format_config ?? {});
  let matches = await getDivisionMatches(db, division);
  let teams = await getTeamsWithTier(db, division);
  /** @type {string[]} */
  const actions = [];

  if (isPyramidStageComplete(matches, 'S1') && !hasAdvancementWithPrefix(teams, 'S1-')) {
    const { winners, eliminated } = computeS1Advancement(matches, teams, config);
    await applyAdvancementUpdates(db, division, [...winners, ...eliminated], 'auto', triggeredByMatchId);
    actions.push('S1 advancement applied');
    teams = await getTeamsWithTier(db, division);
    await setLevel1bStatus(db, division, 'ready');
  }

  matches = await getDivisionMatches(db, division);
  const level1bStatus = settings.level1b_status ?? 'waiting';

  if (
    level1bStatus === 'ready' &&
    config.auto_advance &&
    !hasRoundType(matches, 'Level 1B') &&
    hasAdvancementWithPrefix(teams, 'S1-')
  ) {
    const created = await insertLevel1BMatches(db, division, teams, matches);
    await setLevel1bStatus(db, division, 'active');
    actions.push(`Level 1B auto-activated (${created.length} matches)`);
    matches = await getDivisionMatches(db, division);
  }

  if (isPyramidStageComplete(matches, 'S2') && !hasAdvancementWithPrefix(teams, 'S2-')) {
    const tier1Teams = teams.filter((t) => t.tier === 1);
    const { toL3, toL2 } = computeS2Advancement(matches, tier1Teams, config);
    await applyAdvancementUpdates(db, division, [...toL3, ...toL2], 'auto', triggeredByMatchId);
    actions.push('S2 advancement applied');
    teams = await getTeamsWithTier(db, division);
  }

  matches = await getDivisionMatches(db, division);

  // Level 1B Round 1 complete → eliminate Round 1 losers and generate Round 2.
  if (
    isLevel1BRound1Complete(matches) &&
    needsLevel1BRound2(matches, config) &&
    getLevel1BRoundCount(matches) < 2 &&
    !hasAdvancementWithPrefix(teams, 'L1B-adv-')
  ) {
    const { winners, eliminated } = computeLevel1BRound1Advancement(matches, teams);
    await applyAdvancementUpdates(
      db,
      division,
      [...winners, ...eliminated],
      'auto',
      triggeredByMatchId
    );
    teams = await getTeamsWithTier(db, division);
    const r2Fixtures = buildLevel1BRound2Fixtures(matches, teams);
    const created = await insertPyramidMatches(db, r2Fixtures, division, matches);
    for (const fixture of r2Fixtures) {
      await db.execute(
        `UPDATE teams SET pyramid_status = 'active' WHERE id IN (?, ?) AND division = ?`,
        [fixture.team1_id, fixture.team2_id, division]
      );
    }
    actions.push(`Level 1B Round 2 generated (${created.length} matches)`);
    matches = await getDivisionMatches(db, division);
  }

  // Level 1B final round complete → advance winners to Level 2.
  if (
    isLevel1BComplete(matches, config.l1bAdvanceCount) &&
    !hasAdvancementWithPrefix(teams, 'L1B-adv-')
  ) {
    const { winners, eliminated } = computeLevel1BAdvancement(matches, teams, config);
    if (winners.length > 0) {
      await applyAdvancementUpdates(
        db,
        division,
        [...winners, ...eliminated],
        'auto',
        triggeredByMatchId
      );
      await setLevel1bStatus(db, division, 'complete');
      actions.push('Level 1B advancement applied');
      teams = await getTeamsWithTier(db, division);
    }
  }

  matches = await getDivisionMatches(db, division);

  if (
    isLevel1BComplete(matches, config.l1bAdvanceCount) &&
    hasAdvancementWithPrefix(teams, 'L1B-adv-') &&
    isPyramidStageComplete(matches, 'S2') &&
    hasAdvancementWithPrefix(teams, 'S2-') &&
    !hasRoundType(matches, 'Level 2')
  ) {
    const l2Entrants = teams.filter(
      (t) => t.pyramid_stage === 'L2' && t.pyramid_status !== 'eliminated'
    );
    if (l2Entrants.length === config.l2AdvanceCount + config.s2DropCount) {
      const fixtures = buildLevel2Fixtures(l2Entrants, matches);
      const created = await insertPyramidMatches(db, fixtures, division, matches);
      for (const entrant of l2Entrants) {
        await db.execute(
          `UPDATE teams SET pyramid_status = 'active' WHERE id = ? AND division = ?`,
          [entrant.id, division]
        );
      }
      actions.push(`Level 2 generated (${created.length} matches)`);
      matches = await getDivisionMatches(db, division);
    }
  }

  if (
    isPyramidStageComplete(matches, 'Level 2') &&
    !hasAdvancementWithPrefix(teams, 'L2-win')
  ) {
    const { winners, eliminated } = computeBracketStageAdvancement(matches, 'Level 2', config);
    if (winners.length > 0) {
      await applyAdvancementUpdates(
        db,
        division,
        [...winners, ...eliminated],
        'auto',
        triggeredByMatchId
      );
      actions.push('Level 2 advancement applied');
      teams = await getTeamsWithTier(db, division);
    }
  }

  matches = await getDivisionMatches(db, division);

  const l3Entrants = teams.filter(
    (t) => t.pyramid_stage === 'L3' && t.pyramid_status !== 'eliminated'
  );
  const expectedL3 = config.s2AdvanceCount + config.l2AdvanceCount;
  const existingQf = getLevel3QuarterFinalMatches(matches);
  if (
    existingQf.length === 0 &&
    l3Entrants.length === expectedL3 &&
    isPyramidStageComplete(matches, 'Level 2')
  ) {
    const { fixtures, byeEntrants } = buildLevel3FirstRoundPlan(l3Entrants, matches);
    if (byeEntrants.length > 0) {
      const byeUpdates = byeEntrants.map((entrant, index) => ({
        teamId: entrant.id,
        fromStage: 'L3',
        toStage: 'L3',
        fromStatus: 'active',
        toStatus: 'advanced',
        source: `L3-bye-${index + 1}`,
      }));
      await applyAdvancementUpdates(db, division, byeUpdates, 'auto', triggeredByMatchId);
      teams = await getTeamsWithTier(db, division);
      actions.push(`Level 3 byes applied (${byeEntrants.length})`);
    }

    if (fixtures.length > 0) {
      const created = await insertPyramidMatches(db, fixtures, division);
      for (const entrant of l3Entrants) {
        await db.execute(
          `UPDATE teams SET pyramid_status = 'active' WHERE id = ? AND division = ?`,
          [entrant.id, division]
        );
      }
      actions.push(`Level 3 quarter-finals generated (${created.length} matches)`);
      matches = await getDivisionMatches(db, division);
    } else if (byeEntrants.length > 0) {
      actions.push('Level 3 first round is bye-only');
    }
  }

  const l3Qf = getLevel3QuarterFinalMatches(matches).sort(
    (a, b) => (a.stage_sequence ?? 0) - (b.stage_sequence ?? 0)
  );
  const l3Sf = getPyramidSemiFinalMatches(matches);
  const byeSfEntrants = teams.filter((t) => t.advancement_source?.startsWith('L3-bye'));
  const qfComplete =
    l3Qf.length === 0 || l3Qf.every((m) => m.status === 'Completed' && m.winner_team_id);
  const qfWinnerCount = l3Qf.filter((m) => m.status === 'Completed' && m.winner_team_id).length;
  const semifinalTeamCount = byeSfEntrants.length + qfWinnerCount;

  if (
    qfComplete &&
    l3Sf.length === 0 &&
    semifinalTeamCount === PYRAMID_SEMIFINAL_TEAM_COUNT
  ) {
    const sfFixtures = buildLevel3SemiFinalFixtures(matches, byeSfEntrants);
    const created = await insertPyramidMatches(db, sfFixtures, division, matches);
    actions.push(`Semi-finals generated (${created.length} matches)`);
    matches = await getDivisionMatches(db, division);
  }

  const refreshedSf = getPyramidSemiFinalMatches(matches);
  if (
    refreshedSf.length === 2 &&
    refreshedSf.every((m) => m.status === 'Completed' && m.winner_team_id) &&
    !teams.some((t) => t.advancement_source === 'L3-SF')
  ) {
    const { winners, eliminated } = computeBracketStageAdvancement(matches, 'Level 3', config);
    if (winners.length > 0) {
      await applyAdvancementUpdates(
        db,
        division,
        [...winners, ...eliminated],
        'auto',
        triggeredByMatchId
      );
      actions.push('Level 3 advancement applied');
      teams = await getTeamsWithTier(db, division);
    }
  }

  matches = await getDivisionMatches(db, division);

  if (!hasRoundType(matches, 'Final')) {
    const finalists = teams.filter((t) => t.pyramid_stage === 'final');
    if (finalists.length === 2) {
      const sfMatches = getPyramidSemiFinalMatches(matches);
      const finalFixture = buildFinalFixture(sfMatches);
      await insertPyramidMatches(db, [finalFixture], division, matches);
      actions.push('Final match generated');
      matches = await getDivisionMatches(db, division);
    }
  }

  if (hasRoundType(matches, 'Final') && !hasRoundType(matches, 'Third Place')) {
    try {
      const thirdPlace = await ensurePyramidThirdPlaceMatch(db, division, matches);
      if (thirdPlace.created) {
        actions.push('Third Place match generated');
        matches = await getDivisionMatches(db, division);
      }
    } catch (thirdPlaceError) {
      console.error('Third place auto-creation skipped:', thirdPlaceError.message);
    }
  }

  const finalMatch = matches.find((m) => m.round_type === 'Final');
  if (
    finalMatch?.status === 'Completed' &&
    finalMatch.winner_team_id &&
    !teams.some((t) => t.pyramid_stage === 'champion')
  ) {
    const championId = finalMatch.winner_team_id;
    const runnerUpId =
      finalMatch.winner_team_id === finalMatch.team1_id
        ? finalMatch.team2_id
        : finalMatch.team1_id;

    await applyAdvancementUpdates(
      db,
      division,
      [
        {
          teamId: championId,
          fromStage: 'final',
          toStage: 'champion',
          fromStatus: 'active',
          toStatus: 'advanced',
          source: 'Final-win',
        },
        {
          teamId: runnerUpId,
          fromStage: 'final',
          toStage: 'eliminated',
          fromStatus: 'active',
          toStatus: 'eliminated',
          source: null,
        },
      ],
      'auto',
      triggeredByMatchId
    );
    actions.push('Tournament champion decided');
  }

  return {
    progressed: actions.length > 0,
    actions,
  };
}

const VALID_PYRAMID_STAGES = [
  'registered',
  'S1',
  'S2',
  'L1B',
  'L2',
  'L3',
  'final',
  'champion',
  'eliminated',
];
const VALID_PYRAMID_STATUSES = ['active', 'advanced', 'eliminated', 'withdrawn'];
const REGENERATE_FROM_STAGES = ['Level 1', 'S1', 'S2', 'Level 1B', 'Level 2', 'Level 3', 'Final'];

/**
 * Activate Level 1B — generate cross-group matches after S1 completes.
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function activateLevel1B(db, division) {
  await ensureTierPyramidSchema(db);
  const settings = await getDivisionSettings(db, division);
  if (!isTierPyramidFormat(settings.tournament_format)) {
    throw Object.assign(new Error('Division is not using the tier-pyramid format.'), {
      statusCode: 400,
    });
  }

  const status = settings.level1b_status ?? 'waiting';
  if (status !== 'ready') {
    throw Object.assign(
      new Error(`Level 1B cannot be activated (current status: ${status}). Complete Level 1A first.`),
      { statusCode: 400 }
    );
  }

  const matches = await getDivisionMatches(db, division);
  if (!isS1Complete(matches)) {
    throw Object.assign(new Error('Level 1A (S1) is not complete.'), { statusCode: 400 });
  }
  if (hasRoundType(matches, 'Level 1B')) {
    throw Object.assign(new Error('Level 1B matches already exist.'), { statusCode: 400 });
  }

  let teams = await getTeamsWithTier(db, division);
  if (!hasAdvancementWithPrefix(teams, 'S1-')) {
    const config = normalizeTierPyramidConfig(settings.format_config ?? {});
    const { winners, eliminated } = computeS1Advancement(matches, teams, config);
    await applyAdvancementUpdates(db, division, [...winners, ...eliminated], 'auto');
    teams = await getTeamsWithTier(db, division);
  }

  const created = await insertLevel1BMatches(db, division, teams, matches);
  await setLevel1bStatus(db, division, 'active');

  return { matchesCreated: created.length, matches: created };
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {number} [limit]
 */
export async function getPyramidProgressionLog(db, division, limit = 100) {
  await ensureTierPyramidSchema(db);
  const safeLimit = Math.min(Math.max(1, limit), 500);
  const [rows] = await db.execute(
    `SELECT l.id, l.division, l.team_id, l.from_stage, l.to_stage, l.from_status, l.to_status,
            l.reason, l.triggered_by_match_id, l.admin_user_id, l.notes, l.created_at,
            t.team_name
     FROM tournament_progression_log l
     INNER JOIN teams t ON t.id = l.team_id
     WHERE l.division = ?
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT ${safeLimit}`,
    [division]
  );
  return rows;
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {{ teamId: number, toStage: string, toStatus: string, source?: string | null }[]} updates
 * @param {number|null} adminUserId
 * @param {string|null} [notes]
 */
export async function overridePyramidAdvancement(db, division, updates, adminUserId, notes = null) {
  await ensureTierPyramidSchema(db);
  const settings = await getDivisionSettings(db, division);
  if (!isTierPyramidFormat(settings.tournament_format)) {
    throw Object.assign(new Error('Division is not using the tier-pyramid format.'), {
      statusCode: 400,
    });
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    throw Object.assign(new Error('At least one advancement update is required.'), { statusCode: 400 });
  }

  const normalized = [];
  for (const raw of updates) {
    const teamId = raw.teamId ?? raw.team_id;
    const { toStage, toStatus, source = null } = raw;
    if (!teamId || !toStage || !toStatus) {
      throw Object.assign(new Error('Each update requires teamId, toStage, and toStatus.'), {
        statusCode: 400,
      });
    }
    if (!VALID_PYRAMID_STAGES.includes(toStage)) {
      throw Object.assign(new Error(`Invalid pyramid stage: ${toStage}`), { statusCode: 400 });
    }
    if (!VALID_PYRAMID_STATUSES.includes(toStatus)) {
      throw Object.assign(new Error(`Invalid pyramid status: ${toStatus}`), { statusCode: 400 });
    }

    const [rows] = await db.execute('SELECT id FROM teams WHERE id = ? AND division = ?', [
      teamId,
      division,
    ]);
    if (!rows.length) {
      throw Object.assign(new Error(`Team ${teamId} is not in ${division} division.`), {
        statusCode: 400,
      });
    }

    normalized.push({ teamId, toStage, toStatus, source: source ?? null });
  }

  await applyAdvancementUpdates(
    db,
    division,
    normalized.map((u) => ({
      teamId: u.teamId,
      fromStage: '',
      toStage: u.toStage,
      fromStatus: '',
      toStatus: u.toStatus,
      source: u.source,
    })),
    'manual_override',
    null,
    adminUserId,
    notes
  );

  return { updated: normalized.length };
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {string} division
 * @param {string[]} roundTypes
 */
async function deleteMatchesByRoundTypes(db, division, roundTypes) {
  if (!roundTypes.length) return 0;
  const placeholders = roundTypes.map(() => '?').join(', ');
  const [result] = await db.execute(
    `DELETE FROM matches WHERE division = ? AND round_type IN (${placeholders})`,
    [division, ...roundTypes]
  );
  return result.affectedRows;
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
async function resetToPostLevel1Schedule(db, division) {
  await deleteMatchesByRoundTypes(db, division, [
    'Level 1B',
    'Level 2',
    'Level 3',
    'Semi Final',
    'Third Place',
    'Final',
  ]);
  await db.execute(
    `UPDATE teams
     SET pyramid_stage = CASE WHEN tier = 1 THEN 'S2' ELSE 'S1' END,
         pyramid_status = 'active',
         advancement_source = NULL
     WHERE division = ? AND tier IS NOT NULL`,
    [division]
  );
  await setLevel1bStatus(db, division, 'waiting');
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
async function getLevel2ParticipantIds(db, division) {
  const [rows] = await db.execute(
    `SELECT team1_id, team2_id FROM matches WHERE division = ? AND round_type = 'Level 2'`,
    [division]
  );
  const ids = new Set();
  for (const row of rows) {
    ids.add(row.team1_id);
    ids.add(row.team2_id);
  }
  return ids;
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {object} config
 */
async function resetFromLevel2(db, division, config) {
  const l2ParticipantIds = await getLevel2ParticipantIds(db, division);
  await deleteMatchesByRoundTypes(db, division, ['Level 3', 'Semi Final', 'Third Place', 'Final']);

  const matches = await getDivisionMatches(db, division);
  let teams = await getTeamsWithTier(db, division);

  if (isS1Complete(matches)) {
    const { winners, eliminated } = computeS1Advancement(matches, teams, config);
    await applyAdvancementUpdates(
      db,
      division,
      [...winners, ...eliminated],
      'regeneration',
      null,
      null,
      'Regenerated from Level 2'
    );
    teams = await getTeamsWithTier(db, division);
    await setLevel1bStatus(
      db,
      division,
      hasRoundType(matches, 'Level 1B') ? 'active' : 'ready'
    );
  }

  if (isLevel1BComplete(matches)) {
    const { winners, eliminated } = computeLevel1BAdvancement(matches, teams, config);
    await applyAdvancementUpdates(
      db,
      division,
      [...winners, ...eliminated],
      'regeneration',
      null,
      null,
      'Regenerated from Level 2'
    );
    teams = await getTeamsWithTier(db, division);
    await setLevel1bStatus(db, division, 'complete');
  }

  if (isPyramidStageComplete(matches, 'S2')) {
    const tier1Teams = teams.filter((t) => t.tier === 1);
    const { toL3, toL2 } = computeS2Advancement(matches, tier1Teams, config);
    await applyAdvancementUpdates(
      db,
      division,
      [...toL3, ...toL2],
      'regeneration',
      null,
      null,
      'Regenerated from Level 2'
    );
    teams = await getTeamsWithTier(db, division);
  }

  if (l2ParticipantIds.size > 0) {
    const idList = [...l2ParticipantIds];
    const placeholders = idList.map(() => '?').join(', ');
    await db.execute(
      `UPDATE teams
       SET pyramid_stage = 'L2',
           pyramid_status = 'active',
           advancement_source = CASE
             WHEN advancement_source LIKE 'L1B-adv-%' THEN advancement_source
             WHEN advancement_source LIKE 'S2-drop-%' THEN advancement_source
             ELSE NULL
           END
       WHERE division = ? AND id IN (${placeholders})`,
      [division, ...idList]
    );
  }
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
async function resetFromLevel3(db, division) {
  const settings = await getDivisionSettings(db, division);
  const config = normalizeTierPyramidConfig(settings.format_config ?? {});

  await deleteMatchesByRoundTypes(db, division, ['Level 3', 'Semi Final', 'Third Place', 'Final']);

  const matches = await getDivisionMatches(db, division);
  let teams = await getTeamsWithTier(db, division);

  if (isPyramidStageComplete(matches, 'S2')) {
    const tier1Teams = teams.filter((t) => t.tier === 1);
    const { toL3 } = computeS2Advancement(matches, tier1Teams, config);
    await applyAdvancementUpdates(
      db,
      division,
      toL3,
      'regeneration',
      null,
      null,
      'Regenerated from Level 3'
    );
    teams = await getTeamsWithTier(db, division);
  }

  if (isPyramidStageComplete(matches, 'Level 2')) {
    const { winners, eliminated } = computeBracketStageAdvancement(matches, 'Level 2', config);
    await applyAdvancementUpdates(
      db,
      division,
      [...winners, ...eliminated],
      'regeneration',
      null,
      null,
      'Regenerated from Level 3'
    );
  }

  await db.execute(
    `UPDATE teams
     SET pyramid_stage = 'L3',
         pyramid_status = 'advanced',
         advancement_source = CASE
           WHEN advancement_source LIKE 'S2-top-%' THEN advancement_source
           WHEN advancement_source = 'L2-win' THEN advancement_source
           ELSE advancement_source
         END
     WHERE division = ?
       AND (advancement_source LIKE 'S2-top-%' OR advancement_source = 'L2-win')`,
    [division]
  );

  await db.execute(
    `UPDATE teams
     SET pyramid_stage = 'eliminated', pyramid_status = 'eliminated', advancement_source = NULL
     WHERE division = ?
       AND (pyramid_stage IN ('final', 'champion')
            OR advancement_source IN ('L3-SF', 'Final-win'))`,
    [division]
  );
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
async function resetFromFinal(db, division) {
  const matches = await getDivisionMatches(db, division);
  const finalMatch = matches.find((m) => m.round_type === 'Final');

  if (finalMatch) {
    await db.execute(
      `UPDATE teams SET pyramid_stage = 'final', pyramid_status = 'active', advancement_source = 'L3-SF'
       WHERE division = ? AND id IN (?, ?)`,
      [division, finalMatch.team1_id, finalMatch.team2_id]
    );
  }

  await deleteMatchesByRoundTypes(db, division, ['Final', 'Third Place']);
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {string} fromStage
 * @param {number|null} [_adminUserId]
 */
export async function regeneratePyramidStage(db, division, fromStage, _adminUserId = null) {
  await ensureTierPyramidSchema(db);
  const settings = await getDivisionSettings(db, division);
  if (!isTierPyramidFormat(settings.tournament_format)) {
    throw Object.assign(new Error('Division is not using the tier-pyramid format.'), {
      statusCode: 400,
    });
  }

  if (!REGENERATE_FROM_STAGES.includes(fromStage)) {
    throw Object.assign(
      new Error(`fromStage must be one of: ${REGENERATE_FROM_STAGES.join(', ')}`),
      { statusCode: 400 }
    );
  }

  const config = normalizeTierPyramidConfig(settings.format_config ?? {});

  if (fromStage === 'Level 1' || fromStage === 'S1' || fromStage === 'S2') {
    await resetToPostLevel1Schedule(db, division);
  } else if (fromStage === 'Level 1B') {
    await deleteMatchesByRoundTypes(db, division, [
      'Level 1B',
      'Level 2',
      'Level 3',
      'Semi Final',
      'Third Place',
      'Final',
    ]);
    const matches = await getDivisionMatches(db, division);
    let teams = await getTeamsWithTier(db, division);
    if (isS1Complete(matches)) {
      const { winners, eliminated } = computeS1Advancement(matches, teams, config);
      await applyAdvancementUpdates(
        db,
        division,
        [...winners, ...eliminated],
        'regeneration',
        null,
        null,
        'Regenerated from Level 1B'
      );
    }
    await setLevel1bStatus(db, division, 'ready');
  } else if (fromStage === 'Level 2') {
    await resetFromLevel2(db, division, config);
  } else if (fromStage === 'Level 3') {
    await resetFromLevel3(db, division);
  } else if (fromStage === 'Final') {
    await resetFromFinal(db, division);
  }

  const progression = await tryAutoProgressTierPyramid(db, division);

  return {
    fromStage,
    progression,
  };
}
