/** @typedef {import('../../types.ts').Match} Match */
/** @typedef {import('../../types.ts').Team} Team */
/** @typedef {import('../../types.ts').TierPyramidConfig} TierPyramidConfig */
/** @typedef {import('../../types.ts').PyramidTournamentStatus} PyramidTournamentStatus */

import { calculateGroupStandings } from '../../standings.js';
import { normalizeTierPyramidConfig, PYRAMID_SEMIFINAL_TEAM_COUNT } from './config.js';
import {
  generateLevel2CrossoverPairings,
  generateLevel3CrossoverPairings,
  buildLevel3CrossoverRound,
  generateSeededBracketPairings,
  partitionLevel2Entrants,
  partitionLevel3Entrants,
  rankEntrantsByCumulativeWins,
  rankEntrantsByRoundTypes,
  buildLevel1BPairings,
  getOrderedBracketResults,
} from './seeding.js';
import { buildSemiFinalPairingsFromRound } from './bracket.js';
import { generateThirdPlacePairing } from '../../knockout.js';
import { getLevel3QuarterFinalMatches, getPyramidSemiFinalMatches } from './roundFilters.js';

/**
 * @typedef {{
 *   teamId: number,
 *   fromStage: string,
 *   toStage: string,
 *   fromStatus: string,
 *   toStatus: string,
 *   source: string | null,
 * }} AdvancementUpdate
 */

const PYRAMID_ROUND_TYPES = ['S1', 'S2', 'Level 1B', 'Level 2', 'Level 3', 'Final'];

/**
 * @param {Match[]} matches
 * @param {'S1' | 'S2' | 'L1B' | 'L2' | 'Level 2' | 'L3' | 'Level 3' | 'Final'} stage
 */
export function isPyramidStageComplete(matches, stage) {
  const roundType =
    stage === 'L2'
      ? 'Level 2'
      : stage === 'L3'
        ? 'Level 3'
        : stage === 'L1B'
          ? 'Level 1B'
          : stage;
  const stageMatches = matches.filter(
    (m) => m.round_type === roundType || m.pyramid_stage === stage
  );
  if (stageMatches.length === 0) return false;
  return stageMatches.every((m) => m.status === 'Completed' && m.winner_team_id);
}

/**
 * @param {Match[]} matches
 */
export function isS1Complete(matches) {
  return isPyramidStageComplete(matches, 'S1');
}

/**
 * Group Level 1B matches into knockout rounds by stage_sequence.
 * Round sizes halve each round (entrants/2, /4, …) until the target is reached.
 * @param {Match[]} matches
 * @returns {Match[][]} rounds, ordered (Round 1 first)
 */
export function getLevel1BRoundMatches(matches) {
  const l1b = matches
    .filter((m) => m.round_type === 'Level 1B')
    .sort((a, b) => (a.stage_sequence ?? 0) - (b.stage_sequence ?? 0));
  if (l1b.length === 0) return [];

  const participants = new Set();
  for (const m of l1b) {
    participants.add(m.team1_id);
    participants.add(m.team2_id);
  }

  /** @type {Match[][]} */
  const rounds = [];
  let offset = 0;
  let count = Math.floor(participants.size / 2);
  while (offset < l1b.length && count >= 1) {
    rounds.push(l1b.slice(offset, offset + count));
    offset += count;
    count = Math.floor(count / 2);
  }
  if (offset < l1b.length) rounds.push(l1b.slice(offset));
  return rounds;
}

/**
 * @param {Match[]} round
 */
function isLevel1BRoundComplete(round) {
  return round.length > 0 && round.every((m) => m.status === 'Completed' && m.winner_team_id);
}

/**
 * @param {Match[]} matches
 * @returns {number}
 */
export function getLevel1BRoundCount(matches) {
  return getLevel1BRoundMatches(matches).length;
}

/**
 * @param {Match[]} matches
 */
export function isLevel1BRound1Complete(matches) {
  const rounds = getLevel1BRoundMatches(matches);
  return rounds.length >= 1 && isLevel1BRoundComplete(rounds[0]);
}

/**
 * Whether a second Level 1B round is required (Round 1 winners exceed the L2 feed).
 * @param {Match[]} matches
 * @param {Partial<TierPyramidConfig>} [partialConfig]
 */
