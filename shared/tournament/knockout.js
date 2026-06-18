/**
 * @typedef {import('./types.ts').StandingRow} StandingRow
 * @typedef {import('./types.ts').Match} Match
 */

/**
 * Generic paired-group crossover (2, 4, 8, or 16 groups).
 * Pairs adjacent groups: G1#1 vs G2#2, G2#1 vs G1#2, etc.
 * @param {Record<string, StandingRow[]>} qualified
 * @param {string[]} [groupOrder] - sorted pool ids, e.g. ['A','B','C','D']
 */
export function generateCrossoverQuarterFinalPairings(qualified, groupOrder) {
  const order = groupOrder ?? Object.keys(qualified).sort();
  if (order.length < 2 || order.length % 2 !== 0) {
    throw new Error('Knockout crossover requires an even number of groups (2, 4, 8, or 16).');
  }

  const pairings = [];
  let qfIndex = 1;

  for (let i = 0; i < order.length; i += 2) {
    const g1 = order[i];
    const g2 = order[i + 1];
    const first = qualified[g1]?.[0];
    const second = qualified[g2]?.[1];
    const third = qualified[g2]?.[0];
    const fourth = qualified[g1]?.[1];

    if (!first || !second || !third || !fourth) {
      throw new Error(`Need top 2 from groups ${g1} and ${g2} to generate knockout matches.`);
    }

    pairings.push({ label: `QF${qfIndex++}`, team1: first, team2: second });
    pairings.push({ label: `QF${qfIndex++}`, team1: third, team2: fourth });
  }

  return pairings;
}

/** @deprecated Use generateCrossoverQuarterFinalPairings */
export function generateGroupsQuarterFinalPairings(qualified) {
  return generateCrossoverQuarterFinalPairings(qualified, ['A', 'B', 'C', 'D']);
}

/**
 * Legacy 2-pool crossover: A1 vs B4, A2 vs B3, A3 vs B2, A4 vs B1
 * @param {StandingRow[]} poolA
 * @param {StandingRow[]} poolB
 */
export function generateLegacyQuarterFinalPairings(poolA, poolB) {
  if (poolA.length < 4 || poolB.length < 4) {
    throw new Error('Need top 4 from each pool to generate quarter-finals');
  }

  return [
    { label: 'QF1', team1: poolA[0], team2: poolB[3] },
    { label: 'QF2', team1: poolA[1], team2: poolB[2] },
    { label: 'QF3', team1: poolA[2], team2: poolB[1] },
    { label: 'QF4', team1: poolA[3], team2: poolB[0] },
  ];
}

/**
 * @param {number} groupCount
 * @param {number} [qualifiersPerGroup]
 */
export function getKnockoutTeamCount(groupCount, qualifiersPerGroup = 2) {
  return groupCount * qualifiersPerGroup;
}

/**
 * @param {number} groupCount
 * @param {number} [qualifiersPerGroup]
 */
export function getFirstKnockoutRoundMatchCount(groupCount, qualifiersPerGroup = 2) {
  return getKnockoutTeamCount(groupCount, qualifiersPerGroup) / 2;
}

/**
 * Four knockout teams (e.g. 2 groups × top 2) skip semi-finals.
 * @param {number} groupCount
 * @param {number} [qualifiersPerGroup]
 */
export function skipsSemiFinalStage(groupCount, qualifiersPerGroup = 2) {
  if (groupCount === 1) return false;
  return getKnockoutTeamCount(groupCount, qualifiersPerGroup) === 4;
}

/**
 * Semi-finals from a single round-robin group (6 teams → top 4).
 * @param {StandingRow[]} standings
 */
export function generateSingleGroupSemiFinalPairings(standings) {
  if (standings.length < 4) {
    throw new Error('Need top 4 standings from the single group to generate semi-finals');
  }

  return [
    { label: 'SF1', team1: standings[0], team2: standings[3] },
    { label: 'SF2', team1: standings[1], team2: standings[2] },
  ];
}

/**
 * Final from a single round-robin group (4 teams → top 2).
 * @param {StandingRow[]} standings
 */
