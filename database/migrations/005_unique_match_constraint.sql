-- Migration 005: Prevent duplicate qualifying/knockout fixtures
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/005_unique_match_constraint.sql

USE table_tennis_tournament;

SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'matches'
    AND CONSTRAINT_NAME = 'unique_match_teams_round_pool'
);

SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE matches ADD UNIQUE KEY unique_match_teams_round_pool (team1_id, team2_id, round_type, pool)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'Migration 005 complete' AS message;