export function needsLevel1BRound2(matches, partialConfig = {}) {
  const config = normalizeTierPyramidConfig(partialConfig);
  const rounds = getLevel1BRoundMatches(matches);
  if (rounds.length === 0) return false;
  return rounds[0].length > config.l1bAdvanceCount;
}

/**
 * Level 1B is complete when every round has finished and the final round has
 * narrowed the field to the L2 feed (default 4).
 * @param {Match[]} matches
 * @param {number} [target]
 */
export function isLevel1BComplete(matches, target = 4) {
  const rounds = getLevel1BRoundMatches(matches);
  if (rounds.length === 0) return false;
  if (!rounds.every(isLevel1BRoundComplete)) return false;
  return rounds[rounds.length - 1].length <= target;
}

/**
 * @param {Match[]} matches
 */
export function isLevel1Complete(matches) {
  return isPyramidStageComplete(matches, 'S1') && isPyramidStageComplete(matches, 'S2');
}

/**
 * @param {Match[]} matches
 * @param {string} roundType
 */
export function hasRoundType(matches, roundType) {
  return matches.some((m) => m.round_type === roundType);
}

/**
 * @param {Match[]} matches
 * @param {Team[]} teams
 */
export function getS1GroupsFromMatches(matches, teams) {
  const s1Matches = matches.filter((m) => m.round_type === 'S1');
  const poolIds = [...new Set(s1Matches.map((m) => m.pool).filter(Boolean))].sort();
  /** @type {Record<string, Team[]>} */
  const groups = {};

  for (const poolId of poolIds) {
    const teamIds = new Set();
    for (const match of s1Matches.filter((m) => m.pool === poolId)) {
      teamIds.add(match.team1_id);
      teamIds.add(match.team2_id);
    }
    groups[poolId] = teams.filter((t) => teamIds.has(t.id));
  }

  return groups;
}

/**
 * @param {Team[]} teams
 * @param {string} prefix
 */
export function hasAdvancementWithPrefix(teams, prefix) {
  return teams.some((t) => t.advancement_source?.startsWith(prefix));
}

/**
 * @param {Match[]} matches
 * @param {Team[]} teams
 * @param {Partial<TierPyramidConfig>} [partialConfig]
 * @returns {{ winners: AdvancementUpdate[], eliminated: AdvancementUpdate[] }}
 */
export function computeS1Advancement(matches, teams, partialConfig = {}) {
  const config = normalizeTierPyramidConfig(partialConfig);
  const groups = getS1GroupsFromMatches(matches, teams);
  /** @type {AdvancementUpdate[]} */
  const winners = [];
  /** @type {AdvancementUpdate[]} */
  const eliminated = [];

  for (const [poolId, groupTeams] of Object.entries(groups).sort()) {
    const poolMatches = matches.filter((m) => m.pool === poolId && m.round_type === 'S1');
    const standings = calculateGroupStandings(groupTeams, poolMatches, { roundTypes: ['S1'] });
    const qualifying = standings.slice(0, config.s1QualifiersPerGroup);
    const out = standings.slice(config.s1QualifiersPerGroup);

    for (let i = 0; i < qualifying.length; i += 1) {
      winners.push({
        teamId: qualifying[i].id,
        fromStage: 'S1',
        toStage: 'L1B',
        fromStatus: 'active',
        toStatus: 'advanced',
        source: `S1-${poolId}-${i + 1}`,
      });
    }

    for (const row of out) {
      eliminated.push({
        teamId: row.id,
        fromStage: 'S1',
        toStage: 'eliminated',
        fromStatus: 'active',
        toStatus: 'eliminated',
        source: null,
      });
    }
  }

  return { winners, eliminated };
}

/**
 * @param {Match[]} matches
 * @param {Team[]} tier1Teams
 * @param {Partial<TierPyramidConfig>} [partialConfig]
 */
