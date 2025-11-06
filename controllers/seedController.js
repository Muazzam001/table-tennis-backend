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
    const dbName = process.env.DB_NAME || 'table_tennis_tournament';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_PORT) || 3306;
    const dbUser = process.env.DB_USER || 'root';

    console.log(`Attempting to connect to MySQL at ${dbHost}:${dbPort} as ${dbUser}...`);

    // Create connection without database
    try {
      connection = await mysql.createConnection({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: process.env.DB_PASSWORD || '',
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

      `CREATE TABLE IF NOT EXISTS match_details (
        id INT PRIMARY KEY AUTO_INCREMENT,
        match_id INT NOT NULL,
        team_id INT NOT NULL,
        sets_won INT DEFAULT 0,
        sets_lost INT DEFAULT 0,
        games_won INT DEFAULT 0,
        games_lost INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_match (match_id),
        INDEX idx_team (team_id),
        UNIQUE KEY unique_match_team (match_id, team_id),
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
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

    // Add missing columns to matches table if needed
    // Use query() for DDL statements (ALTER TABLE)
    try {
      const [columns] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'round_type'`,
        [dbName]
      );
      if (columns.length === 0) {
        await connection.query(
          `ALTER TABLE matches ADD COLUMN round_type ENUM('Qualifying', 'Quarter Final', 'Semi Final', 'Final') DEFAULT 'Qualifying'`
        );
      }
    } catch (error) {
      // Column might already exist, ignore
    }
    
    try {
      const [columns] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'pool'`,
        [dbName]
      );
      if (columns.length === 0) {
        await connection.query(
          `ALTER TABLE matches ADD COLUMN pool ENUM('A', 'B') NULL`
        );
      }
    } catch (error) {
      // Column might already exist, ignore
    }
    
    try {
      const [columns] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'is_abandoned'`,
        [dbName]
      );
      if (columns.length === 0) {
        await connection.query(
          `ALTER TABLE matches ADD COLUMN is_abandoned BOOLEAN DEFAULT FALSE`
        );
      }
    } catch (error) {
      // Column might already exist, ignore
    }
    
    try {
      const [columns] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'abandoned_reason'`,
        [dbName]
      );
      if (columns.length === 0) {
        await connection.query(
          `ALTER TABLE matches ADD COLUMN abandoned_reason TEXT NULL`
        );
      }
    } catch (error) {
      // Column might already exist, ignore
    }

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
      let currentDate = getNextTimeSlot(matchStartDate);

      // Helper to check if date is within range
      const isDateInRange = (date) => {
        if (!matchEndDate) return true;
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOnly = new Date(matchEndDate.getFullYear(), matchEndDate.getMonth(), matchEndDate.getDate());
        return dateOnly <= endOnly;
      };

      // Generate round-robin matches for each pool
      const generateRoundRobin = (poolTeams, poolName) => {
        const poolMatches = [];
        for (let i = 0; i < poolTeams.length; i++) {
          for (let j = i + 1; j < poolTeams.length; j++) {
            // Check if we're still within the date range
            if (matchEndDate && !isDateInRange(currentDate)) {
              break;
            }

            poolMatches.push({
              team1_id: poolTeams[i].id,
              team2_id: poolTeams[j].id,
              scheduled_date: formatDateForMySQL(currentDate),
              venue: venue || 'Main Court',
              round_type: 'Qualifying',
              pool: poolName
            });

            // Get next available time slot
            const nextSlot = getNextTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
            if (matchEndDate && nextSlot.getDate() !== currentDate.getDate() && !isDateInRange(nextSlot)) {
              break;
            }

            currentDate = nextSlot;
          }
          if (matchEndDate && !isDateInRange(currentDate)) {
            break;
          }
        }
        return poolMatches;
      };

      const poolAMatches = generateRoundRobin(poolA, 'A');
      const poolBMatches = generateRoundRobin(poolB, 'B');

      matches.push(...poolAMatches);
      matches.push(...poolBMatches);

      // Calculate match counts
      const poolAMatchCount = poolAMatches.length;
      const poolBMatchCount = poolBMatches.length;

      // If difference is exactly 1 team, add additional match(es) to the smaller pool
      let additionalMatchInfo = null;
      if (poolDifference === 1) {
        const smallerPool = poolA.length < poolB.length ? 'A' : 'B';
        const smallerPoolTeams = poolA.length < poolB.length ? poolA : poolB;
        const largerPoolMatchCount = poolA.length > poolB.length ? poolAMatchCount : poolBMatchCount;
        const smallerPoolMatchCount = poolA.length < poolB.length ? poolAMatchCount : poolBMatchCount;

        const additionalMatchesNeeded = largerPoolMatchCount - smallerPoolMatchCount;

        if (additionalMatchesNeeded > 0 && smallerPoolTeams.length >= 2) {
          let matchesAdded = 0;
          let pairIndex = 0;

          const allPairs = [];
          for (let i = 0; i < smallerPoolTeams.length; i++) {
            for (let j = i + 1; j < smallerPoolTeams.length; j++) {
              allPairs.push([smallerPoolTeams[i], smallerPoolTeams[j]]);
            }
          }

          while (matchesAdded < additionalMatchesNeeded && allPairs.length > 0) {
            // Check if we're still within the date range
            if (matchEndDate && !isDateInRange(currentDate)) {
              break;
            }

            const pair = allPairs[pairIndex % allPairs.length];
            const team1 = pair[0];
            const team2 = pair[1];

            matches.push({
              team1_id: team1.id,
              team2_id: team2.id,
              scheduled_date: formatDateForMySQL(currentDate),
              venue: venue || 'Main Court',
              round_type: 'Qualifying',
              pool: smallerPool
            });

            const nextSlot = getNextTimeSlot(new Date(currentDate.getTime() + 30 * 60 * 1000));
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
            message: `Added ${matchesAdded} additional match(es) to Pool ${smallerPool} to balance the number of matches.`
          };
        }
      }

      // Insert all matches into database
      for (const match of matches) {
        try {
          await safeExecute(
            'INSERT INTO matches (team1_id, team2_id, scheduled_date, venue, round_type, pool) VALUES (?, ?, ?, ?, ?, ?)',
            [match.team1_id, match.team2_id, match.scheduled_date, match.venue, match.round_type, match.pool]
          );
          matchesCreated++;
        } catch (error) {
          console.error('Error inserting match:', error.message);
          // Continue with next match
        }
      }

      scheduleInfo = {
        totalMatches: matchesCreated,
        poolA: {
          teams: poolA.length,
          matches: poolAMatchCount
        },
        poolB: {
          teams: poolB.length,
          matches: poolBMatchCount
        },
        poolDifference,
        additionalMatch: additionalMatchInfo
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

