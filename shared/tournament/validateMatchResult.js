import { getSetCountForRound } from './matchSetDefaults.js';
import { getSetScoreValidationMessage, normalizeGamePointsPerSet } from './gamePointRules.js';

/**
 * @param {number} score1
 * @param {number} score2
 * @param {number} totalSets
 * @param {number} setsNeededToWin
 * @param {Array<{ team1: number, team2: number }> | null | undefined} setGameScores
 * @param {11 | 21} gamePointFormat
 * @returns {string | null}
 */
function validateCompletedScores(score1, score2, totalSets, setsNeededToWin, setGameScores, gamePointFormat) {
  if (score1 < 0 || score2 < 0) {
    return 'Set wins cannot be negative';
  }
  if (score1 > totalSets || score2 > totalSets) {
    return `Set wins cannot exceed ${totalSets} in this round`;
  }

  const totalPlayedSets = score1 + score2;
  if (totalPlayedSets > totalSets) {
    return `Total played sets cannot exceed ${totalSets}`;
  }

  const hasWinnerFromScore =
    (score1 >= setsNeededToWin && score1 > score2) ||
    (score2 >= setsNeededToWin && score2 > score1);

  if (score1 > 0 || score2 > 0) {
    if (!hasWinnerFromScore) {
      return `Enter a valid completed score. One team must reach ${setsNeededToWin} sets.`;
    }
  } else {
    return null;
  }

  if (totalPlayedSets === 0) {
    return null;
  }

  const normalized = [];
  const rows = Array.isArray(setGameScores) ? setGameScores : [];

  for (let i = 0; i < totalPlayedSets; i += 1) {
    const row = rows[i];
    if (!row || row.team1 == null || row.team2 == null) {
      return `Set ${i + 1}: enter both scores for this set.`;
    }

    const team1 = Number(row.team1);
    const team2 = Number(row.team2);
    const validationMessage = getSetScoreValidationMessage(team1, team2, gamePointFormat);
    if (validationMessage) {
      return `Set ${i + 1}: ${validationMessage}`;
    }

    normalized.push({ team1, team2 });
  }

  if (normalized.length !== totalPlayedSets) {
    return `Enter game points for all ${totalPlayedSets} sets, or leave every set blank.`;
  }

  return null;
}

/**
 * Validate a match result update before persisting.
 *
 * @param {{ round_type: string, score_team1?: number, score_team2?: number, game_point_format?: number | null, is_abandoned?: boolean, abandoned_reason?: string | null }} match
 * @param {{ score_team1?: number, score_team2?: number, set_game_scores?: Array<{ team1: number, team2: number }> | null, game_point_format?: number, winner_team_id?: number | null, status?: string, is_abandoned?: boolean, abandoned_reason?: string | null, setConfig?: object }} body
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateMatchResultUpdate(match, body) {
  const isAbandoned =
    body.is_abandoned !== undefined ? Boolean(body.is_abandoned) : Boolean(match.is_abandoned);

  if (isAbandoned) {
    const reason =
      body.abandoned_reason !== undefined ? body.abandoned_reason : match.abandoned_reason;
    if (!reason?.trim()) {
      return { ok: false, message: 'Abandoned reason is required' };
    }
    return { ok: true };
  }

  const updatingScores =
    body.score_team1 !== undefined ||
    body.score_team2 !== undefined ||
    body.set_game_scores !== undefined;
  const completing =
    body.status === 'Completed' ||
    (body.winner_team_id !== undefined && body.winner_team_id != null);

  if (!updatingScores && !completing) {
    return { ok: true };
  }

  const score1 = Number(body.score_team1 ?? match.score_team1 ?? 0);
  const score2 = Number(body.score_team2 ?? match.score_team2 ?? 0);
  const totalSets = getSetCountForRound(match.round_type, body.setConfig ?? null);
  const setsNeededToWin = Math.floor(totalSets / 2) + 1;
  const gamePointFormat = normalizeGamePointsPerSet(
    body.game_point_format ?? match.game_point_format
  );

  let setScores = body.set_game_scores;
  if (setScores === undefined && match.set_game_scores != null) {
    setScores =
      typeof match.set_game_scores === 'string'
        ? JSON.parse(match.set_game_scores)
        : match.set_game_scores;
  }

  const scoreError = validateCompletedScores(
    score1,
    score2,
    totalSets,
    setsNeededToWin,
    setScores,
    gamePointFormat
  );

  if (scoreError) {
    return { ok: false, message: scoreError };
  }

  if (completing && body.winner_team_id != null) {
    const team1Won = score1 >= setsNeededToWin && score1 > score2;
    const team2Won = score2 >= setsNeededToWin && score2 > score1;
    const expectedWinner = team1Won
      ? match.team1_id
      : team2Won
        ? match.team2_id
        : null;

    if (expectedWinner != null && Number(body.winner_team_id) !== Number(expectedWinner)) {
      return { ok: false, message: 'Winner does not match the submitted set score' };
    }
  }

  return { ok: true };
}