export function computeS2Advancement(matches, tier1Teams, partialConfig = {}) {
  const config = normalizeTierPyramidConfig(partialConfig);
  const s2Matches = matches.filter((m) => m.round_type === 'S2');
  const standings = calculateGroupStandings(tier1Teams, s2Matches, { roundTypes: ['S2'] });

  const toL3 = standings.slice(0, config.s2AdvanceCount).map((row, i) => ({
    teamId: row.id,
    fromStage: 'S2',
    toStage: 'L3',
    fromStatus: 'active',
    toStatus: 'advanced',
    source: `S2-top-${i + 1}`,
  }));

  const toL2 = standings
    .slice(config.s2AdvanceCount, config.s2AdvanceCount + config.s2DropCount)
    .map((row, i) => ({
      teamId: row.id,
      fromStage: 'S2',
      toStage: 'L2',
      fromStatus: 'active',
      toStatus: 'advanced',
      source: `S2-drop-${i + 1}`,
    }));

  return { toL3, toL2 };
}

/**
 * Round 1 result: winners stay in Level 1B for Round 2, losers are eliminated.
 * @param {Match[]} matches
 * @param {Team[]} _teams
 * @returns {{ winners: AdvancementUpdate[], eliminated: AdvancementUpdate[] }}
 */
export function computeLevel1BRound1Advancement(matches, _teams = []) {
  const rounds = getLevel1BRoundMatches(matches);
  if (rounds.length === 0) return { winners: [], eliminated: [] };
  const r1 = rounds[0];
  if (!isLevel1BRoundComplete(r1)) return { winners: [], eliminated: [] };

  const winners = r1.map((m, index) => ({
    teamId: m.winner_team_id,
    fromStage: 'L1B',
    toStage: 'L1B',
    fromStatus: 'active',
    toStatus: 'active',
    source: `L1B-r1-${index + 1}`,
  }));

  const eliminated = r1.map((m) => ({
    teamId: m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id,
    fromStage: 'L1B',
    toStage: 'eliminated',
    fromStatus: 'active',
    toStatus: 'eliminated',
    source: null,
  }));

  return { winners, eliminated };
}

/**
 * Round 2 fixtures: winners of Round 1 (A,B)-side vs (C,D)-side, paired by match
 * order — winner(match i) vs winner(match i + half).
 * @param {Match[]} matches
 * @param {Team[]} teams
 * @returns {PyramidPairingFixture[]}
 */
export function buildLevel1BRound2Fixtures(matches, teams = []) {
  const rounds = getLevel1BRoundMatches(matches);
  if (rounds.length === 0) return [];
  const r1 = rounds[0];
  if (!isLevel1BRoundComplete(r1)) return [];

  const half = Math.floor(r1.length / 2);
  if (half < 1) return [];

  const teamById = new Map(teams.map((t) => [t.id, t]));
  /** @type {PyramidPairingFixture[]} */
  const fixtures = [];
  for (let i = 0; i < half; i += 1) {
    const w1 = r1[i].winner_team_id;
    const w2 = r1[i + half].winner_team_id;
    fixtures.push({
      label: `L1B-R2-${i + 1}`,
      team1_id: w1,
      team2_id: w2,
      team1: teamById.get(w1) ?? null,
      team2: teamById.get(w2) ?? null,
      round_type: 'Level 1B',
      pyramid_stage: 'L1B',
      stage_sequence: r1.length + i,
      pool: null,
    });
  }
  return fixtures;
}

/**
 * Final Level 1B advancement: winners of the last round advance to Level 2,
 * their opponents are eliminated. Winner seed order uses cumulative S1+L1B wins.
 * @param {Match[]} matches
 * @param {Team[]} teams
 * @param {Partial<TierPyramidConfig>} [partialConfig]
 * @returns {{ winners: AdvancementUpdate[], eliminated: AdvancementUpdate[] }}
 */
