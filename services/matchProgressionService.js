import {
  getQualifiedTeams,
  getFullGroupStandings,
  generateFirstKnockoutPairings,
  generateFinalPairingFromQuarterFinals,
  generateSemiFinalPairings,
  generateFinalPairing,
  generateThirdPlacePairing,
  resolveThirdPlacePairing,
  getNextKnockoutRound,
  scheduleFixtures,
  calculateGroupStandings,
  resolveQualifiersPerGroup,
  inferSingleGroupTeamCount,
} from '@shared/tournament/index.js';
import {
  getDivisionMatches,
  getGroupsFromMatches,
  detectFormat,
  normalizePairing,
} from './tournamentService.js';
import { createMatchSlotCursor, resolveCourtConfig } from '@shared/tournament/scheduling.js';
import { getDivisionSettings } from './divisionSettingsService.js';
import { isTierPyramidFormat } from '@shared/tournament/formats/registry.js';
import { ensurePyramidThirdPlaceMatch } from './tierPyramidProgressionService.js';

/**
 * @param {import('mysql2/promise').Pool} db
 * @param {object[]} matchDefs
 * @param {string} division
 * @param {string} [startDate]
 * @param {Partial<import('@shared/tournament/scheduling.js').CourtConfig>} [courtConfigInput]
 */
async function insertKnockoutMatches(db, matchDefs, division, startDate, courtConfigInput = null) {
  const courtConfig = resolveCourtConfig(courtConfigInput);
  const slotCursor = createMatchSlotCursor(startDate || new Date(), undefined, courtConfig);
  const created = [];

  for (const def of matchDefs) {
    const normalized = normalizePairing({
      team1: { id: def.team1_id ?? def.team1.id },
      team2: { id: def.team2_id ?? def.team2.id },
      round_type: def.round_type,
      label: def.label,
    });

    const slot = slotCursor.getNext();
    const [result] = await db.execute(
      'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool, division) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [normalized.team1_id, normalized.team2_id, slot.scheduled_date, slot.venue, def.round_type, null, division]
    );

    created.push({
      id: result.insertId,
      ...normalized,
      scheduled_date: slot.scheduled_date,
      venue: slot.venue,
      division,
    });
  }

  return created;
}

/**
 * Create Third Place when Final exists but Third Place is missing.
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function ensureThirdPlaceMatch(db, division) {
  const settings = await getDivisionSettings(db, division);
  if (isTierPyramidFormat(settings.tournament_format)) {
    return ensurePyramidThirdPlaceMatch(db, division);
  }

  const matches = await getDivisionMatches(db, division);
  const hasFinal = matches.some((m) => m.round_type === 'Final');
  const hasThird = matches.some((m) => m.round_type === 'Third Place');
  if (!hasFinal || hasThird) return { created: false };

  const groups = await getGroupsFromMatches(db, division);
  const format = detectFormat(matches, groups);
  const teamCount =
    inferSingleGroupTeamCount(matches, format) ??
    Object.values(groups).reduce((sum, g) => sum + g.length, 0);
  const sf = matches.filter((m) => m.round_type === 'Semi Final');
  const qf = matches.filter((m) => m.round_type === 'Quarter Final');

  let standings = [];
  if (format === 'single-group' && teamCount === 4) {
    const groupOrder = Object.keys(groups).sort();
    standings = getFullGroupStandings(groups, matches, groupOrder[0]);
  }

  const thirdPairing = resolveThirdPlacePairing({
    semiFinals: sf,
    quarterFinals: qf,
    standings,
  });

  const courtConfig = { courtCount: 2, venueBase: 'Main Court' };
  const startDate = new Date().toISOString().split('T')[0];
  const created = await insertKnockoutMatches(
    db,
    [{ ...thirdPairing, round_type: 'Third Place' }],
    division,
    startDate,
    courtConfig
  );

  return { created: true, matches: created };
}

/**
 * Auto-generate next knockout round when prior round is complete.
 * @param {import('mysql2/promise').Pool} db
 * @param {string} division
 */
