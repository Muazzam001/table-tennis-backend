/**
 * @typedef {import('./types.ts').Match} Match
 * @typedef {import('./types.ts').StandingRow} StandingRow
 * @typedef {import('./types.ts').Team} Team
 */

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

    // Abandoned walkover with no recorded set score counts as 1-0 for the winner
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

const GD_PRECISION = 3;

/**
 * NRR-style set GD: (sets won per match) − (sets lost per match).
 * Analogous to cricket net run rate using per-match set rates.
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
 * Compare two teams using ranking rules.
 * @param {StandingRow} a
 * @param {StandingRow} b
 * @param {Match[]} matches
 */
function compareStandings(a, b, matches) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.set_difference !== a.set_difference) return b.set_difference - a.set_difference;

  const h2h = getHeadToHeadWinner(matches, a.id, b.id);
  if (h2h === a.id) return -1;
  if (h2h === b.id) return 1;

  if (b.sets_won !== a.sets_won) return b.sets_won - a.sets_won;

  const h2hSetDiff = getHeadToHeadSetDifference(matches, a.id, b.id);
  if (h2hSetDiff !== 0) return -h2hSetDiff;

  return a.id - b.id;
}

/**
 * Calculate standings for teams in a group from completed qualifying matches.
 * Ranking: points → set GD (NRR-style) → head-to-head → sets won → stable id tiebreak.
 * @param {Team[]} teams
 * @param {Match[]} groupMatches - qualifying matches for this pool only
 * @returns {StandingRow[]}
 */
export function calculateGroupStandings(teams, groupMatches) {
  const completed = groupMatches.filter((m) => m.round_type === 'Qualifying');

  /** @type {StandingRow[]} */
  const rows = teams.map((team) => {
    const teamMatches = completed.filter(
      (m) => m.team1_id === team.id || m.team2_id === team.id
    );
    const played = teamMatches.filter((m) => m.status === 'Completed' && m.winner_team_id);

    let points = 0;
    let wins = 0;
    let losses = 0;

    for (const match of played) {
      if (match.winner_team_id === team.id) {
        wins += 1;
        points += match.is_abandoned ? 1 : 2;
      } else {
        losses += 1;
      }
    }

    const { setsWon, setsLost } = getSetsForTeam(completed, team.id);
    const setDifference = calculateSetGD(setsWon, setsLost, played.length);

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
      games_won: setsWon,
      games_lost: setsLost,
      game_difference: setDifference,
    };
  });

  rows.sort((a, b) => compareStandings(a, b, completed));

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
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
