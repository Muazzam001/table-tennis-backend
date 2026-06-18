-- Migration 001: Round type, pool, abandonment fields (legacy databases)
-- Safe to run on databases created before 2025. New installs use schema.sql directly.
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/001_add_round_type_and_pool.sql

USE table_tennis_tournament;

-- round_type
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'round_type'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE matches ADD COLUMN round_type ENUM('Qualifying', 'Quarter Final', 'Semi Final', 'Final') DEFAULT 'Qualifying' AFTER status",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- pool
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'pool'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE matches ADD COLUMN pool ENUM('A', 'B') NULL AFTER round_type",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- is_abandoned
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'is_abandoned'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE matches ADD COLUMN is_abandoned BOOLEAN DEFAULT FALSE AFTER winner_team_id",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- abandoned_reason
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'abandoned_reason'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE matches ADD COLUMN abandoned_reason TEXT NULL AFTER is_abandoned",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Migration 001 complete' AS message;
