import {
  getGamePointRules,
  isValidSetGameScore,
  normalizeGamePointsPerSet,
} from './gamePointRules.js';
import { getSetCountForRound } from './matchSetDefaults.js';

/**
 * Build one valid per-set game score (winner reaches pointsToWin).
 * @param {boolean} winnerIsTeam1
 * @param {11 | 21} format
 * @param {number} setIndex
 */
function buildSetGameScore(winnerIsTeam1, format, setIndex) {
  const rules = getGamePointRules(format);
  const loserOptions = [7, 8, 9, 6, 5, 4];
  const loser = loserOptions[setIndex % loserOptions.length];
  const winner = rules.pointsToWin;
  return winnerIsTeam1
    ? { team1: winner, team2: loser }
    : { team1: loser, team2: winner };
}

/**
 * Deterministic test result: lower team ID always wins.
 * Scores are valid for standings and tie-break calculations.
 *
 * @param {{ id?: number, team1_id: number, team2_id: number, round_type: string, game_point_format?: number | null }} match
 * @param {{ setConfig?: object, gamePointsPerSet?: number }} [options]
 */
export function generateTestMatchResult(match, options = {}) {
  const { setConfig, gamePointsPerSet } = options;
  const format = normalizeGamePointsPerSet(match.game_point_format ?? gamePointsPerSet);
  const totalSets = getSetCountForRound(match.round_type, setConfig);
  const setsNeededToWin = Math.floor(totalSets / 2) + 1;

  const winnerId = match.team1_id < match.team2_id ? match.team1_id : match.team2_id;
  const winnerIsTeam1 = winnerId === match.team1_id;

  const matchSeed = Number(match.id) || match.team1_id + match.team2_id;
  const loserSets =
    totalSets >= 3 && setsNeededToWin >= 2 && matchSeed % 2 === 1 ? 1 : 0;
  const winnerSets = setsNeededToWin;

  const score_team1 = winnerIsTeam1 ? winnerSets : loserSets;
  const score_team2 = winnerIsTeam1 ? loserSets : winnerSets;
  const playedSets = score_team1 + score_team2;

  /** @type {{ team1: number, team2: number }[]} */
  const set_game_scores = [];

  for (let i = 0; i < playedSets; i += 1) {
    const loserWinsSet = loserSets > 0 && i === 1;
    const setWinnerIsTeam1 = loserWinsSet ? !winnerIsTeam1 : winnerIsTeam1;
    const setScore = buildSetGameScore(setWinnerIsTeam1, format, i);
    if (!isValidSetGameScore(setScore.team1, setScore.team2, format)) {
      throw new Error(`Generated invalid set score for match ${match.id ?? 'unknown'}`);
    }
    set_game_scores.push(setScore);
  }

  return {
    score_team1,
    score_team2,
    set_game_scores,
    game_point_format: format,
    winner_team_id: winnerId,
    status: 'Completed',
    is_abandoned: false,
    abandoned_reason: null,
  };
}
