import {
  classifySetMargin,
  getGamePointRules,
  resolveMatchGamePointFormat,
  SET_MARGIN_QUALITY_SCORES,
} from './gamePointRules.js';

/**
 * @typedef {import('./types.ts').Match} Match
 * @typedef {import('./types.ts').StandingRow} StandingRow
 * @typedef {import('./types.ts').Team} Team
 */

/**
 * @typedef {{ team1: number, team2: number }} SetGameScore
 */

export { classifySetMargin, getSetMarginLabel } from './gamePointRules.js';

/** Default game points assumed per won/lost set when detailed scores are not recorded. */
function getEstimatedSetPoints(format) {
  const rules = getGamePointRules(format);
  const midLoss = Math.max(rules.pointsToWin - 4, 0);
  const narrowLoss = Math.max(rules.pointsToWin - 2, 0);
  return {
    won: { pointsFor: rules.pointsToWin, pointsAgainst: midLoss },
    lost: { pointsFor: narrowLoss, pointsAgainst: rules.pointsToWin },
  };
}

const GD_PRECISION = 3;

/**
 * @param {unknown} match
 * @returns {SetGameScore[] | null}
 */
export function parseSetGameScores(match) {
  if (!match?.set_game_scores) return null;

  let raw = match.set_game_scores;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(raw)) return null;

  const sets = raw
    .filter(
      (set) =>
        set &&
        Number.isFinite(Number(set.team1)) &&
        Number.isFinite(Number(set.team2)) &&
        Number(set.team1) >= 0 &&
        Number(set.team2) >= 0
    )
    .map((set) => ({ team1: Number(set.team1), team2: Number(set.team2) }));

  return sets.length > 0 ? sets : null;
}

/**
 * @param {number} teamSets
 * @param {number} oppSets
 * @param {11 | 21} format
 */
function estimateGamePointsFromSetScore(teamSets, oppSets, format = 11) {
  const estimated = getEstimatedSetPoints(format);
  let pointsWon = 0;
  let pointsLost = 0;

  for (let i = 0; i < teamSets; i += 1) {
    pointsWon += estimated.won.pointsFor;
    pointsLost += estimated.won.pointsAgainst;
  }

  for (let i = 0; i < oppSets; i += 1) {
    pointsWon += estimated.lost.pointsFor;
    pointsLost += estimated.lost.pointsAgainst;
  }

  return { pointsWon, pointsLost };
}

/**
 * @param {number} teamPoints
 * @param {number} oppPoints
 * @param {11 | 21} format
 */
function getSetMarginQualityContribution(teamPoints, oppPoints, format) {
  if (teamPoints === oppPoints) return 0;

  const won = teamPoints > oppPoints;
  const winnerPoints = Math.max(teamPoints, oppPoints);
  const loserPoints = Math.min(teamPoints, oppPoints);
  const tier = classifySetMargin(winnerPoints, loserPoints, format);
  const value = SET_MARGIN_QUALITY_SCORES[tier] ?? 0;
  return won ? value : -value;
}

/**
 * Sum sets won/lost from completed qualifying matches.
 * score_team1 / score_team2 store set wins per match.
 * @param {Match[]} matches
 * @param {number} teamId
 */
function getSetsForTeam(matches, teamId) {
  let setsWon = 0;
  let setsLost = 0;

  for (const match of matches) {
    if (match.status !== 'Completed' || !match.winner_team_id) continue;
    if (match.team1_id !== teamId && match.team2_id !== teamId) continue;

    const isTeam1 = match.team1_id === teamId;
    let teamSets = isTeam1 ? match.score_team1 : match.score_team2;
    let oppSets = isTeam1 ? match.score_team2 : match.score_team1;
    teamSets = teamSets || 0;
    oppSets = oppSets || 0;

    if (match.is_abandoned && teamSets === 0 && oppSets === 0) {
      if (match.winner_team_id === teamId) {
        teamSets = 1;
      } else {
        oppSets = 1;
      }
    }

    setsWon += teamSets;
    setsLost += oppSets;
  }

  return { setsWon, setsLost };
}