export function generateSingleGroupFinalPairing(standings) {
  if (standings.length < 2) {
    throw new Error('Need top 2 standings from the single group to generate the final');
  }

  return { label: 'Final', team1: standings[0], team2: standings[1] };
}

/**
 * Third place from a single round-robin group (4 teams → 3rd vs 4th).
 * @param {StandingRow[]} standings
 */
export function generateSingleGroupThirdPlacePairing(standings) {
  if (standings.length < 4) {
    throw new Error('Need at least 4 teams in standings for third place match');
  }

  return { label: 'Third Place', team1: standings[2], team2: standings[3] };
}

/**
 * Resolve third place pairing from available knockout or group-stage data.
 * @param {{ semiFinals?: Match[], quarterFinals?: Match[], standings?: StandingRow[] }} sources
 */
export function resolveThirdPlacePairing(sources) {
  const { semiFinals = [], quarterFinals = [], standings = [] } = sources;

  if (semiFinals.length >= 2) {
    return generateThirdPlacePairing(semiFinals);
  }
  if (quarterFinals.length === 2) {
    return generateThirdPlaceFromQuarterFinals(quarterFinals);
  }
  if (standings.length >= 4) {
    return generateSingleGroupThirdPlacePairing(standings);
  }

  throw new Error(
    'Complete Semi Finals, both Quarter Finals, or a single-group round-robin before generating Third Place.'
  );
}

/**
 * @param {string} format
 * @param {number} teamCount
 */
export function getFirstKnockoutRoundType(format, teamCount) {
  if (format === 'single-group') {
    if (teamCount === 4) return 'Final';
    if (teamCount === 6) return 'Semi Final';
  }
  return 'Quarter Final';
}

/**
 * @param {Match[]} matches
 * @param {string|null} [format]
 */
export function inferSingleGroupTeamCount(matches, format = null) {
  if (format !== 'single-group') {
    const pools = [...new Set(matches.filter((m) => m.pool).map((m) => m.pool))];
    if (pools.length !== 1) return null;
  }
  const teamIds = new Set();
  for (const m of matches.filter((x) => x.round_type === 'Qualifying')) {
    teamIds.add(m.team1_id);
    teamIds.add(m.team2_id);
  }
  return teamIds.size || null;
}

/**
 * @param {Record<string, StandingRow[]>} qualified
 * @param {string[]} groupOrder
 * @param {string} format
 * @param {number} teamCount
 */
export function generateFirstKnockoutPairings(qualified, groupOrder, format, teamCount) {
  if (format === 'single-group') {
    const standings = qualified[groupOrder[0]] || [];
    if (teamCount === 4) {
      return {
        roundType: 'Final',
        pairings: [generateSingleGroupFinalPairing(standings)],
      };
    }
    if (teamCount === 6) {
      return {
        roundType: 'Semi Final',
        pairings: generateSingleGroupSemiFinalPairings(standings),
      };
    }
    throw new Error(`Single-group format supports 4 or 6 teams for knockout (got ${teamCount}).`);
  }

  const pairings =
    format === 'pools-2'
      ? generateLegacyQuarterFinalPairings(qualified.A || [], qualified.B || [])
      : generateCrossoverQuarterFinalPairings(qualified, groupOrder);

  return { roundType: 'Quarter Final', pairings };
}

/**
 * Single-group 4-team leagues skip quarter-finals and semi-finals.
 * @param {string} format
 * @param {number} teamCount
 */
export function skipsToFinalFromGroupStage(format, teamCount) {
  return format === 'single-group' && teamCount === 4;
}

/**
 * @param {Match[]} quarterFinals - ordered by scheduled_date
 */
export function generateSemiFinalPairings(quarterFinals) {
  const completed = quarterFinals.filter((m) => m.status === 'Completed' && m.winner_team_id);
  if (completed.length !== 4) {
    throw new Error('All four quarter-final matches must be completed');
  }

  const ordered = [...quarterFinals].sort(
    (a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0)
  );

  const winners = ordered.map((m) => ({
    id: m.winner_team_id,
    team_name: m.winner_team_id === m.team1_id ? m.team1_name : m.team2_name,
  }));

  return [
    { label: 'SF1', team1: winners[0], team2: winners[1] },
    { label: 'SF2', team1: winners[2], team2: winners[3] },
  ];
}