export function computeLevel1BAdvancement(matches, teams, partialConfig = {}) {
  normalizeTierPyramidConfig(partialConfig);
  const rounds = getLevel1BRoundMatches(matches);
  if (rounds.length === 0) return { winners: [], eliminated: [] };
  const lastRound = rounds[rounds.length - 1];
  if (!isLevel1BRoundComplete(lastRound)) return { winners: [], eliminated: [] };

  const winnerIds = lastRound.map((m) => m.winner_team_id);
  const loserIds = lastRound.map((m) =>
    m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id
  );

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const winnerTeams = winnerIds.map((id) => teamById.get(id)).filter(Boolean);
  const standings = rankEntrantsByRoundTypes(winnerTeams, matches, ['S1', 'Level 1B']);
  const rankById = new Map(standings.map((row, index) => [row.id, row.rank ?? index + 1]));
  const orderedWinnerIds = [...winnerIds].sort(
    (a, b) => (rankById.get(a) ?? 999) - (rankById.get(b) ?? 999) || a - b
  );

  const winners = orderedWinnerIds.map((id, index) => ({
    teamId: id,
    fromStage: 'L1B',
    toStage: 'L2',
    fromStatus: 'active',
    toStatus: 'advanced',
    source: `L1B-adv-${index + 1}`,
  }));

  const eliminated = loserIds.map((id) => ({
    teamId: id,
    fromStage: 'L1B',
    toStage: 'eliminated',
    fromStatus: 'active',
    toStatus: 'eliminated',
    source: null,
  }));

  return { winners, eliminated };
}

/**
 * @param {Team[]} teams
 * @returns {PyramidPairingFixture[]}
 */
export function buildLevel1BFixtures(teams) {
  const s1Qualifiers = teams.filter((t) => t.advancement_source?.startsWith('S1-'));
  return buildLevel1BPairings(s1Qualifiers);
}

/**
 * @param {Match[]} matches
 * @param {'Level 2' | 'Level 3'} roundType
 * @param {Partial<TierPyramidConfig>} partialConfig
 */
export function computeBracketStageAdvancement(matches, roundType, partialConfig = {}) {
  const config = normalizeTierPyramidConfig(partialConfig);
  const fromStage = roundType === 'Level 2' ? 'L2' : 'L3';

  if (roundType === 'Level 2') {
    const roundMatches = matches
      .filter((m) => m.round_type === 'Level 2')
      .sort((a, b) => (a.stage_sequence ?? 0) - (b.stage_sequence ?? 0));

    if (roundMatches.length === 0) return { winners: [], eliminated: [] };
    if (!roundMatches.every((m) => m.status === 'Completed' && m.winner_team_id)) {
      return { winners: [], eliminated: [] };
    }

    const winners = roundMatches.map((m) => ({
      teamId: m.winner_team_id,
      fromStage: 'L2',
      toStage: 'L3',
      fromStatus: 'active',
      toStatus: 'advanced',
      source: 'L2-win',
    }));

    const eliminated = roundMatches.map((m) => ({
      teamId: m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id,
      fromStage: 'L2',
      toStage: 'eliminated',
      fromStatus: 'active',
      toStatus: 'eliminated',
      source: null,
    }));

    return { winners, eliminated };
  }

  const sfMatches = getPyramidSemiFinalMatches(matches);

  if (sfMatches.length < 2) return { winners: [], eliminated: [] };
  if (!sfMatches.every((m) => m.status === 'Completed' && m.winner_team_id)) {
    return { winners: [], eliminated: [] };
  }

  const finalistIds = new Set(sfMatches.map((m) => m.winner_team_id));
  const allL3TeamIds = new Set();
  for (const match of getLevel3QuarterFinalMatches(matches)) {
    allL3TeamIds.add(match.team1_id);
    allL3TeamIds.add(match.team2_id);
  }
  for (const match of sfMatches) {
    allL3TeamIds.add(match.team1_id);
    allL3TeamIds.add(match.team2_id);
  }

  const winners = sfMatches.map((m) => ({
    teamId: m.winner_team_id,
    fromStage: 'L3',
    toStage: 'final',
    fromStatus: 'active',
    toStatus: 'advanced',
    source: 'L3-SF',
  }));

  const eliminated = [...allL3TeamIds]
    .filter((teamId) => !finalistIds.has(teamId))
    .map((teamId) => ({
      teamId,
      fromStage: 'L3',
      toStage: 'eliminated',
      fromStatus: 'active',
      toStatus: 'eliminated',
      source: null,
    }));

  return { winners, eliminated };
}

/**
 * @param {Team[]} teams — L2 entrants (stage L2)
 * @param {Match[]} allMatches
 */
export function buildLevel2Fixtures(teams, allMatches) {
  const { l1bWinners, s2Drops } = partitionLevel2Entrants(teams);
  return generateLevel2CrossoverPairings(l1bWinners, s2Drops, allMatches, {
    stage: 'L2',
    roundType: 'Level 2',
    labelPrefix: 'L2-',
  });
}