export async function tryAutoProgressKnockout(db, division) {
  const matches = await getDivisionMatches(db, division);
  const groups = await getGroupsFromMatches(db, division);
  const format = detectFormat(matches, groups);
  const teamCount =
    inferSingleGroupTeamCount(matches, format) ??
    Object.values(groups).reduce((sum, g) => sum + g.length, 0);
  const context = { format, teamCount };
  const nextRound = getNextKnockoutRound(matches, context);
  if (!nextRound) return { progressed: false };

  const courtConfig = { courtCount: 2, venueBase: 'Main Court' };
  const startDate = new Date().toISOString().split('T')[0];

  if (nextRound === 'quarter-finals' || nextRound === 'semi-finals' || nextRound === 'final') {
    const existingQf = matches.filter((m) => m.round_type === 'Quarter Final');
    const existingSf = matches.filter((m) => m.round_type === 'Semi Final');
    const existingFinal = matches.filter((m) => m.round_type === 'Final');

    if (nextRound === 'quarter-finals' && existingQf.length > 0) return { progressed: false };
    if (nextRound === 'semi-finals' && existingSf.length > 0) return { progressed: false };
    if (nextRound === 'final' && existingFinal.length > 0 && nextRound !== 'third-place') {
      // allow final generation below
    }

    if (nextRound === 'quarter-finals' || (nextRound === 'semi-finals' && format === 'single-group')) {
      const groupOrder = Object.keys(groups).sort();
      const qualifiersPerGroup = resolveQualifiersPerGroup(teamCount, groupOrder.length, format);
      const qualified = getQualifiedTeams(groups, matches, qualifiersPerGroup);
      const { roundType, pairings } = generateFirstKnockoutPairings(
        qualified,
        groupOrder,
        format,
        teamCount
      );

      const defs = pairings.map((p) => ({
        label: p.label,
        team1: p.team1,
        team2: p.team2,
        round_type: roundType,
      }));

      const created = await insertKnockoutMatches(db, defs, division, startDate, courtConfig);
      return { progressed: true, round: roundType, matches: created };
    }
  }

  if (nextRound === 'quarter-finals') {
    return { progressed: false };
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

    const created = await insertKnockoutMatches(db, defs, division, startDate, courtConfig);
    return { progressed: true, round: 'Semi Final', matches: created };
  }

  if (nextRound === 'final' || nextRound === 'third-place') {
    const sf = matches.filter((m) => m.round_type === 'Semi Final');
    const qf = matches.filter((m) => m.round_type === 'Quarter Final');
    const created = [];

    const existingFinal = matches.filter((m) => m.round_type === 'Final');
    if (existingFinal.length === 0) {
      let finalPairing;
      if (sf.length >= 2) {
        finalPairing = generateFinalPairing(sf);
      } else if (format === 'single-group' && teamCount === 4) {
        const groupOrder = Object.keys(groups).sort();
        const qualifiersPerGroup = resolveQualifiersPerGroup(teamCount, groupOrder.length, format);
        const qualified = getQualifiedTeams(groups, matches, qualifiersPerGroup);
        finalPairing = generateFirstKnockoutPairings(
          qualified,
          groupOrder,
          format,
          teamCount
        ).pairings[0];
      } else if (qf.length === 2) {
        finalPairing = generateFinalPairingFromQuarterFinals(qf);
      } else {
        return { progressed: false };
      }

      const finalMatches = await insertKnockoutMatches(
        db,
        [{ ...finalPairing, round_type: 'Final' }],
        division,
        startDate,
        courtConfig
      );
      created.push(...finalMatches);
    }

    const refreshed = await getDivisionMatches(db, division);
    const existingThird = refreshed.filter((m) => m.round_type === 'Third Place');
    if (existingThird.length === 0) {
      let standings = [];
      if (format === 'single-group' && teamCount === 4) {
        const groupOrder = Object.keys(groups).sort();
        standings = getFullGroupStandings(groups, matches, groupOrder[0]);
      }

      const thirdPairing = resolveThirdPlacePairing({
        semiFinals: sf,
        quarterFinals: qf,
        standings,
      });
      const thirdMatches = await insertKnockoutMatches(
        db,
        [{ ...thirdPairing, round_type: 'Third Place' }],
        division,
        startDate,
        courtConfig
      );
      created.push(...thirdMatches);
    }

    if (created.length === 0) return { progressed: false };
    return { progressed: true, round: 'Final & Third Place', matches: created };
  }

  return { progressed: false };
}
