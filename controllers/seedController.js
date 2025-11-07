import pool from '../utils/database.js';
import mysql from 'mysql2/promise';
import 'dotenv/config';

// Sample player data for seeding (from seed.sql)
const SAMPLE_PLAYERS = {
  expert: [
    { name: 'Zafar A', email: 'zafar.a@ebitlogix.com' },
    { name: 'Zaigham B', email: 'zaigham.b@ebitlogix.com' },
    { name: 'Waheed A', email: 'waheed.a@ebitlogix.com' },
    { name: 'Mahboob H', email: 'mahboob.h@ebitlogix.com' },
    { name: 'Kashif T', email: 'kashif.t@ebitlogix.com' },
    { name: 'Basalat A', email: 'basalat.a@ebitlogix.com' },
    { name: 'Ali R', email: 'ali.r@ebitlogix.com' },
    { name: 'Bilal S', email: 'bilal.s@ebitlogix.com' },
    { name: 'Shahrukh K', email: 'shahrukh.k@ebitlogix.com' },
    { name: 'Uzair A', email: 'uzair.a@ebitlogix.com' },
    { name: 'Mehroz K', email: 'mehroz.k@ebitlogix.com' },
    { name: 'Muazzam Y', email: 'muazzam.y@ebitlogix.com' },
    { name: 'Ghulam D', email: 'ghulam.d@ebitlogix.com' },
    { name: 'Ramzan K', email: 'ramzan.k@ebitlogix.com' }
  ],
  intermediate: [
    { name: 'M Arshad', email: 'm.arshad@ebitlogix.com' },
    { name: 'Aqib M', email: 'aqib.m@ebitlogix.com' },
    { name: 'Salman M', email: 'salman.m@ebitlogix.com' },
    { name: 'Zeeshan F', email: 'zeeshan.f@ebitlogix.com' },
    { name: 'Haroon R', email: 'haroon.r@ebitlogix.com' },
    { name: 'M Hamza QA', email: 'hamza.qa@ebitlogix.com' },
    { name: 'M Inamullah', email: 'm.inamullah@ebitlogix.com' },
    { name: 'Ahmad T', email: 'ahmad.t@ebitlogix.com' },
    { name: 'M Naseem', email: 'm.naseem@ebitlogix.com' },
    { name: 'M Arslan QA', email: 'arslan.qa@ebitlogix.com' },
    { name: 'Usama S', email: 'usama.s@ebitlogix.com' },
    { name: 'Zaeem A', email: 'zaeem.a@ebitlogix.com' },
    { name: 'M Arslan BD', email: 'arslan.bd@ebitlogix.com' },
    { name: 'Osaid M', email: 'osaid.m@ebitlogix.com' }
  ]
};

// Helper function to format date for MySQL (YYYY-MM-DD HH:MM:SS)
const formatDateForMySQL = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Helper function to check if a date is a weekend (Saturday = 6, Sunday = 0)
const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
};