/**
 * @param {Team[]} teams — L3 entrants
 * @param {Match[]} allMatches
 * @returns {{ fixtures: ReturnType<typeof generateLevel3CrossoverPairings>, byeEntrants: Team[] }}
 */
export function buildLevel3FirstRoundPlan(teams, allMatches) {
  const { l2Winners, s2Top } = partitionLevel3Entrants(teams);
  const plan = buildLevel3CrossoverRound(l2Winners, s2Top, allMatches, {
    stage: 'L3',
    roundType: 'Level 3',
    labelPrefix: 'L3-QF',
  });

  const semifinalTeams = plan.byeEntrants.length + plan.fixtures.length;
  if (semifinalTeams !== PYRAMID_SEMIFINAL_TEAM_COUNT) {
    throw new Error(
      `Level 3 crossover must produce exactly ${PYRAMID_SEMIFINAL_TEAM_COUNT} semi-final teams (got ${semifinalTeams}: ${plan.byeEntrants.length} bye(s) + ${plan.fixtures.length} match(es)).`
    );
  }

  return plan;
}

/**
 * @param {Team[]} teams — L3 entrants
 * @param {Match[]} allMatches
 */
export function buildLevel3QuarterFinalFixtures(teams, allMatches) {
  return buildLevel3FirstRoundPlan(teams, allMatches).fixtures;
}

/**
 * @param {Match[]} quarterFinalMatches — completed L3 first-round matches (may be empty when all byes)
 * @param {Team[]} [byeEntrants] — teams that received a bye into semi-finals
 */
export function buildLevel3SemiFinalFixtures(quarterFinalMatches, byeEntrants = []) {
  const ordered = getLevel3QuarterFinalMatches(quarterFinalMatches)
    .filter((m) => m.status === 'Completed' && m.winner_team_id)
    .sort((a, b) => (a.stage_sequence ?? 0) - (b.stage_sequence ?? 0));

  const { winners } =
    ordered.length > 0
      ? getOrderedBracketResults(ordered, 'Level 3')
      : { winners: [] };

  if (winners.length + byeEntrants.length !== PYRAMID_SEMIFINAL_TEAM_COUNT) {
    throw new Error(
      `Level 3 semi-finals require exactly ${PYRAMID_SEMIFINAL_TEAM_COUNT} teams (got ${winners.length} winner(s) + ${byeEntrants.length} bye(s)).`
    );
  }

  const pairings = buildSemiFinalPairingsFromRound(byeEntrants, winners);

  return pairings.map((pairing, index) => ({
    label: `SF${index + 1}`,
    team1_id: pairing.team1.id,
    team2_id: pairing.team2.id,
    team1: pairing.team1,
    team2: pairing.team2,
    round_type: 'Semi Final',
    pyramid_stage: 'L3',
    stage_sequence: index,
    pool: null,
  }));
}

/**
 * @param {Match[]} semiFinalMatches — 2 completed L3 SF matches
 */
export function buildFinalFixture(semiFinalMatches) {
  const ordered = getPyramidSemiFinalMatches(semiFinalMatches).sort(
    (a, b) => (a.stage_sequence ?? 0) - (b.stage_sequence ?? 0)
  );
  if (ordered.length !== 2) {
    throw new Error(`Final requires exactly 2 completed semi-final matches (got ${ordered.length})`);
  }
  const winners = ordered.map((m) => ({
    id: m.winner_team_id,
    team_name: m.winner_team_id === m.team1_id ? m.team1_name : m.team2_name,
  }));

  return {
    label: 'Final',
    team1_id: winners[0].id,
    team2_id: winners[1].id,
    team1: winners[0],
    team2: winners[1],
    round_type: 'Final',
    pyramid_stage: 'Final',
    stage_sequence: 0,
    pool: null,
  };
}

/**
 * Third place from completed pyramid semi-finals (semi-final losers).
 * @param {Match[]} semiFinalMatches
 */
