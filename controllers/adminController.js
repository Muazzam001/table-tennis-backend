import pool from '../utils/database.js';
import { truncateTournamentTablesWithPool } from '../utils/tournamentDataReset.js';

/**
 * Reset all application data except the users table.
 * Truncates: statistics, matches, teams, players (AUTO_INCREMENT restarts at 1).
 */
export const resetApplicationData = async (req, res, next) => {
  try {
    const resetResult = await truncateTournamentTablesWithPool(pool, { includePlayers: true });
    console.log('Application data reset:', resetResult);

    res.json({
      success: true,
      message:
        'Application data reset successfully. Table IDs will start from 1 on next insert. Users table preserved.',
      data: {
        tablesCleared: resetResult.tablesCleared,
        tablesPreserved: ['users'],
        autoIncrementReset: resetResult.autoIncrementReset,
        verification: resetResult.verification,
      },
    });
  } catch (error) {
    next(error);
  }
};
