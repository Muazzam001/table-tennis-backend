// Seed Tier Pyramid roster (players + singles entrants + tier assignments)
// Usage: npm run seed:tier-pyramid
// Options: npm run seed:tier-pyramid -- --keep-existing

import { seedTierPyramidRoster } from '../services/tierPyramidSeedService.js';
import { ensureDatabaseAndTables } from '../controllers/seedController.js';

const keepExisting = process.argv.includes('--keep-existing');

const main = async () => {
  console.log('\n🏓 Seeding Tier Pyramid roster (Men division)...\n');
  await ensureDatabaseAndTables();
  const result = await seedTierPyramidRoster({ clearExisting: !keepExisting });

  console.log(`Division: ${result.division}`);
  console.log(`Players: ${result.playersTotal} (${result.playersCreated} newly created)`);
  console.log(`Singles entrants: ${result.teamsCreated}`);
  console.log(
    `Tiers: T1=${result.tierCounts[1]}/${result.expectedTierCounts[1]}, ` +
      `T2=${result.tierCounts[2]}/${result.expectedTierCounts[2]}, ` +
      `T3=${result.tierCounts[3]}/${result.expectedTierCounts[3]}`
  );

  if (result.missingTier3Players > 0) {
    console.log(`\n⚠️  Missing ${result.missingTier3Players} Tier 3 player(s) for full 32-player pyramid.`);
  }

  if (result.tiersAssigned) {
    console.log('\n✅ Tiers assigned. Next: Matches → Men → generate Level 1 schedule.');
  } else {
    console.log('\n⚠️  Tier assignment incomplete:');
    for (const err of result.tierErrors) {
      console.log(`   - ${err}`);
    }
    console.log('\nAdd the missing player(s), then assign tiers on the Matches page.');
  }

  if (result.tierErrors.length === 0 && !result.tiersAssigned) {
    console.log('   (No tier errors recorded — check team count.)');
  }

  process.exit(0);
};

main().catch((error) => {
  console.error('\n❌ Seed failed:', error.message);
  process.exit(1);
});