export function buildThirdPlaceFixture(semiFinalMatches) {
  const pairing = generateThirdPlacePairing(getPyramidSemiFinalMatches(semiFinalMatches));

  return {
    label: pairing.label,
    team1_id: pairing.team1.id,
    team2_id: pairing.team2.id,
    team1: pairing.team1,
    team2: pairing.team2,
    round_type: 'Third Place',
    pyramid_stage: null,
    stage_sequence: 0,
    pool: null,
  };
}

/**
 * Optional third place — returns null when semi-finals are not ready.
 * @param {Match[]} semiFinalMatches
 */
export function tryBuildThirdPlaceFixture(semiFinalMatches) {
  try {
    return buildThirdPlaceFixture(semiFinalMatches);
  } catch {
    return null;
  }
}

/**
 * Derive Level 1B gate status from matches and stored division state.
 * @param {Match[]} matches
 * @param {{ level1b_status?: string }} [divisionSettings]
 * @returns {import('../../types.ts').Level1bStatus}
 */
export function deriveLevel1bStatus(matches, divisionSettings = {}, teams = []) {
  const stored = divisionSettings.level1b_status;
  if (!isS1Complete(matches)) return 'waiting';
  if (
    stored === 'complete' ||
    teams.some((t) => t.advancement_source?.startsWith('L1B-adv-'))
  ) {
    return 'complete';
  }
  if (hasRoundType(matches, 'Level 1B')) {
    return 'active';
  }
  if (stored === 'ready' || stored === 'active') return stored;
  if (teams.some((t) => t.advancement_source?.startsWith('S1-'))) return 'ready';
  // S1 finished — unlock Level 1B even if auto-progression has not updated DB yet.
  return 'ready';
}

/**
 * @param {Match[]} matches
 * @param {Partial<TierPyramidConfig>} [partialConfig]
 * @param {{ level1bStatus?: string }} [options]
 * @returns {PyramidTournamentStatus}
 */
export function derivePyramidTournamentStatus(matches, _partialConfig = {}, options = {}) {
  const hasLevel1 = matches.some((m) => m.round_type === 'S1' || m.round_type === 'S2');

  if (!hasLevel1) return 'Draft';

  const s1Done = isS1Complete(matches);
  const l1bStatus =
    options.level1bStatus ??
    deriveLevel1bStatus(matches, { level1b_status: options.level1bStatus });
  const hasL1B = hasRoundType(matches, 'Level 1B');
  const l1bDone = isLevel1BComplete(matches);

  if (!s1Done) return 'Level 1A Active';

  const l1bGatePassed =
    l1bDone ||
    l1bStatus === 'complete' ||
    hasRoundType(matches, 'Level 2') ||
    hasRoundType(matches, 'Level 3') ||
    hasRoundType(matches, 'Semi Final') ||
    hasRoundType(matches, 'Final');

  if (!l1bGatePassed) {
    if (!hasL1B) {
      if (l1bStatus === 'waiting') return 'Level 1B Waiting';
      if (l1bStatus === 'ready') return 'Level 1B Ready';
      return 'Level 1A Complete';
    }
    return 'Level 1B Active';
  }

  if (!hasRoundType(matches, 'Level 2')) return 'Level 1B Complete';

  const l2Done = isPyramidStageComplete(matches, 'Level 2');
  if (!l2Done) return 'Level 2 Active';
  if (!hasRoundType(matches, 'Level 3')) return 'Level 2 Complete';

  const l3Qf = getLevel3QuarterFinalMatches(matches);
  const l3Sf = getPyramidSemiFinalMatches(matches);
  const l3QfDone =
    l3Qf.length > 0 && l3Qf.every((m) => m.status === 'Completed' && m.winner_team_id);
  const l3SfDone =
    l3Sf.length >= 1 && l3Sf.every((m) => m.status === 'Completed' && m.winner_team_id);

  if (!l3QfDone) return 'Level 3 Active';
  if (l3Sf.length === 0) return 'Level 3 Complete';
  if (!l3SfDone) return 'Semifinals Active';
  if (!hasRoundType(matches, 'Final')) return 'Semifinals Complete';

  const finalMatch = matches.find((m) => m.round_type === 'Final');
  if (finalMatch?.status === 'Completed' && finalMatch.winner_team_id) {
    return 'Completed';
  }

  return 'Final Active';
}

export { PYRAMID_ROUND_TYPES };
