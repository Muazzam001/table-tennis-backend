import {
  getQualifiedTeams,
  generateCrossoverQuarterFinalPairings,
  generateLegacyQuarterFinalPairings,
  generateSemiFinalPairings,
  generateFinalPairing,
  generateThirdPlacePairing,
  getNextKnockoutRound,
  scheduleFixtures,
  calculateGroupStandings,
} from '../../shared/tournament/index.js';
import {
  getLeagueMatches,
  getGroupsFromMatches,
  detectFormat,
  normalizePairing,
} from './tournamentService.js';
import { formatDateForMySQL, getNextTimeSlot } from '../../shared/tournament/scheduling.js';

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {object[]} matches
 * @param {string} league
 * @param {string} [startDate]
 * @param {string} [venue]
 */
async function insertKnockoutMatches(db, matchDefs, league, startDate, venue) {
  let currentDate = getNextTimeSlot(new Date(startDate || new Date()));
  const created = [];

  for (const def of matchDefs) {
    const normalized = normalizePairing({
      team1: { id: def.team1_id ?? def.team1.id },
      team2: { id: def.team2_id ?? def.team2.id },
      round_type: def.round_type,
      label: def.label,
    });

    const scheduled = formatDateForMySQL(currentDate);
    const [result] = await db.execute(
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, league) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [normalized.team1_id, normalized.team2_id, scheduled, venue || 'Main Court', def.round_type, null, league]
    );

    created.push({ id: result.insertId, ...normalized, scheduled_date: scheduled, venue: venue || 'Main Court', league });
    currentDate = getNextTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
  }

  return created;
}

/**
 * Auto-generate next knockout round when prior round is complete.
 * @param {import('mysql2/promise').Pool} db
 * @param {string} league
 */
export async function tryAutoProgressKnockout(db, league) {
  const matches = await getLeagueMatches(db, league);
  const nextRound = getNextKnockoutRound(matches);
  if (!nextRound) return { progressed: false };

    const groups = await getGroupsFromMatches(db, league);
    const format = detectFormat(matches, groups);
  const venue = 'Main Court';
  const startDate = new Date().toISOString().split('T')[0];

  if (nextRound === 'quarter-finals') {
    const existing = matches.filter((m) => m.round_type === 'Quarter Final');
    if (existing.length > 0) return { progressed: false };

    const groupOrder = Object.keys(groups).sort();
    const qualifiersPerGroup = format === 'pools-2' ? 4 : 2;
    const qualified = getQualifiedTeams(groups, matches, qualifiersPerGroup);

    const pairings =
      format === 'pools-2'
        ? generateLegacyQuarterFinalPairings(qualified.A || [], qualified.B || [])
        : generateCrossoverQuarterFinalPairings(qualified, groupOrder);

    const defs = pairings.map((p) => ({
      label: p.label,
      team1: p.team1,
      team2: p.team2,
      round_type: 'Quarter Final',
    }));

    const created = await insertKnockoutMatches(db, defs, league, startDate, venue);
    return { progressed: true, round: 'Quarter Final', matches: created };
  }

  if (nextRound === 'semi-finals') {
    const existing = matches.filter((m) => m.round_type === 'Semi Final');
    if (existing.length > 0) return { progressed: false };

    const qf = matches.filter((m) => m.round_type === 'Quarter Final');
    const pairings = generateSemiFinalPairings(qf);
    const defs = pairings.map((p) => ({
      label: p.label,
      team1: p.team1,
      team2: p.team2,
      round_type: 'Semi Final',
    }));

    const created = await insertKnockoutMatches(db, defs, league, startDate, venue);
    return { progressed: true, round: 'Semi Final', matches: created };
  }

  if (nextRound === 'final' || nextRound === 'third-place') {
    const sf = matches.filter((m) => m.round_type === 'Semi Final');
    const created = [];

    const existingFinal = matches.filter((m) => m.round_type === 'Final');
    if (existingFinal.length === 0) {
      const finalPairing = generateFinalPairing(sf);
      const finalMatches = await insertKnockoutMatches(
        db,
        [{ ...finalPairing, round_type: 'Final' }],
        league,
        startDate,
        venue
      );
      created.push(...finalMatches);
    }

    const refreshed = await getLeagueMatches(db, league);
    const existingThird = refreshed.filter((m) => m.round_type === 'Third Place');
    if (existingThird.length === 0) {
      const thirdPairing = generateThirdPlacePairing(sf);
      const thirdMatches = await insertKnockoutMatches(
        db,
        [{ ...thirdPairing, round_type: 'Third Place' }],
        league,
        startDate,
        venue
      );
      created.push(...thirdMatches);
    }

    if (created.length === 0) return { progressed: false };
    return { progressed: true, round: 'Final & Third Place', matches: created };
  }

  return { progressed: false };
}
