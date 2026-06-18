/**
 * @typedef {import('./types.ts').TournamentStatus} TournamentStatus
 * @typedef {import('./types.ts').Match} Match
 */

import { inferSingleGroupTeamCount } from './knockout.js';

/**
 * Derive tournament status from match data.
 * @param {Match[]} matches
 * @param {{ format?: string, teamCount?: number }} [context]
 * @returns {TournamentStatus}
 */
export function deriveTournamentStatus(matches, context = {}) {
  const qualifying = matches.filter((m) => m.round_type === 'Qualifying');
  if (qualifying.length === 0) return 'Draft';

  const qualifyingDone = qualifying.every((m) => m.status === 'Completed' && m.winner_team_id);
  if (!qualifyingDone) return 'Group Stage Active';

  const qf = matches.filter((m) => m.round_type === 'Quarter Final');
  const sf = matches.filter((m) => m.round_type === 'Semi Final');

  if (qf.length === 0) {
    if (sf.length === 0) {
      const hasDirectKnockout = matches.some(
        (m) => m.round_type === 'Final' || m.round_type === 'Third Place'
      );
      if (!hasDirectKnockout) return 'Group Stage Completed';
    } else {
      const sfDone = sf.every((m) => m.status === 'Completed' && m.winner_team_id);
      if (!sfDone) return 'Semifinals Active';
    }
  } else {
    const qfDone = qf.every((m) => m.status === 'Completed' && m.winner_team_id);
    if (!qfDone) return 'Quarterfinals Active';
    if (sf.length === 0) return 'Quarterfinals Active';
    const sfDone = sf.every((m) => m.status === 'Completed' && m.winner_team_id);
    if (!sfDone) return 'Semifinals Active';
  }

  const finals = matches.filter((m) => m.round_type === 'Final' || m.round_type === 'Third Place');
  if (finals.length === 0) return 'Semifinals Active';

  const finalMatch = matches.find((m) => m.round_type === 'Final');
  if (!finalMatch) return 'Final Active';

  if (finalMatch.status === 'Completed' && finalMatch.winner_team_id) {
    return 'Completed';
  }

  return 'Final Active';
}

/**
 * @param {Match[]} matches
 * @param {string} roundType
 */
export function isRoundComplete(matches, roundType) {
  const roundMatches = matches.filter((m) => m.round_type === roundType);
  if (roundMatches.length === 0) return false;
  return roundMatches.every((m) => m.status === 'Completed' && m.winner_team_id);
}

/**
 * Determine which knockout round should be generated next.
 * @param {Match[]} matches
 * @param {{ format?: string, teamCount?: number }} [context]
 * @returns {'quarter-finals' | 'semi-finals' | 'final' | 'third-place' | null}
 */
export function getNextKnockoutRound(matches, context = {}) {
  const status = deriveTournamentStatus(matches, context);

  if (status === 'Group Stage Completed') {
    const format = context.format;
    const teamCount = context.teamCount ?? inferSingleGroupTeamCount(matches, format);
    const hasFinal = matches.some((m) => m.round_type === 'Final');
    const hasThird = matches.some((m) => m.round_type === 'Third Place');
    if (format === 'single-group' && teamCount === 4 && hasFinal && !hasThird) return 'third-place';
    if (format === 'single-group' && teamCount === 4) return 'final';
    if (format === 'single-group' && teamCount === 6) return 'semi-finals';
    return 'quarter-finals';
  }

  const quarterFinals = matches.filter((m) => m.round_type === 'Quarter Final');
  if (status === 'Quarterfinals Active' && isRoundComplete(matches, 'Quarter Final')) {
    if (quarterFinals.length === 2) return 'final';
    if (quarterFinals.length === 4) return 'semi-finals';
  }

  const sfComplete = isRoundComplete(matches, 'Semi Final');
  const hasFinal = matches.some((m) => m.round_type === 'Final');
  const hasThird = matches.some((m) => m.round_type === 'Third Place');
  const format = context.format;
  const teamCount = context.teamCount ?? inferSingleGroupTeamCount(matches, format);

  if (sfComplete && !hasFinal) return 'final';
  if (sfComplete && hasFinal && !hasThird) return 'third-place';
  if (format === 'single-group' && teamCount === 4 && hasFinal && !hasThird) return 'third-place';

  return null;
}