/**
 * Sum game points won/lost across completed matches.
 * Uses recorded per-set scores when available; otherwise estimates from set results.
 * @param {Match[]} matches
 * @param {number} teamId
 */
function getGamePointsForTeam(matches, teamId) {
  let pointsWon = 0;
  let pointsLost = 0;

  for (const match of matches) {
    if (match.status !== 'Completed' || !match.winner_team_id) continue;
    if (match.team1_id !== teamId && match.team2_id !== teamId) continue;

    const isTeam1 = match.team1_id === teamId;
    const gamePointFormat = resolveMatchGamePointFormat(match);
    const setScores = parseSetGameScores(match);

    if (setScores?.length) {
      for (const set of setScores) {
        pointsWon += isTeam1 ? set.team1 : set.team2;
        pointsLost += isTeam1 ? set.team2 : set.team1;
      }
      continue;
    }

    let teamSets = isTeam1 ? match.score_team1 : match.score_team2;
    let oppSets = isTeam1 ? match.score_team2 : match.score_team1;
    teamSets = teamSets || 0;
    oppSets = oppSets || 0;

    if (match.is_abandoned && teamSets === 0 && oppSets === 0) {
      if (match.winner_team_id === teamId) {
        teamSets = 1;
      } else {
        oppSets = 1;
      }
    }

    const estimated = estimateGamePointsFromSetScore(teamSets, oppSets, gamePointFormat);
    pointsWon += estimated.pointsWon;
    pointsLost += estimated.pointsLost;
  }

  return { pointsWon, pointsLost };
}

/**
 * Sum set-margin quality from recorded per-set game scores (knockout, shutout, etc.).
 * @param {Match[]} matches
 * @param {number} teamId
 */
function getMarginQualityScore(matches, teamId) {
  let score = 0;

  for (const match of matches) {
    if (match.status !== 'Completed' || !match.winner_team_id) continue;
    if (match.team1_id !== teamId && match.team2_id !== teamId) continue;

    const setScores = parseSetGameScores(match);
    if (!setScores?.length) continue;

    const isTeam1 = match.team1_id === teamId;
    const gamePointFormat = resolveMatchGamePointFormat(match);

    for (const set of setScores) {
      const teamPoints = isTeam1 ? set.team1 : set.team2;
      const oppPoints = isTeam1 ? set.team2 : set.team1;
      score += getSetMarginQualityContribution(teamPoints, oppPoints, gamePointFormat);
    }
  }

  return score;
}

/**
 * Rewards dominant set-score wins (e.g. 2-0) over narrow wins (2-1).
 * @param {Match[]} matches
 * @param {number} teamId
 */
function getDominanceScore(matches, teamId) {
  let score = 0;

  for (const match of matches) {
    if (match.status !== 'Completed' || !match.winner_team_id) continue;
    if (match.team1_id !== teamId && match.team2_id !== teamId) continue;

    const isTeam1 = match.team1_id === teamId;
    let teamSets = isTeam1 ? match.score_team1 : match.score_team2;
    let oppSets = isTeam1 ? match.score_team2 : match.score_team1;
    teamSets = teamSets || 0;
    oppSets = oppSets || 0;

    if (match.is_abandoned && teamSets === 0 && oppSets === 0) {
      if (match.winner_team_id === teamId) {
        teamSets = 1;
      } else {
        oppSets = 1;
      }
    }

    const diff = teamSets - oppSets;
    score += diff * Math.abs(diff);
  }

  return score;
}

/**
 * NRR-style set GD: (sets won per match) − (sets lost per match).
 * @param {number} setsWon
 * @param {number} setsLost
 * @param {number} matchesPlayed
 */
export function calculateSetGD(setsWon, setsLost, matchesPlayed) {
  if (!matchesPlayed) return 0;
  const setRateFor = setsWon / matchesPlayed;
  const setRateAgainst = setsLost / matchesPlayed;
  const factor = 10 ** GD_PRECISION;
  return Math.round((setRateFor - setRateAgainst) * factor) / factor;
}

/**
 * NRR-style game-point GD: (points won per match) − (points lost per match).
 * @param {number} pointsWon
 * @param {number} pointsLost
 * @param {number} matchesPlayed
 */
