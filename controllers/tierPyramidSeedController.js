import { seedTierPyramidRoster } from '../services/tierPyramidSeedService.js';
import { ensureDatabaseAndTables } from './seedController.js';

export const seedTierPyramid = async (req, res, next) => {
  try {
    const { clearExisting = true } = req.body ?? {};

    await ensureDatabaseAndTables();
    const data = await seedTierPyramidRoster({ clearExisting });

    const status = data.tiersAssigned ? 201 : 200;
    res.status(status).json({
      success: true,
      message: data.tiersAssigned
        ? `Tier Pyramid roster seeded for ${data.division} (${data.teamsCreated} entrants, tiers assigned).`
        : `Tier Pyramid roster seeded for ${data.division} (${data.teamsCreated} entrants). ` +
          (data.missingTier3Players > 0
            ? `Add ${data.missingTier3Players} Tier 3 player(s) to reach ${data.expectedTierCounts[1] + data.expectedTierCounts[2] + data.expectedTierCounts[3]} total.`
            : 'Tier assignment pending — check tier errors.'),
      data,
    });
  } catch (error) {
    console.error('Error seeding tier pyramid roster:', error);
    next(error);
  }
};