/**
 * Final from two completed quarter-finals (4-team knockout bracket).
 * @param {Match[]} quarterFinals
 */
export function generateFinalPairingFromQuarterFinals(quarterFinals) {
  const completed = quarterFinals.filter((m) => m.status === 'Completed' && m.winner_team_id);
  if (completed.length !== 2) {
    throw new Error('Both quarter-final matches must be completed');
  }

  const ordered = [...quarterFinals].sort(
    (a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0)
  );

  const winners = ordered.map((m) => ({
    id: m.winner_team_id,
    team_name: m.winner_team_id === m.team1_id ? m.team1_name : m.team2_name,
  }));

  return { label: 'Final', team1: winners[0], team2: winners[1] };
}

/**
 * Third place from two completed quarter-finals (4-team knockout bracket).
 * @param {Match[]} quarterFinals
 */
export function generateThirdPlaceFromQuarterFinals(quarterFinals) {
  const completed = quarterFinals.filter((m) => m.status === 'Completed' && m.winner_team_id);
  if (completed.length !== 2) {
    throw new Error('Both quarter-final matches must be completed');
  }

  const ordered = [...quarterFinals].sort(
    (a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0)
  );

  const losers = ordered.map((m) => {
    const loserId = m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id;
    const loserName = m.winner_team_id === m.team1_id ? m.team2_name : m.team1_name;
    return { id: loserId, team_name: loserName };
  });

  return { label: 'Third Place', team1: losers[0], team2: losers[1] };
}

/**
 * @param {Match[]} semiFinals
 */
export function generateFinalPairing(semiFinals) {
  const completed = semiFinals.filter((m) => m.status === 'Completed' && m.winner_team_id);
  if (completed.length !== 2) {
    throw new Error('Both semi-final matches must be completed');
  }

  const ordered = [...semiFinals].sort(
    (a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0)
  );

  const winners = ordered.map((m) => ({
    id: m.winner_team_id,
    team_name: m.winner_team_id === m.team1_id ? m.team1_name : m.team2_name,
  }));

  return { label: 'Final', team1: winners[0], team2: winners[1] };
}

/**
 * @param {Match[]} semiFinals
 */
export function generateThirdPlacePairing(semiFinals) {
  const completed = semiFinals.filter((m) => m.status === 'Completed' && m.winner_team_id);
  if (completed.length !== 2) {
    throw new Error('Both semi-final matches must be completed');
  }

  const ordered = [...semiFinals].sort(
    (a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0)
  );

  const losers = ordered.map((m) => {
    const loserId = m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id;
    const loserName = m.winner_team_id === m.team1_id ? m.team2_name : m.team1_name;
    return { id: loserId, team_name: loserName };
  });

  return { label: 'Third Place', team1: losers[0], team2: losers[1] };
}

/**
 * @param {Match[]} matches
 * @param {string} format
 */
export function buildKnockoutBracket(matches, format = 'groups-4') {
  const qf = matches.filter((m) => m.round_type === 'Quarter Final');
  const sf = matches.filter((m) => m.round_type === 'Semi Final');
  const finalMatch = matches.find((m) => m.round_type === 'Final') || null;
  const thirdPlace = matches.find((m) => m.round_type === 'Third Place') || null;

  const toBracket = (m, label) => ({
    id: m.id,
    label,
    round_type: m.round_type,
    team1_id: m.team1_id,
    team2_id: m.team2_id,
    team1_name: m.team1_name,
    team2_name: m.team2_name,
    winner_team_id: m.winner_team_id,
    score_team1: m.score_team1,
    score_team2: m.score_team2,
    status: m.status,
    scheduled_date: m.scheduled_date,
  });

  return {
    quarterFinals: qf.map((m, i) => toBracket(m, `QF${i + 1}`)),
    semiFinals: sf.map((m, i) => toBracket(m, `SF${i + 1}`)),
    final: finalMatch ? toBracket(finalMatch, 'Final') : null,
    thirdPlace: thirdPlace ? toBracket(thirdPlace, 'Third Place') : null,
    format,
    isSingleGroup: format === 'single-group',
    hasDirectFinal: format === 'single-group' && qf.length === 0 && sf.length === 0,
  };
}
