import 'dotenv/config';
import pool from '../utils/database.js';
import { truncateTournamentTablesWithPool } from '../utils/tournamentDataReset.js';
import {
  VALID_DIVISIONS,
  countPlayersByDivision,
} from '@shared/tournament/competitionFormat.js';
import { upsertAllSeedPlayers } from '../services/playerSeedService.js';
import { bootstrapPyramidTracksFromPlayers } from '../services/pyramidTeamSyncService.js';

const REQUIRED_TABLES = ['players', 'teams', 'matches', 'users'];

/**
 * Verify Supabase/PostgreSQL schema is applied.
 */
const ensureDatabaseAndTables = async () => {
  for (const table of REQUIRED_TABLES) {
    const [rows] = await pool.execute(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ?`,
      [table]
    );
    if (!rows.length) {
      throw new Error(
        `Table "${table}" not found. Run database migrations first: npm run db:migrate`
      );
    }
  }
  return true;
};

const safeExecute = async (query, params = []) => {
  try {
    return await pool.execute(query, params);
  } catch (error) {
    if (error.code === '42P01' || error.code === '3D000') {
      console.log('Database/table not found, checking schema...');
      await ensureDatabaseAndTables();
      return await pool.execute(query, params);
    }
    throw error;
  }
};

const sanitizeSeedError = (error) => {
  if (!error) return 'An error occurred';
  let message = typeof error === 'string' ? error : error.message || 'An error occurred';

  message = message.replace(/table_tennis_tournament/gi, 'database');
  message = message.replace(/\b(players|teams|matches|statistics|match_details)\b/gi, 'table');
  message = message.replace(/relation\s+"?[\w_]+"?\s+does not exist/gi, 'Required table does not exist');
  message = message.replace(/Unknown column\s+['"]?[\w_]+['"]?\s+in/gi, 'Unknown column in');
  message = message.replace(/\s+/g, ' ').trim();

  return message;
};

const insertSamplePlayers = async () => {
  const { playersCreated } = await upsertAllSeedPlayers(pool);
  return playersCreated;
};

const summarizePlayersByDivision = (players) => countPlayersByDivision(players);

export const seedPlayers = async (req, res, next) => {
  try {
    const { clearExisting = true } = req.body ?? {};

    await ensureDatabaseAndTables();

    if (clearExisting) {
      await truncateTournamentTablesWithPool(pool, { includePlayers: true });
    }

    const playersCreated = await insertSamplePlayers();
    await bootstrapPyramidTracksFromPlayers(pool);

    const [players] = await safeExecute(
      'SELECT id, name, category, expertise_level, pyramid_tier FROM players WHERE is_active = TRUE ORDER BY id'
    );

    const divisionCounts = summarizePlayersByDivision(players);

    /** @type {Record<string, number>} */
    const possibleTeams = {};
    for (const division of VALID_DIVISIONS) {
      const count = Number(divisionCounts[division] || 0);
      possibleTeams[division] = Math.floor(count / 2);
    }

    const workflow = [
      'Review and edit players on the Players page',
      'Generate teams on the Teams page',
      'Create match schedules on the Matches page',
    ];

    res.json({
      success: true,
      message:
        `Player seeding completed. ${playersCreated > 0 ? `${playersCreated} players created. ` : ''}` +
        `Active players by division: ${VALID_DIVISIONS.map((d) => `${d}: ${divisionCounts[d] || 0}`).join(', ')}.`,
      data: {
        playersCreated,
        divisionCounts,
        possibleTeams,
        workflow,
        players,
      },
    });
  } catch (error) {
    next(Object.assign(new Error(sanitizeSeedError(error)), { statusCode: 500 }));
  }
};

export const seedTeamsAndMatches = seedPlayers;

export { ensureDatabaseAndTables };
