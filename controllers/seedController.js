import 'dotenv/config';
import mysql from 'mysql2/promise';
import pool from '../utils/database.js';
import { truncateTournamentTablesWithPool } from '../utils/tournamentDataReset.js';
import {
  VALID_DIVISIONS,
  countPlayersByDivision,
} from '@shared/tournament/competitionFormat.js';
import { upsertAllSeedPlayers } from '../services/playerSeedService.js';
import { bootstrapPyramidTracksFromPlayers } from '../services/pyramidTeamSyncService.js';

// Helper function to migrate existing tables (add missing columns)
// This ensures old databases get updated with new columns
const migrateExistingTables = async (connection, dbName) => {
  try {
    // Check if matches table exists
    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'matches'`,
      [dbName]
    );

    if (tables.length === 0) {
      // Table doesn't exist, CREATE TABLE already handled it
      return;
    }

    // Table exists, check for missing columns and add them
    const migrations = [
      {
        column: 'round_type',
        sql: `ALTER TABLE matches ADD COLUMN round_type ENUM('Qualifying', 'Quarter Final', 'Semi Final', 'Final') DEFAULT 'Qualifying' AFTER status`
      },
      {
        column: 'pool',
        sql: `ALTER TABLE matches ADD COLUMN pool ENUM('A', 'B') NULL AFTER round_type`
      },
      {
        column: 'is_abandoned',
        sql: `ALTER TABLE matches ADD COLUMN is_abandoned BOOLEAN DEFAULT FALSE AFTER winner_team_id`
      },
      {
        column: 'abandoned_reason',
        sql: `ALTER TABLE matches ADD COLUMN abandoned_reason TEXT NULL AFTER is_abandoned`
      },
      {
        column: 'category',
        table: 'players',
        sql: `ALTER TABLE players ADD COLUMN category ENUM('Men', 'Women') DEFAULT 'Men' AFTER expertise_level`
      },
      {
        column: 'pyramid_tier',
        table: 'players',
        sql: `ALTER TABLE players ADD COLUMN pyramid_tier TINYINT UNSIGNED NULL COMMENT '1, 2, or 3 for tier-pyramid eligibility' AFTER category`
      },
      {
        column: 'division',
        table: 'teams',
        sql: `ALTER TABLE teams ADD COLUMN division ENUM('Expert', 'Intermediate', 'Women') NOT NULL DEFAULT 'Expert' AFTER player2_id`
      },
      {
        column: 'division',
        table: 'matches',
        sql: `ALTER TABLE matches ADD COLUMN division ENUM('Expert', 'Intermediate', 'Women') NOT NULL DEFAULT 'Expert' AFTER pool`
      }
    ];

    // Extend pool and round_type enums for 4-group tournament + third place
    try {
      await connection.query(
        `ALTER TABLE matches MODIFY COLUMN pool VARCHAR(5) NULL`
      );
    } catch (e) {
      // May fail if already migrated
    }
    try {
      await connection.query(
        `ALTER TABLE matches MODIFY COLUMN round_type ENUM('Qualifying', 'Quarter Final', 'Semi Final', 'Final', 'Third Place') DEFAULT 'Qualifying'`
      );
    } catch (e) {
      // May fail if already migrated
    }

    for (const migration of migrations) {
      try {
        const tableName = migration.table || 'matches';
        const [columns] = await connection.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
          [dbName, tableName, migration.column]
        );

        if (columns.length === 0) {
          console.log(`Adding missing column: ${migration.column} to ${tableName}`);
          await connection.query(migration.sql);

          // Add indexes for specific columns
          if (migration.column === 'round_type') {
            try {
              await connection.query(`ALTER TABLE matches ADD INDEX idx_round_type (round_type)`);
            } catch (e) {
              // Index might already exist
            }
          }
          if (migration.column === 'pool') {
            try {
              await connection.query(`ALTER TABLE matches ADD INDEX idx_pool (pool)`);
            } catch (e) {
              // Index might already exist
            }
          }
          if (migration.column === 'category') {
            try {
              await connection.query(`ALTER TABLE players ADD INDEX idx_category (category)`);
            } catch (e) {
              // Index might already exist
            }
          }
          if (migration.column === 'pyramid_tier') {
            try {
              await connection.query(`ALTER TABLE players ADD INDEX idx_pyramid_tier (pyramid_tier)`);
            } catch (e) {
              // Index might already exist
            }
          }
          if (migration.column === 'division' && tableName === 'teams') {
            try {
              await connection.query(`ALTER TABLE teams ADD INDEX idx_division (division)`);
            } catch (e) {
              // Index might already exist
            }
          }
          if (migration.column === 'division' && tableName === 'matches') {
            try {
              await connection.query(`ALTER TABLE matches ADD INDEX idx_division (division)`);
            } catch (e) {
              // Index might already exist
            }
          }
        }
      } catch (error) {
        console.error(`Error migrating column ${migration.column}:`, error.message);
        // Continue with other migrations
      }
    }

    // Add unique constraint to prevent duplicate matches (if it doesn't exist)
    try {
      const [constraints] = await connection.query(
        `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'matches' AND CONSTRAINT_NAME = 'unique_match_teams_round_pool'`,
        [dbName]
      );

      if (constraints.length === 0) {
        console.log('Adding unique constraint to prevent duplicate matches');
        // Note: This constraint only works if teams are stored in consistent order
        // Our application logic handles the reverse order case
        await connection.query(
          `ALTER TABLE matches ADD UNIQUE KEY unique_match_teams_round_pool (team1_id, team2_id, round_type, pool)`
        );
      }
    } catch (error) {
      // Constraint might fail if duplicates already exist - that's okay, app logic will handle it
      console.log('Note: Could not add unique constraint (may already exist or duplicates present):', error.message);
    }
  } catch (error) {
    console.error('Error during table migration:', error.message);
    // Don't fail the whole setup if migration fails
  }
};

// Helper function to get user-friendly error message
const getConnectionErrorMessage = (error) => {
  if (!error) return 'Unknown connection error';

  const errorCode = error.code || '';
  const errorMessage = error.message || '';

  // Check for specific MySQL error codes
  if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
    return 'MySQL server is not running. Please start MySQL service and try again.';
  }

  if (errorCode === 'ETIMEDOUT' || errorMessage.includes('ETIMEDOUT')) {
    return 'Connection timeout. Please check if MySQL server is running and accessible.';
  }

  if (errorCode === 'ER_ACCESS_DENIED_ERROR' || errorMessage.includes('Access denied')) {
    return 'Access denied. Please check your database username and password in backend/.env file.';
  }

  if (errorCode === 'ER_BAD_DB_ERROR' || errorMessage.includes("Unknown database")) {
    return 'Database does not exist. The system will try to create it.';
  }

  if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
    return 'Cannot connect to MySQL server. Please check the host address in backend/.env file.';
  }

  // Generic error
  return 'Failed to connect to MySQL. Please verify your database configuration in backend/.env file.';
};

// Helper function to ensure database and tables exist
export const ensureDatabaseAndTables = async () => {
  let connection = null;
  try {
    // Validate required environment variables
    const dbName = process.env.DB_NAME;
    const dbHost = process.env.DB_HOST;
    const dbPortStr = process.env.DB_PORT;
    const dbUser = process.env.DB_USER;
    const dbPass = process.env.DB_PASS;

    // Check for missing variables
    const missingVars = [];
    if (!dbHost) missingVars.push('DB_HOST');
    if (!dbPortStr) missingVars.push('DB_PORT');
    if (!dbUser) missingVars.push('DB_USER');
    if (dbPass === undefined || dbPass === null) missingVars.push('DB_PASS'); // Allow empty string
    if (!dbName) missingVars.push('DB_NAME');

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}. Please set them in your .env file.`);
    }

    // Validate and parse port
    const dbPort = parseInt(dbPortStr);
    if (isNaN(dbPort) || dbPort <= 0 || dbPort > 65535) {
      throw new Error(`Invalid DB_PORT value: "${dbPortStr}". Must be a number between 1 and 65535.`);
    }

    console.log(`Attempting to connect to MySQL at ${dbHost}:${dbPort} as ${dbUser}...`);

    // Create connection without database
    try {
      connection = await mysql.createConnection({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPass || '', // Allow empty password
        multipleStatements: true,
        connectTimeout: 10000 // 10 second timeout
      });
      console.log('MySQL connection established successfully');
    } catch (connError) {
      const friendlyMessage = getConnectionErrorMessage(connError);
      console.error('MySQL connection failed:', connError.message);
      throw new Error(friendlyMessage);
    }

    // Create database if it doesn't exist
    // Note: CREATE DATABASE and USE cannot be used with prepared statements (execute)
    // Must use query() instead
    try {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
      await connection.query(`USE \`${dbName}\``);
      console.log(`Database '${dbName}' ready`);
    } catch (error) {
      console.error('Error creating/using database:', error.message);
      const friendlyMessage = getConnectionErrorMessage(error);
      throw new Error(friendlyMessage);
    }

    // Create tables if they don't exist
    const tables = [
      `CREATE TABLE IF NOT EXISTS players (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        expertise_level ENUM('Beginner', 'Intermediate', 'Expert') NOT NULL DEFAULT 'Beginner',
        category ENUM('Men', 'Women') DEFAULT 'Men',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_expertise (expertise_level),
        INDEX idx_category (category),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS teams (
        id INT PRIMARY KEY AUTO_INCREMENT,
        team_name VARCHAR(100) NOT NULL,
        player1_id INT NOT NULL,
        player2_id INT NOT NULL,
        division ENUM('Men', 'Women') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_team (player1_id, player2_id),
        INDEX idx_player1 (player1_id),
        INDEX idx_player2 (player2_id),
        INDEX idx_division (division),
        FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE CASCADE,
        FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS matches (
        id INT PRIMARY KEY AUTO_INCREMENT,
        team1_id INT NOT NULL,
        team2_id INT NOT NULL,
        scheduled_date DATETIME NOT NULL,
        venue VARCHAR(100),
        status ENUM('Scheduled', 'In Progress', 'Completed', 'Cancelled') DEFAULT 'Scheduled',
        round_type ENUM('Qualifying', 'Quarter Final', 'Semi Final', 'Final', 'Third Place') DEFAULT 'Qualifying',
        pool VARCHAR(5) NULL,
        division ENUM('Men', 'Women') NOT NULL,
        winner_team_id INT NULL,
        score_team1 INT DEFAULT 0,
        score_team2 INT DEFAULT 0,
        is_abandoned BOOLEAN DEFAULT FALSE,
        abandoned_reason TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_team1 (team1_id),
        INDEX idx_team2 (team2_id),
        INDEX idx_winner (winner_team_id),
        INDEX idx_scheduled_date (scheduled_date),
        INDEX idx_status (status),
        INDEX idx_round_type (round_type),
        INDEX idx_pool (pool),
        INDEX idx_division (division),
        UNIQUE KEY unique_match_teams_round_pool (team1_id, team2_id, round_type, pool),
        FOREIGN KEY (team1_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (team2_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (winner_team_id) REFERENCES teams(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS statistics (
        id INT PRIMARY KEY AUTO_INCREMENT,
        player_id INT NOT NULL,
        team_id INT NOT NULL,
        matches_played INT DEFAULT 0,
        matches_won INT DEFAULT 0,
        matches_lost INT DEFAULT 0,
        total_points_scored INT DEFAULT 0,
        total_points_conceded INT DEFAULT 0,
        win_percentage DECIMAL(5,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_player (player_id),
        INDEX idx_team (team_id),
        UNIQUE KEY unique_player_team (player_id, team_id),
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_email (email),
        INDEX idx_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ];

    for (const tableQuery of tables) {
      try {
        // Use query() for DDL statements (CREATE TABLE)
        await connection.query(tableQuery);
      } catch (error) {
        console.error('Error creating table:', error.message);
        // Continue with other tables
      }
    }

    // Check and migrate existing tables if they're missing columns
    // This handles cases where tables exist but are missing new columns
    await migrateExistingTables(connection, dbName);

    await connection.end();
    return true;
  } catch (error) {
    if (connection) {
      try {
        await connection.end();
      } catch (e) {
        // Ignore
      }
    }
    throw error;
  }
};

// Helper function to safely execute query with automatic database setup
const safeExecute = async (query, params = []) => {
  try {
    return await pool.execute(query, params);
  } catch (error) {
    // If table doesn't exist, setup database and retry
    if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_DB_ERROR') {
      console.log('Database/table not found, setting up...');
      await ensureDatabaseAndTables();
      // Retry the query
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
  message = message.replace(/Table\s+['"]?[\w_]+['"]?\s+doesn't exist/gi, 'Required table does not exist');
  message = message.replace(/Unknown column\s+['"]?[\w_]+['"]?\s+in/gi, 'Unknown column in');
  message = message.replace(/ER_\w+/g, '');
  message = message.replace(/\s+/g, ' ').trim();

  return message;
};

const insertSamplePlayers = async () => {
  const { playersCreated } = await upsertAllSeedPlayers(pool);
  return playersCreated;
};

const summarizePlayersByDivision = (players) => countPlayersByDivision(players);

// Seed demo players only. Teams and matches are created from the frontend workflow.
export const seedPlayers = async (req, res, next) => {
  try {
    const { clearExisting = true } = req.body;

    // Ensure database and tables exist
    try {
      await ensureDatabaseAndTables();
    } catch (setupError) {
      console.error('Database setup error:', setupError.message);
      // setupError.message is already user-friendly from getConnectionErrorMessage
      const errorMessage = setupError.message || 'Failed to setup database. Please check MySQL connection and credentials.';
      return res.status(500).json({
        success: false,
        message: sanitizeSeedError(errorMessage),
        error: sanitizeSeedError(setupError.message)
      });
    }

    if (clearExisting) {
      try {
        await truncateTournamentTablesWithPool(pool, { includePlayers: true });
      } catch (error) {
        console.error('Error clearing existing data:', error.message);
      }
    }

    const playersCreated = await insertSamplePlayers();
    const pyramidBootstrap = await bootstrapPyramidTracksFromPlayers(pool);

    let players = [];
    try {
      [players] = await safeExecute(
        'SELECT id, name, expertise_level, category, pyramid_tier FROM players WHERE is_active = TRUE'
      );
    } catch (error) {
      console.error('Error fetching players:', error.message);
      return res.status(500).json({
        success: false,
        message: sanitizeSeedError('Failed to fetch players. Please verify database connection.'),
        error: sanitizeSeedError(error.message)
      });
    }

    if (players.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active players were created. Check sample player data and try again.',
      });
    }

    const divisionCounts = summarizePlayersByDivision(players);
    const possibleTeams = Object.fromEntries(
      VALID_DIVISIONS.map((division) => [
        division,
        Math.floor((divisionCounts[division] || 0) / 2),
      ])
    );

    const pyramidTrack = pyramidBootstrap.find((r) => r.division === 'Men');
    const workflow = pyramidTrack
      ? [
          'Review and edit player details on the Players page (pyramid tier is on each Men player)',
          'Men division is preset to Singles + Tier Pyramid — generate entrants on the Teams page',
          'Tier assignments sync automatically from player pyramid tiers when entrants are saved',
          'Open Matches → Men → generate Tier Pyramid Level 1 schedule',
          'For Women: generate doubles teams on the Teams page, then schedules on Matches',
        ]
      : [
          'Review and edit player details on the Players page',
          'Generate teams per division on the Teams page (even player counts required)',
          'Generate group-stage schedules on the Matches page after teams are saved',
          'Progress through Quarter Finals, Semi Finals, Final, and Third Place from Matches',
        ];

    res.status(201).json({
      success: true,
      message:
        `Player seeding completed. ${playersCreated > 0 ? `${playersCreated} players created. ` : ''}` +
        (pyramidTrack?.settingsConfigured
          ? 'Men division configured for tier pyramid. Generate singles entrants on the Teams page — tiers apply automatically.'
          : 'Edit players on the Players page, generate teams on the Teams page, then create schedules on the Matches page.'),
      data: {
        playersCreated,
        divisionCounts,
        possibleTeams,
        pyramidBootstrap,
        workflow,
      },
    });
  } catch (error) {
    console.error('Error seeding players:', error);
    next(error);
  }
};

/** @deprecated Use seedPlayers — kept for CLI compatibility */
export const seedTeamsAndMatches = seedPlayers;