export function calculatePointGD(pointsWon, pointsLost, matchesPlayed) {
  if (!matchesPlayed) return 0;
  const rateFor = pointsWon / matchesPlayed;
  const rateAgainst = pointsLost / matchesPlayed;
  const factor = 10 ** GD_PRECISION;
  return Math.round((rateFor - rateAgainst) * factor) / factor;
}

/** @param {number} value */
export function formatSetGD(value) {
  const n = Number(value ?? 0);
  const formatted = Math.abs(n).toFixed(GD_PRECISION);
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `-${formatted}`;
  return formatted;
}

/**
 * @param {Match[]} matches
 * @param {number} teamA
 * @param {number} teamB
 */
function getHeadToHeadMatch(matches, teamA, teamB) {
  return matches.find(
    (m) =>
      m.status === 'Completed' &&
      ((m.team1_id === teamA && m.team2_id === teamB) ||
        (m.team1_id === teamB && m.team2_id === teamA))
  );
}

function getHeadToHeadWinner(matches, teamA, teamB) {
  return getHeadToHeadMatch(matches, teamA, teamB)?.winner_team_id ?? null;
}

/**
 * Set difference in the direct fixture between two teams (teamA perspective).
 * @param {Match[]} matches
 * @param {number} teamA
 * @param {number} teamB
 */
function getHeadToHeadSetDifference(matches, teamA, teamB) {
  const direct = getHeadToHeadMatch(matches, teamA, teamB);
  if (!direct) return 0;

  const aIsTeam1 = direct.team1_id === teamA;
  const aSets = aIsTeam1 ? direct.score_team1 : direct.score_team2;
  const bSets = aIsTeam1 ? direct.score_team2 : direct.score_team1;
  return (aSets || 0) - (bSets || 0);
}

/**
 * Whether two standing rows are tied on all ranked metrics before head-to-head.
 * @param {StandingRow} a
 * @param {StandingRow} b
 */
function isPrimaryTie(a, b) {
  return (
    a.points === b.points &&
    a.set_difference === b.set_difference &&
    a.point_difference === b.point_difference &&
    a.margin_quality_score === b.margin_quality_score &&
    a.dominance_score === b.dominance_score
  );
}

/**
 * Compare two teams using ranking rules.
 * @param {StandingRow} a
 * @param {StandingRow} b
 * @param {Match[]} matches
 */
function compareStandings(a, b, matches) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.set_difference !== a.set_difference) return b.set_difference - a.set_difference;
  if (b.point_difference !== a.point_difference) return b.point_difference - a.point_difference;
  if (b.margin_quality_score !== a.margin_quality_score) {
    return b.margin_quality_score - a.margin_quality_score;
  }
  if (b.dominance_score !== a.dominance_score) return b.dominance_score - a.dominance_score;

  const h2h = getHeadToHeadWinner(matches, a.id, b.id);
  if (h2h === a.id) return -1;
  if (h2h === b.id) return 1;

  if (b.sets_won !== a.sets_won) return b.sets_won - a.sets_won;

  const h2hSetDiff = getHeadToHeadSetDifference(matches, a.id, b.id);
  if (h2hSetDiff !== 0) return -h2hSetDiff;

  return a.id - b.id;
}

/**
 * Resolve a multi-team tie using mini-league standings among tied teams only.
 * @param {StandingRow[]} group
 * @param {Match[]} matches
 */
function resolveTieGroup(group, matches) {
  if (group.length <= 1) return group;

  const teamIds = new Set(group.map((row) => row.id));
  const miniMatches = matches.filter(
    (m) =>
      m.status === 'Completed' &&
      m.winner_team_id &&
      teamIds.has(m.team1_id) &&
      teamIds.has(m.team2_id)
  );

  if (miniMatches.length === 0) {
    return [...group].sort((a, b) => compareStandings(a, b, matches));
  }

  const miniTeams = group.map((row) => ({ id: row.id, team_name: row.team_name }));
  const miniStandings = calculateGroupStandings(miniTeams, miniMatches, {
    includeAllRoundTypes: true,
    skipTieGroupResolution: true,
  });
  const rankById = Object.fromEntries(miniStandings.map((row) => [row.id, row.rank]));

  return [...group].sort((a, b) => {
    const rankDiff = (rankById[a.id] ?? 999) - (rankById[b.id] ?? 999);
    if (rankDiff !== 0) return rankDiff;
    return compareStandings(a, b, matches);
  });
}

