-- Migration 002: Player category and division columns on teams/matches
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/002_add_category_and_division.sql

USE table_tennis_tournament;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'players' AND COLUMN_NAME = 'category'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE players ADD COLUMN category ENUM('Men', 'Women') DEFAULT 'Men' AFTER expertise_level",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teams' AND COLUMN_NAME = 'division'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE teams ADD COLUMN division ENUM('Expert', 'Intermediate', 'Women') NOT NULL DEFAULT 'Expert' AFTER player2_id",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'division'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE matches ADD COLUMN division ENUM('Expert', 'Intermediate', 'Women') NOT NULL DEFAULT 'Expert' AFTER pool",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Migration 002 complete' AS message;
