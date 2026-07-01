import { normalizeTierPyramidConfig } from '@shared/tournament/formats/tierPyramid/config.js';
import {
  isPyramidStageComplete,
  isLevel1Complete,
  hasRoundType,
  hasAdvancementWithPrefix,
  computeS1Advancement,
  computeS2Advancement,
  computeBracketStageAdvancement,
  buildLevel2Fixtures,
  buildLevel3QuarterFinalFixtures,
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
  for (const update of updates) {
    const [rows] = await db.execute(
      'SELECT pyramid_stage, pyramid_status FROM teams WHERE id = ? AND division = ?',
      [update.teamId, division]
    );
    if (!rows.length) continue;

    const fromStage = rows[0].pyramid_stage || update.fromStage;
    const fromStatus = rows[0].pyramid_status || update.fromStatus;

    await db.execute(
      `UPDATE teams
       SET pyramid_stage = ?, pyramid_status = ?, advancement_source = ?
       WHERE id = ? AND division = ?`,
      [update.toStage, update.toStatus, update.source, update.teamId, division]
    );

    await db.execute(
      `INSERT INTO tournament_progression_log (
        division, team_id, from_stage, to_stage, from_status, to_status,
        reason, triggered_by_match_id, admin_user_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        division,
        update.teamId,
        fromStage,
        update.toStage,
        fromStatus,
        update.toStatus,
        reason,
        triggeredByMatchId,
        adminUserId,
        notes,
      ]
    );
  }
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
  }

  if (isPyramidStageComplete(matches, 'S2') && !hasAdvancementWithPrefix(teams, 'S2-')) {
    const tier1Teams = teams.filter((t) => t.tier === 1);
    const { toL3, toL2 } = computeS2Advancement(matches, tier1Teams, config);
    await applyAdvancementUpdates(db, division, [...toL3, ...toL2], 'auto', triggeredByMatchId);
    actions.push('S2 advancement applied');
    teams = await getTeamsWithTier(db, division);
  }

  matches = await getDivisionMatches(db, division);

  if (isLevel1Complete(matches) && !hasRoundType(matches, 'Level 2')) {
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
    const fixtures = buildLevel3QuarterFinalFixtures(l3Entrants, matches);
    const created = await insertPyramidMatches(db, fixtures, division);
    for (const entrant of l3Entrants) {
      await db.execute(
        `UPDATE teams SET pyramid_status = 'active' WHERE id = ? AND division = ?`,
        [entrant.id, division]
      );
    }
    actions.push(`Level 3 quarter-finals generated (${created.length} matches)`);
    matches = await getDivisionMatches(db, division);
  }

  const l3Qf = getLevel3QuarterFinalMatches(matches).sort(
    (a, b) => (a.stage_sequence ?? 0) - (b.stage_sequence ?? 0)
  );
  const l3Sf = getPyramidSemiFinalMatches(matches);

  if (
    l3Qf.length === 4 &&
    l3Qf.every((m) => m.status === 'Completed' && m.winner_team_id) &&
    l3Sf.length === 0
  ) {
    const sfFixtures = buildLevel3SemiFinalFixtures(l3Qf);
    const created = await insertPyramidMatches(db, sfFixtures, division, matches);
    actions.push(`Semi-finals generated (${created.length} matches)`);
    matches = await getDivisionMatches(db, division);
  }

  const refreshedSf = getPyramidSemiFinalMatches(matches);
  if (
    refreshedSf.length >= 2 &&
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
  'L2',
  'L3',
  'final',
  'champion',
  'eliminated',
];
const VALID_PYRAMID_STATUSES = ['active', 'advanced', 'eliminated', 'withdrawn'];
const REGENERATE_FROM_STAGES = ['Level 1', 'S1', 'S2', 'Level 2', 'Level 3', 'Final'];

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
  await deleteMatchesByRoundTypes(db, division, ['Level 2', 'Level 3', 'Semi Final', 'Third Place', 'Final']);
  await db.execute(
    `UPDATE teams
     SET pyramid_stage = CASE WHEN tier = 1 THEN 'S2' ELSE 'S1' END,
         pyramid_status = 'active',
         advancement_source = NULL
     WHERE division = ? AND tier IS NOT NULL`,
    [division]
  );
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

  if (isPyramidStageComplete(matches, 'S1')) {
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
  }

  if (l2ParticipantIds.size > 0) {
    const idList = [...l2ParticipantIds];
    const placeholders = idList.map(() => '?').join(', ');
    await db.execute(
      `UPDATE teams
       SET pyramid_stage = 'L2',
           pyramid_status = 'active',
           advancement_source = CASE
             WHEN advancement_source LIKE 'S1-%' THEN advancement_source
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