/**
 * Apply mini-league resolution for clusters tied on primary metrics.
 * @param {StandingRow[]} rows
 * @param {Match[]} matches
 */
function resolveTieGroups(rows, matches) {
  const resolved = [];
  let index = 0;

  while (index < rows.length) {
    let end = index + 1;
    while (end < rows.length && isPrimaryTie(rows[index], rows[end])) {
      end += 1;
    }

    const group = rows.slice(index, end);
    resolved.push(...(group.length > 1 ? resolveTieGroup(group, matches) : group));
    index = end;
  }

  return resolved;
}

/**
 * Calculate standings for teams in a group from completed qualifying matches.
 * Ranking: points → set GD → point GD → margin quality → dominance → mini-league → head-to-head → sets won → stable id.
 * @param {Team[]} teams
 * @param {Match[]} groupMatches
 * @param {{ roundTypes?: string[], includeAllRoundTypes?: boolean, skipTieGroupResolution?: boolean }} [options]
 * @returns {StandingRow[]}
 */
export function calculateGroupStandings(teams, groupMatches, options = {}) {
  const roundMatches = options.includeAllRoundTypes
    ? groupMatches
    : groupMatches.filter((m) => (options.roundTypes ?? ['Qualifying']).includes(m.round_type));

  const rows = teams.map((team) => {
    const teamMatches = roundMatches.filter(
      (m) => m.team1_id === team.id || m.team2_id === team.id
    );
    const played = teamMatches.filter(
      (m) => m.status === 'Completed' && (m.winner_team_id || m.is_abandoned)
    );

    let points = 0;
    let wins = 0;
    let losses = 0;

    for (const match of played) {
      // Match abandoned with no winner (both teams unavailable): award 1 point to each team.
      if (match.is_abandoned && !match.winner_team_id) {
        points += 1;
        continue;
      }
      if (match.winner_team_id === team.id) {
        wins += 1;
        points += match.is_abandoned ? 1 : 2;
      } else {
        losses += 1;
      }
    }

    const { setsWon, setsLost } = getSetsForTeam(roundMatches, team.id);
    const setDifference = calculateSetGD(setsWon, setsLost, played.length);
    const { pointsWon, pointsLost } = getGamePointsForTeam(roundMatches, team.id);
    const pointDifference = calculatePointGD(pointsWon, pointsLost, played.length);
    const marginQualityScore = getMarginQualityScore(roundMatches, team.id);
    const dominanceScore = getDominanceScore(roundMatches, team.id);

    return {
      id: team.id,
      team_name: team.team_name,
      rank: 0,
      matches_played: played.length,
      matches_won: wins,
      matches_lost: losses,
      points,
      sets_won: setsWon,
      sets_lost: setsLost,
      set_difference: setDifference,
      points_won: pointsWon,
      points_lost: pointsLost,
      point_difference: pointDifference,
      margin_quality_score: marginQualityScore,
      dominance_score: dominanceScore,
      games_won: setsWon,
      games_lost: setsLost,
      game_difference: setDifference,
    };
  });

  rows.sort((a, b) => compareStandings(a, b, roundMatches));

  const ordered = options.skipTieGroupResolution
    ? rows
    : resolveTieGroups(rows, roundMatches);

  return ordered.map((row, index) => ({ ...row, rank: index + 1 }));
}

/**
 * @param {Record<string, Team[]>} groups
 * @param {Match[]} allMatches
 */
export function calculateAllGroupStandings(groups, allMatches) {
  /** @type {Record<string, StandingRow[]>} */
  const standings = {};
  for (const [poolId, teams] of Object.entries(groups)) {
    const poolMatches = allMatches.filter((m) => m.pool === poolId);
    standings[poolId] = calculateGroupStandings(teams, poolMatches);
  }
  return standings;
}
