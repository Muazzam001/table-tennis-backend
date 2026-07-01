import { generateTestMatchResult } from '@shared/tournament/generateTestMatchResult.js';
import { isTierPyramidFormat } from '@shared/tournament/formats/registry.js';
import { filterMatchesForPyramidRound } from '@shared/tournament/formats/tierPyramid/roundFilters.js';
import { getDivisionSettings } from './divisionSettingsService.js';
import { getDivisionMatches } from './tournamentService.js';
import { tryAutoProgressKnockout } from './matchProgressionService.js';
import { tryAutoProgressTierPyramid } from './tierPyramidProgressionService.js';

const GROUP_ROUND_ORDER = ['Qualifying', 'Quarter Final', 'Semi Final', 'Third Place', 'Final'];
const PYRAMID_ROUND_ORDER = ['S1', 'S2', 'Level 2', 'Level 3', 'Semi Final', 'Third Place', 'Final'];

/**
 * @param {{ round_type: string, stage_sequence?: number | null, id: number }} match
 * @param {boolean} isPyramid
 */
function roundSortKey(match, isPyramid) {
  const order = isPyramid ? PYRAMID_ROUND_ORDER : GROUP_ROUND_ORDER;
  const idx = order.indexOf(match.round_type);
  return [idx === -1 ? 999 : idx, match.stage_sequence ?? 0, match.id];
}

/**
 * @param {{ round_type: string, stage_sequence?: number | null }} match
 * @param {string | null | undefined} roundFilter
 * @param {boolean} isPyramid
 */
function matchBelongsToRoundFilter(match, roundFilter, isPyramid) {
  if (!roundFilter) return true;
  if (isPyramid) {
    return filterMatchesForPyramidRound([match], roundFilter).length > 0;
  }
  if (roundFilter === 'Level 1') {
    return match.round_type === 'S1' || match.round_type === 'S2';
  }
  return match.round_type === roundFilter;
}

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {number} matchId
 * @param {ReturnType<typeof generateTestMatchResult>} result
 */
async function applyGeneratedResult(db, matchId, result) {
  await db.execute(
    `UPDATE matches
     SET score_team1 = ?, score_team2 = ?, set_game_scores = ?,
         game_point_format = ?, winner_team_id = ?, status = ?,
         is_abandoned = ?, abandoned_reason = ?
     WHERE id = ?`,
    [
      result.score_team1,
      result.score_team2,
      JSON.stringify(result.set_game_scores),
      result.game_point_format,
      result.winner_team_id,
      result.status,
      Boolean(result.is_abandoned),
      result.abandoned_reason,
      matchId,
    ]
  );
}

/**
 * Auto-fill pending match results for testing. Lower team ID wins each match.
 *
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 * @param {{ roundType?: string | null, fillAll?: boolean, setConfig?: object, gamePointsPerSet?: number }} [options]
 */
export async function autoFillMatchResults(db, division, options = {}) {
  const { roundType = null, fillAll = false, setConfig, gamePointsPerSet } = options;
  const settings = await getDivisionSettings(db, division);
  const isPyramid = isTierPyramidFormat(settings.tournament_format);
  const activeRoundFilter = fillAll ? null : roundType;

  const maxIterations = fillAll ? 200 : 1;
  let totalFilled = 0;
  /** @type {number[]} */
  const filledMatchIds = [];
  /** @type {string[]} */
  const progressionActions = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const matches = await getDivisionMatches(db, division);
    const pending = matches
      .filter(
        (match) =>
          match.status !== 'Completed' &&
          match.team1_id &&
          match.team2_id &&
          matchBelongsToRoundFilter(match, activeRoundFilter, isPyramid)
      )
      .sort((a, b) => {
        const [aRound, aStage, aId] = roundSortKey(a, isPyramid);
        const [bRound, bStage, bId] = roundSortKey(b, isPyramid);
        return aRound - bRound || aStage - bStage || aId - bId;
      });

    if (pending.length === 0) break;

    for (const match of pending) {
      const result = generateTestMatchResult(match, { setConfig, gamePointsPerSet });
      await applyGeneratedResult(db, match.id, result);

      if (isPyramid) {
        const progression = await tryAutoProgressTierPyramid(db, division, Number(match.id));
        if (progression.actions?.length) {
          progressionActions.push(...progression.actions);
        }
      } else {
        const progression = await tryAutoProgressKnockout(db, division);
        if (progression.progressed && progression.actions?.length) {
          progressionActions.push(...progression.actions);
        } else if (progression.progressed) {
          progressionActions.push('Knockout round progressed');
        }
      }

      filledMatchIds.push(match.id);
      totalFilled += 1;
    }
  }

  return {
    filled: totalFilled,
    matchIds: filledMatchIds,
    progressionActions: [...new Set(progressionActions)],
  };
}
