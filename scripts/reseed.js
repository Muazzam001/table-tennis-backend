// Reseed demo players only
// Usage: npm run reseed
// Options: npm run reseed -- --keep-existing

import 'dotenv/config';
import { seedPlayers } from '../controllers/seedController.js';

const printHelp = () => {
  console.log(`
Reseed demo players for the Table Tennis Tournament app.

Teams and matches are not created by this script. After reseeding:
  1. Edit players on the Players page
  2. Generate teams on the Teams page
  3. Create schedules on the Matches page

Usage:
  npm run reseed
  npm run reseed -- [options]

Options:
  --keep-existing   Do not clear existing data before seeding
  -h, --help        Show this help message

Examples:
  npm run reseed
  npm run reseed -- --keep-existing
`);
};

const hasFlag = (flag) => process.argv.includes(flag);

if (hasFlag('--help') || hasFlag('-h')) {
  printHelp();
  process.exit(0);
}

const run = async () => {
  const body = {
    clearExisting: !hasFlag('--keep-existing'),
  };

  console.log('\n🌱 Reseeding demo players...');
  console.log(`   Clear existing: ${body.clearExisting}`);

  const req = { body };

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      if (payload.success) {
        console.log(`\n✅ ${payload.message}`);
        if (payload.data) {
          const { playersCreated, divisionCounts, possibleTeams } = payload.data;
          if (playersCreated > 0) console.log(`   Players created: ${playersCreated}`);
          if (divisionCounts) {
            console.log(
              `   Totals: ${divisionCounts.total} (Expert Men: ${divisionCounts.expertMen}, Intermediate: ${divisionCounts.intermediateMen}, Women: ${divisionCounts.women})`
            );
          }
          if (possibleTeams?.Expert) {
            console.log(`   Possible Expert teams: ${possibleTeams.Expert}`);
          }
        }
        process.exit(0);
      }

      console.error(`\n❌ ${payload.message || 'Reseed failed'}`);
      if (payload.error) {
        console.error(`   ${payload.error}`);
      }
      process.exit(this.statusCode >= 400 ? 1 : 1);
    },
  };

  const next = (error) => {
    console.error('\n❌ Reseed failed:', error?.message || error);
    process.exit(1);
  };

  await seedPlayers(req, res, next);
};

run().catch((error) => {
  console.error('\n❌ Reseed failed:', error.message);
  process.exit(1);
});