// Helper function to skip weekends and move to next weekday
const skipWeekends = (date) => {
  let currentDate = new Date(date);
  while (isWeekend(currentDate)) {
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return currentDate;
};

// Helper function to get next available time slot (7PM-10PM, 30-minute intervals)
// Excludes weekends (Saturday and Sunday)
const getNextTimeSlot = (currentDate) => {
  let slot = new Date(currentDate);

  // Skip weekends first
  slot = skipWeekends(slot);

  const currentHour = slot.getHours();
  const currentMinute = slot.getMinutes();

  if (currentHour < 19) {
    slot.setHours(19, 0, 0, 0);
    // Check if this is a weekend after setting time
    if (isWeekend(slot)) {
      slot.setDate(slot.getDate() + 1);
      slot = skipWeekends(slot);
      slot.setHours(19, 0, 0, 0);
    }
    return slot;
  }

  if (currentHour >= 22) {
    slot.setDate(slot.getDate() + 1);
    slot = skipWeekends(slot);
    slot.setHours(19, 0, 0, 0);
    return slot;
  }

  let nextHour = currentHour;
  let nextMinute = 0;

  if (currentMinute < 30) {
    nextMinute = 30;
  } else {
    nextMinute = 0;
    nextHour += 1;
  }

  if (nextHour >= 22) {
    slot.setDate(slot.getDate() + 1);
    slot = skipWeekends(slot);
    slot.setHours(19, 0, 0, 0);
    return slot;
  }

  slot.setHours(nextHour, nextMinute, 0, 0);
  return slot;
};

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
      }
    ];

    for (const migration of migrations) {
      try {
        const [columns] = await connection.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'matches' AND COLUMN_NAME = ?`,
          [dbName, migration.column]
        );

        if (columns.length === 0) {
          console.log(`Adding missing column: ${migration.column}`);
          await connection.query(migration.sql);

          // Add index for round_type and pool if they were just added
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
const ensureDatabaseAndTables = async () => {
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
        expertise_level ENUM('Intermediate', 'Expert') NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_expertise (expertise_level),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS teams (
        id INT PRIMARY KEY AUTO_INCREMENT,
        team_name VARCHAR(100) NOT NULL,
        player1_id INT NOT NULL,
        player2_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_team (player1_id, player2_id),
        INDEX idx_player1 (player1_id),
        INDEX idx_player2 (player2_id),
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
        round_type ENUM('Qualifying', 'Quarter Final', 'Semi Final', 'Final') DEFAULT 'Qualifying',
        pool ENUM('A', 'B') NULL,
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

// Seed players, teams and matches for demo purposes
// This function will automatically setup database if needed
export const seedTeamsAndMatches = async (req, res, next) => {
  try {
    const { startDate, endDate, venue, clearExisting, seedPlayers } = req.body;

    // Helper function to sanitize error messages
    const sanitizeError = (error) => {
      if (!error) return 'An error occurred';
      let message = typeof error === 'string' ? error : error.message || 'An error occurred';

      // Remove database/table names
      message = message.replace(/table_tennis_tournament/gi, 'database');
      message = message.replace(/\b(players|teams|matches|statistics|match_details)\b/gi, 'table');
      message = message.replace(/Table\s+['"]?[\w_]+['"]?\s+doesn't exist/gi, 'Required table does not exist');
      message = message.replace(/Unknown column\s+['"]?[\w_]+['"]?\s+in/gi, 'Unknown column in');
      message = message.replace(/ER_\w+/g, '');
      message = message.replace(/\s+/g, ' ').trim();

      return message;
    };

    // Ensure database and tables exist
    try {
      await ensureDatabaseAndTables();
    } catch (setupError) {
      console.error('Database setup error:', setupError.message);
      // setupError.message is already user-friendly from getConnectionErrorMessage
      const errorMessage = setupError.message || 'Failed to setup database. Please check MySQL connection and credentials.';
      return res.status(500).json({
        success: false,
        message: sanitizeError(errorMessage),
        error: sanitizeError(setupError.message)
      });
    }

    let playersCreated = 0;

    // Step 1: Seed players if requested or if no players exist
    let existingPlayers = [];
    try {
      [existingPlayers] = await safeExecute(
        'SELECT id, name, expertise_level FROM players WHERE is_active = TRUE'
      );
    } catch (error) {
      console.error('Error checking players:', error.message);
      return res.status(500).json({
        success: false,
        message: sanitizeError('Failed to check players. Please verify database connection.'),
        error: sanitizeError(error.message)
      });
    }

    if (seedPlayers || existingPlayers.length === 0) {
      // Clear existing players if clearExisting is true
      if (clearExisting && existingPlayers.length > 0) {
        try {
          await safeExecute('DELETE FROM matches');
          await safeExecute('DELETE FROM teams');
          await safeExecute('DELETE FROM players');
        } catch (error) {
          console.error('Error clearing existing data:', error.message);
          // Continue anyway
        }
      }

      // Insert Expert players
      for (const player of SAMPLE_PLAYERS.expert) {
        try {
          // Check if player already exists by email
          const [existing] = await safeExecute(
            'SELECT id FROM players WHERE email = ?',
            [player.email]
          );

          if (existing.length === 0) {
            await safeExecute(
              'INSERT INTO players (name, email, expertise_level, is_active) VALUES (?, ?, ?, ?)',
              [player.name, player.email, 'Expert', true]
            );
            playersCreated++;
          }
        } catch (error) {
          console.error(`Error inserting player ${player.name}:`, error.message);
          // Continue with next player
        }
      }

      // Insert Intermediate players
      for (const player of SAMPLE_PLAYERS.intermediate) {
        try {
          // Check if player already exists by email
          const [existing] = await safeExecute(
            'SELECT id FROM players WHERE email = ?',
            [player.email]
          );

          if (existing.length === 0) {
            await safeExecute(
              'INSERT INTO players (name, email, expertise_level, is_active) VALUES (?, ?, ?, ?)',
              [player.name, player.email, 'Intermediate', true]
            );
            playersCreated++;
          }
        } catch (error) {
          console.error(`Error inserting player ${player.name}:`, error.message);
          // Continue with next player
        }
      }
    }

    // Step 2: Check if players exist and are valid
    let players = [];
    try {
      [players] = await safeExecute(
        'SELECT id, name, expertise_level FROM players WHERE is_active = TRUE'
      );
    } catch (error) {
      console.error('Error fetching players:', error.message);
      return res.status(500).json({
        success: false,
        message: sanitizeError('Failed to fetch players. Please verify database connection.'),
        error: sanitizeError(error.message)
      });
    }

    if (players.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active players found. Please add players first or enable player seeding.'
      });
    }

    if (players.length % 2 !== 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot create teams. You have ${players.length} players. Need an even number of players.`
      });
    }

    const intermediatePlayers = players.filter(p => p.expertise_level === 'Intermediate');
    const expertPlayers = players.filter(p => p.expertise_level === 'Expert');

    if (intermediatePlayers.length !== expertPlayers.length) {
      return res.status(400).json({
        success: false,
        message: `Cannot create teams. You have ${intermediatePlayers.length} Intermediate and ${expertPlayers.length} Expert players. Need equal numbers of each.`
      });
    }

    // Step 3: Clear existing teams and matches if requested (only if not already cleared)
    if (clearExisting && !seedPlayers) {
      try {
        await safeExecute('DELETE FROM matches');
        await safeExecute('DELETE FROM teams');
      } catch (error) {
        console.error('Error clearing existing data:', error.message);
        // Continue anyway
      }
    }

    // Step 4: Generate teams
    let shuffledIntermediate = [];
    let shuffledExpert = [];
    try {
      [shuffledIntermediate] = await safeExecute(
        'SELECT id, name, expertise_level FROM players WHERE is_active = TRUE AND expertise_level = "Intermediate" ORDER BY RAND()'
      );
      [shuffledExpert] = await safeExecute(
        'SELECT id, name, expertise_level FROM players WHERE is_active = TRUE AND expertise_level = "Expert" ORDER BY RAND()'
      );
    } catch (error) {
      console.error('Error fetching players for team generation:', error.message);
      return res.status(500).json({
        success: false,
        message: sanitizeError('Failed to fetch players for team generation.'),
        error: sanitizeError(error.message)
      });
    }

    const teams = [];
    const teamCount = shuffledIntermediate.length;

    for (let i = 0; i < teamCount; i++) {
      const teamName = `Team ${i + 1}`;
      const intermediatePlayer = shuffledIntermediate[i];
      const expertPlayer = shuffledExpert[i];

      const [result] = await safeExecute(
        'INSERT INTO teams (team_name, player1_id, player2_id) VALUES (?, ?, ?)',
        [teamName, intermediatePlayer.id, expertPlayer.id]
      );

      teams.push({
        id: result.insertId,
        team_name: teamName,
        player1: intermediatePlayer,
        player2: expertPlayer
      });
    }

    // Step 5: Generate matches if we have at least 8 teams
    let matchesCreated = 0;
    let scheduleInfo = null;

    if (teams.length >= 8) {
      // Get all teams for match generation
      const [allTeams] = await safeExecute('SELECT id, team_name FROM teams ORDER BY id');

      // Divide teams into 2 pools
      let poolA = allTeams.slice(0, Math.ceil(allTeams.length / 2));
      let poolB = allTeams.slice(Math.ceil(allTeams.length / 2));

      const poolDifference = Math.abs(poolA.length - poolB.length);

      // If difference is more than 1, redistribute to make pools equal
      if (poolDifference > 1) {
        const halfSize = Math.floor(allTeams.length / 2);
        poolA = allTeams.slice(0, halfSize);
        poolB = allTeams.slice(halfSize);
      }

      const matches = [];
      const matchStartDate = startDate ? new Date(startDate) : new Date();
      const matchEndDate = endDate ? new Date(endDate) : null;

      // Track used time slots to prevent conflicts (format: "YYYY-MM-DD HH:MM:SS")
      const usedTimeSlots = new Set();

      // Track team pairs per pool to prevent duplicates (format: "pool-team1_id-team2_id")
      const usedTeamPairsByPool = {
        'A': new Set(),
        'B': new Set()
      };

      // Helper function to get unique team pair key (normalized, pool-specific)
      const getTeamPairKey = (team1Id, team2Id, poolName) => {
        const normalizedKey = team1Id < team2Id ? `${team1Id}-${team2Id}` : `${team2Id}-${team1Id}`;
        return `${poolName}-${normalizedKey}`;
      };

      // Helper function to get next unique time slot
      const getNextUniqueTimeSlot = (startDate) => {
        let slot = getNextTimeSlot(startDate);
        const maxAttempts = 1000; // Prevent infinite loop
        let attempts = 0;

        while (usedTimeSlots.has(formatDateForMySQL(slot)) && attempts < maxAttempts) {
          // Move to next 30-minute slot
          slot = getNextTimeSlot(new Date(slot.getTime() + 30 * 60 * 1000));
          attempts++;
        }

        if (attempts >= maxAttempts) {
          throw new Error('Unable to find available time slot. Too many matches scheduled.');
        }

        return slot;
      };

      // Helper to check if date is within range
      const isDateInRange = (date) => {
        if (!matchEndDate) return true;
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOnly = new Date(matchEndDate.getFullYear(), matchEndDate.getMonth(), matchEndDate.getDate());
        return dateOnly <= endOnly;
      };

      // Get existing matches for each pool to avoid regenerating them
      let existingMatchesByPool = { 'A': new Set(), 'B': new Set() };
      try {
        const [existingMatches] = await safeExecute(
          `SELECT team1_id, team2_id, pool FROM matches 
           WHERE round_type = 'Qualifying' 
           AND pool IN ('A', 'B')
           AND status != 'Cancelled'`
        );

        for (const existingMatch of existingMatches) {
          // Normalize team IDs for comparison
          const normalizedTeam1Id = existingMatch.team1_id < existingMatch.team2_id
            ? existingMatch.team1_id
            : existingMatch.team2_id;
          const normalizedTeam2Id = existingMatch.team1_id < existingMatch.team2_id
            ? existingMatch.team2_id
            : existingMatch.team1_id;
          const poolName = existingMatch.pool;
          const matchKey = getTeamPairKey(normalizedTeam1Id, normalizedTeam2Id, poolName);
          existingMatchesByPool[poolName].add(matchKey);
        }

        console.log(`Found ${existingMatchesByPool['A'].size} existing matches in Pool A`);
        console.log(`Found ${existingMatchesByPool['B'].size} existing matches in Pool B`);
      } catch (error) {
        console.error('Error fetching existing matches:', error.message);
        // Continue - will generate all matches if we can't check
      }

      // Generate round-robin match pairs FIRST (without time slots)
      // This ensures both pools generate all their matches before assigning time slots
      // Only generates missing matches if data already exists
      const generateRoundRobinPairs = (poolTeams, poolName) => {
        const poolMatchPairs = [];
        const poolUsedPairs = usedTeamPairsByPool[poolName];
        const existingPoolMatches = existingMatchesByPool[poolName];

        for (let i = 0; i < poolTeams.length; i++) {
          for (let j = i + 1; j < poolTeams.length; j++) {
            const team1Id = poolTeams[i].id;
            const team2Id = poolTeams[j].id;
            // Normalize for comparison
            const normalizedTeam1Id = team1Id < team2Id ? team1Id : team2Id;
            const normalizedTeam2Id = team1Id < team2Id ? team2Id : team1Id;
            const pairKey = getTeamPairKey(normalizedTeam1Id, normalizedTeam2Id, poolName);

            // Skip if this team pair already has a match in database
            if (existingPoolMatches.has(pairKey)) {
              console.log(`Skipping existing match in Pool ${poolName}: Team ${normalizedTeam1Id} vs Team ${normalizedTeam2Id}`);
              // Still mark as used so we don't try to add it again
              poolUsedPairs.add(pairKey);
              continue;
            }

            // Skip if this team pair already has a match in this pool (in current batch)
            if (poolUsedPairs.has(pairKey)) {
              console.log(`Skipping duplicate match in Pool ${poolName}: Team ${normalizedTeam1Id} vs Team ${normalizedTeam2Id}`);
              continue;
            }

            poolMatchPairs.push({
              team1_id: normalizedTeam1Id,
              team2_id: normalizedTeam2Id,
              pool: poolName
            });

            // Mark this team pair as used in this pool
            poolUsedPairs.add(pairKey);
          }
        }
        return poolMatchPairs;
      };

      // Generate all match pairs first (without time slots)
      const poolAMatchPairs = generateRoundRobinPairs(poolA, 'A');
      const poolBMatchPairs = generateRoundRobinPairs(poolB, 'B');

      console.log(`Generated ${poolAMatchPairs.length} match pairs for Pool A`);
      console.log(`Generated ${poolBMatchPairs.length} match pairs for Pool B`);

      // Now assign time slots sequentially to all matches (alternating between pools for fairness)
      let currentDate = getNextTimeSlot(matchStartDate);
      const allMatchPairs = [];

      // Interleave matches from both pools to ensure fair time slot distribution
      const maxPairs = Math.max(poolAMatchPairs.length, poolBMatchPairs.length);
      for (let i = 0; i < maxPairs; i++) {
        if (i < poolAMatchPairs.length) {
          allMatchPairs.push({ ...poolAMatchPairs[i], pool: 'A' });
        }
        if (i < poolBMatchPairs.length) {
          allMatchPairs.push({ ...poolBMatchPairs[i], pool: 'B' });
        }
      }

      // Assign time slots to all matches
      const poolAMatches = [];
      const poolBMatches = [];

      // Track matches in memory to prevent duplicates in the array itself
      const matchesInMemory = new Set(); // Format: "pool-team1_id-team2_id"
      const getMatchKey = (team1Id, team2Id, poolName) => {
        const normalizedKey = team1Id < team2Id ? `${team1Id}-${team2Id}` : `${team2Id}-${team1Id}`;
        return `${poolName}-${normalizedKey}`;
      };

      for (const matchPair of allMatchPairs) {
        // Check if we're still within the date range
        if (matchEndDate && !isDateInRange(currentDate)) {
          console.log(`Date range exceeded, stopping match generation at ${formatDateForMySQL(currentDate)}`);
          break;
        }

        // Check for duplicate in memory array
        const matchKey = getMatchKey(matchPair.team1_id, matchPair.team2_id, matchPair.pool);
        if (matchesInMemory.has(matchKey)) {
          console.log(`Skipping duplicate match in memory: Pool ${matchPair.pool} - Team ${matchPair.team1_id} vs Team ${matchPair.team2_id}`);
          continue;
        }

        // Get unique time slot
        currentDate = getNextUniqueTimeSlot(currentDate);
        const scheduledDate = formatDateForMySQL(currentDate);

        // Skip if this time slot is already used (shouldn't happen with getNextUniqueTimeSlot, but double-check)
        if (usedTimeSlots.has(scheduledDate)) {
          console.log(`Time slot conflict detected: ${scheduledDate}, finding next available slot`);
          currentDate = getNextUniqueTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
          continue;
        }

        // Normalize team IDs: always store smaller ID as team1_id to ensure unique constraint works
        const normalizedTeam1Id = matchPair.team1_id < matchPair.team2_id ? matchPair.team1_id : matchPair.team2_id;
        const normalizedTeam2Id = matchPair.team1_id < matchPair.team2_id ? matchPair.team2_id : matchPair.team1_id;

        const match = {
          team1_id: normalizedTeam1Id,
          team2_id: normalizedTeam2Id,
          scheduled_date: scheduledDate,
          venue: venue || 'Main Court',
          round_type: 'Qualifying',
          pool: matchPair.pool
        };

        // Mark time slot and match as used
        usedTimeSlots.add(scheduledDate);
        matchesInMemory.add(matchKey);

        // Add to appropriate pool array
        if (matchPair.pool === 'A') {
          poolAMatches.push(match);
        } else {
          poolBMatches.push(match);
        }

        // Get next available time slot for next iteration
        const nextSlot = getNextUniqueTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
        if (matchEndDate && nextSlot.getDate() !== currentDate.getDate() && !isDateInRange(nextSlot)) {
          break;
        }
        currentDate = nextSlot;
      }

      matches.push(...poolAMatches);
      matches.push(...poolBMatches);

      // Calculate expected match counts based on team counts (round-robin formula: n*(n-1)/2)
      // Each team plays exactly one match with every other team in the same pool
      const expectedPoolAMatches = (poolA.length * (poolA.length - 1)) / 2;
      const expectedPoolBMatches = (poolB.length * (poolB.length - 1)) / 2;

      // Calculate total match counts (newly generated + existing)
      const totalPoolAMatches = poolAMatches.length + existingMatchesByPool['A'].size;
      const totalPoolBMatches = poolBMatches.length + existingMatchesByPool['B'].size;

      // Calculate match counts for newly generated matches only
      const poolAMatchCount = poolAMatches.length;
      const poolBMatchCount = poolBMatches.length;

      console.log(`Pool A: ${poolA.length} teams, expected ${expectedPoolAMatches} matches (round-robin), existing ${existingMatchesByPool['A'].size}, generating ${poolAMatchCount}`);
      console.log(`Pool B: ${poolB.length} teams, expected ${expectedPoolBMatches} matches (round-robin), existing ${existingMatchesByPool['B'].size}, generating ${poolBMatchCount}`);

      // Only balance if pools have different team counts
      // If pools have same team count, they should have same number of matches (round-robin)
      // If pools have different team counts, balance to the larger pool's match count
      let additionalMatchInfo = null;
      const poolTeamCountDifference = Math.abs(poolA.length - poolB.length);

      // Only add rematches if pools have different team counts
      if (poolTeamCountDifference > 0) {
        const smallerPool = poolA.length < poolB.length ? 'A' : 'B';
        const smallerPoolTeams = poolA.length < poolB.length ? poolA : poolB;
        const largerPoolExpectedMatches = poolA.length > poolB.length ? expectedPoolAMatches : expectedPoolBMatches;
        const smallerPoolExpectedMatches = poolA.length < poolB.length ? expectedPoolAMatches : expectedPoolBMatches;

        // Calculate how many matches the smaller pool currently has (existing + new)
        const smallerPoolTotalMatches = poolA.length < poolB.length ? totalPoolAMatches : totalPoolBMatches;
        const largerPoolTotalMatches = poolA.length > poolB.length ? totalPoolAMatches : totalPoolBMatches;

        // Additional matches needed to balance to the larger pool's expected count
        const additionalMatchesNeeded = largerPoolExpectedMatches - smallerPoolTotalMatches;

        // Only add rematches if needed and if smaller pool has at least 2 teams
        if (additionalMatchesNeeded > 0 && smallerPoolTeams.length >= 2) {
          console.log(`Balancing: Pool ${smallerPool} needs ${additionalMatchesNeeded} additional matches to match Pool ${smallerPool === 'A' ? 'B' : 'A'}'s expected ${largerPoolExpectedMatches} matches`);
          let matchesAdded = 0;
          let pairIndex = 0;

          // Generate all possible pairs for rematches
          const allPairs = [];
          for (let i = 0; i < smallerPoolTeams.length; i++) {
            for (let j = i + 1; j < smallerPoolTeams.length; j++) {
              allPairs.push([smallerPoolTeams[i], smallerPoolTeams[j]]);
            }
          }

          // Add rematches to balance the match count
          const existingSmallerPoolMatches = existingMatchesByPool[smallerPool];
          while (matchesAdded < additionalMatchesNeeded && allPairs.length > 0) {
            // Check if we're still within the date range
            if (matchEndDate && !isDateInRange(currentDate)) {
              break;
            }

            const pair = allPairs[pairIndex % allPairs.length];
            const team1 = pair[0];
            const team2 = pair[1];
            // Normalize for comparison
            const normalizedTeam1Id = team1.id < team2.id ? team1.id : team2.id;
            const normalizedTeam2Id = team1.id < team2.id ? team2.id : team1.id;
            const pairKey = getTeamPairKey(normalizedTeam1Id, normalizedTeam2Id, smallerPool);

            // Skip if this team pair already has a match in database
            if (existingSmallerPoolMatches.has(pairKey)) {
              console.log(`Skipping existing rematch in Pool ${smallerPool}: Team ${normalizedTeam1Id} vs Team ${normalizedTeam2Id} (already exists)`);
              pairIndex++;
              continue;
            }

            // Skip if this team pair already has a match in this pool (in current batch)
            if (usedTeamPairsByPool[smallerPool].has(pairKey)) {
              console.log(`Skipping duplicate rematch in Pool ${smallerPool}: Team ${normalizedTeam1Id} vs Team ${normalizedTeam2Id}`);
              pairIndex++;
              continue;
            }

            // Get unique time slot
            currentDate = getNextUniqueTimeSlot(currentDate);
            const scheduledDate = formatDateForMySQL(currentDate);

            // Skip if this time slot is already used
            if (usedTimeSlots.has(scheduledDate)) {
              console.log(`Skipping duplicate time slot in rematch: ${scheduledDate}`);
              currentDate = getNextUniqueTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
              continue;
            }

            // Normalize team IDs: always store smaller ID as team1_id (already normalized above)
            matches.push({
              team1_id: normalizedTeam1Id,
              team2_id: normalizedTeam2Id,
              scheduled_date: scheduledDate,
              venue: venue || 'Main Court',
              round_type: 'Qualifying',
              pool: smallerPool
            });

            // Mark this team pair and time slot as used
            usedTeamPairsByPool[smallerPool].add(pairKey);
            usedTimeSlots.add(scheduledDate);

            const nextSlot = getNextUniqueTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
            if (matchEndDate && nextSlot.getDate() !== currentDate.getDate() && !isDateInRange(nextSlot)) {
              break;
            }

            currentDate = nextSlot;
            matchesAdded++;
            pairIndex++;
          }

          additionalMatchInfo = {
            pool: smallerPool,
            matchesAdded: matchesAdded,
            message: `Added ${matchesAdded} additional match(es) to Pool ${smallerPool} to balance with Pool ${smallerPool === 'A' ? 'B' : 'A'} (${largerPoolExpectedMatches} matches per pool).`
          };
        }
      } else {
        // Pools have same team count - verify they have same number of matches
        if (totalPoolAMatches !== totalPoolBMatches) {
          console.log(`Warning: Pools have same team count (${poolA.length}) but different match counts: Pool A has ${totalPoolAMatches}, Pool B has ${totalPoolBMatches}`);
        } else {
          console.log(`✓ Pools have equal team counts (${poolA.length}) and equal match counts (${totalPoolAMatches} each)`);
        }
      }

      // Insert all matches into database with duplicate and conflict checking
      // Track inserted matches to prevent duplicates within the same batch
      const insertedMatches = new Set(); // Format: "pool-team1_id-team2_id"
      const getInsertedMatchKey = (team1Id, team2Id, poolName) => {
        const normalizedKey = team1Id < team2Id ? `${team1Id}-${team2Id}` : `${team2Id}-${team1Id}`;
        return `${poolName}-${normalizedKey}`;
      };

      for (const match of matches) {
        try {
          // Check for duplicate in current batch
          const insertedKey = getInsertedMatchKey(match.team1_id, match.team2_id, match.pool);
          if (insertedMatches.has(insertedKey)) {
            console.log(`Skipping duplicate match in batch: Pool ${match.pool} - Team ${match.team1_id} vs Team ${match.team2_id}`);
            continue;
          }

          // Normalize team IDs for duplicate check (matches are already normalized, but ensure consistency)
          const normalizedTeam1Id = match.team1_id < match.team2_id ? match.team1_id : match.team2_id;
          const normalizedTeam2Id = match.team1_id < match.team2_id ? match.team2_id : match.team1_id;

          // Check for duplicate match in database before inserting
          // Since we normalize, we only need to check one order
          const [existingMatches] = await safeExecute(
            `SELECT id FROM matches 
             WHERE team1_id = ? AND team2_id = ?
             AND round_type = ? 
             AND (pool = ? OR (pool IS NULL AND ? IS NULL))
             AND status != 'Cancelled'`,
            [normalizedTeam1Id, normalizedTeam2Id, match.round_type, match.pool, match.pool]
          );

          if (existingMatches.length > 0) {
            console.log(`Skipping duplicate match in database: Pool ${match.pool} - Team ${match.team1_id} vs Team ${match.team2_id} (already exists)`);
            continue;
          }

          // Check for time slot conflict before inserting
          const [conflictingMatches] = await safeExecute(
            `SELECT id FROM matches 
             WHERE scheduled_date = ? 
             AND venue = ? 
             AND status != 'Cancelled'`,
            [match.scheduled_date, match.venue]
          );

          if (conflictingMatches.length > 0) {
            console.log(`Skipping time slot conflict: ${match.scheduled_date} at ${match.venue} (already booked)`);
            continue;
          }

          // Insert with normalized team IDs (matches are already normalized, but ensure consistency)
          await safeExecute(
            'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool) VALUES (?, ?, ?, ?, ?, ?)',
            [normalizedTeam1Id, normalizedTeam2Id, match.scheduled_date, match.venue, match.round_type, match.pool]
          );

          // Mark as inserted
          insertedMatches.add(insertedKey);
          matchesCreated++;
        } catch (error) {
          // Handle duplicate entry error
          if (error.code === 'ER_DUP_ENTRY') {
            console.log(`Duplicate match detected and skipped: Pool ${match.pool} - Team ${match.team1_id} vs Team ${match.team2_id}`);
            continue;
          }
          console.error('Error inserting match:', error.message);
          // Continue with next match
        }
      }

      // Recalculate final match counts after balancing (newly generated only)
      const finalPoolAMatches = matches.filter(m => m.pool === 'A').length;
      const finalPoolBMatches = matches.filter(m => m.pool === 'B').length;

      // Calculate final total match counts (existing + newly generated)
      const finalTotalPoolAMatches = finalPoolAMatches + existingMatchesByPool['A'].size;
      const finalTotalPoolBMatches = finalPoolBMatches + existingMatchesByPool['B'].size;

      // Verify round-robin completeness - each pool should have exactly n*(n-1)/2 matches
      const poolAComplete = finalTotalPoolAMatches === expectedPoolAMatches;
      const poolBComplete = finalTotalPoolBMatches === expectedPoolBMatches;

      console.log(`Final verification:`);
      console.log(`  Pool A: ${poolA.length} teams → Expected: ${expectedPoolAMatches} matches → Actual: ${finalTotalPoolAMatches} matches ${poolAComplete ? '✓' : '✗'}`);
      console.log(`  Pool B: ${poolB.length} teams → Expected: ${expectedPoolBMatches} matches → Actual: ${finalTotalPoolBMatches} matches ${poolBComplete ? '✓' : '✗'}`);

      scheduleInfo = {
        totalMatches: matchesCreated,
        poolA: {
          teams: poolA.length,
          expectedMatches: expectedPoolAMatches,
          existingMatches: existingMatchesByPool['A'].size,
          newMatches: finalPoolAMatches,
          totalMatches: finalTotalPoolAMatches,
          isComplete: poolAComplete
        },
        poolB: {
          teams: poolB.length,
          expectedMatches: expectedPoolBMatches,
          existingMatches: existingMatchesByPool['B'].size,
          newMatches: finalPoolBMatches,
          totalMatches: finalTotalPoolBMatches,
          isComplete: poolBComplete
        },
        poolDifference: poolTeamCountDifference,
        additionalMatch: additionalMatchInfo,
        // Matches are balanced if: same team count → same match count, OR different team count → balanced via rematches
        matchesBalanced: poolTeamCountDifference === 0
          ? finalTotalPoolAMatches === finalTotalPoolBMatches
          : (finalTotalPoolAMatches === expectedPoolAMatches && finalTotalPoolBMatches === expectedPoolBMatches)
      };
    }

    res.status(201).json({
      success: true,
      message: `Seeding completed successfully!${playersCreated > 0 ? ` ${playersCreated} players,` : ''} ${teamCount} teams${matchesCreated > 0 ? ` and ${matchesCreated} matches` : ''} created.`,
      data: {
        playersCreated: playersCreated,
        teamsCreated: teamCount,
        matchesCreated: matchesCreated,
        teams: teams,
        schedule: scheduleInfo
      }
    });
  } catch (error) {
    console.error('Error seeding data:', error);
    next(error);
  }
};



