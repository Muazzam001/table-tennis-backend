// Regenerate Tier Pyramid Level 1 schedule with round-robin group scheduling.
// Usage: npm run regenerate:pyramid-schedule

import pool from '../utils/database.js';
import { ensureDatabaseAndTables } from '../controllers/seedController.js';
import { generateTierPyramidLevel1Schedule } from '../services/tierPyramidService.js';
import { assertNoConcurrentTeamMatches } from '@shared/tournament/roundRobinScheduling.js';

const division = 'Men';
const startDate = process.argv.find((a) => a.startsWith('--start='))?.split('=')[1] ?? '2026-07-02';
const endDate = process.argv.find((a) => a.startsWith('--end='))?.split('=')[1] ?? '2026-07-31';

const main = async () => {
  console.log(`\n🏓 Regenerating Tier Pyramid Level 1 schedule (${division})...\n`);
  await ensureDatabaseAndTables();

  const schedule = await generateTierPyramidLevel1Schedule(pool, {
    division,
    startDate,
    endDate,
    venue: 'Main Court',
    replaceExisting: true,
  });

  assertNoConcurrentTeamMatches(schedule.matches);

  console.log(`Matches: ${schedule.matches.length} (S1: ${schedule.matchCounts.s1}, S2: ${schedule.matchCounts.s2})`);
  console.log(`First: ${schedule.matches[0]?.scheduled_date}`);
  console.log(`Last:  ${schedule.matches[schedule.matches.length - 1]?.scheduled_date}`);
  console.log('\n✅ No player double-booked at the same time.');
  console.log('S1 pools share weekdays: 3 matches per group per day (12 total), one round per group.\n');

  await pool.end();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
