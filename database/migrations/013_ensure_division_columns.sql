-- Ensures all tables use `division` instead of legacy `league` columns.
-- Idempotent: safe if 012 already ran partially or was skipped.
-- Also run: npm run ensure-division-schema (programmatic upgrade with index fixes)

USE table_tennis_tournament;

SET @legacy_settings_table = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'league_settings'
);
SET @division_settings_table = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'division_settings'
);

SET @sql = IF(
  @legacy_settings_table > 0 AND @division_settings_table = 0,
  'RENAME TABLE league_settings TO division_settings',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @legacy_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'division_settings' AND COLUMN_NAME = 'league'
);
SET @has_division_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'division_settings' AND COLUMN_NAME = 'division'
);
SET @sql = IF(
  @legacy_col > 0 AND @has_division_col = 0,
  'ALTER TABLE division_settings CHANGE league division ENUM(''Expert'', ''Intermediate'', ''Women'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @legacy_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teams' AND COLUMN_NAME = 'league'
);
SET @has_division_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teams' AND COLUMN_NAME = 'division'
);
SET @sql = IF(
  @legacy_col > 0 AND @has_division_col = 0,
  'ALTER TABLE teams CHANGE league division ENUM(''Expert'', ''Intermediate'', ''Women'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @legacy_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'league'
);
SET @has_division_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'division'
);
SET @sql = IF(
  @legacy_col > 0 AND @has_division_col > 0,
  'UPDATE matches SET division = league WHERE league IS NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @legacy_col > 0 AND @has_division_col > 0,
  'ALTER TABLE matches DROP COLUMN league',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @legacy_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'league'
);
SET @has_division_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'division'
);
SET @sql = IF(
  @legacy_col > 0 AND @has_division_col = 0,
  'ALTER TABLE matches CHANGE league division ENUM(''Expert'', ''Intermediate'', ''Women'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pairing_rules_table = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'team_pairing_rules'
);
SET @legacy_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'team_pairing_rules' AND COLUMN_NAME = 'league'
);
SET @has_division_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'team_pairing_rules' AND COLUMN_NAME = 'division'
);
SET @sql = IF(
  @pairing_rules_table > 0 AND @legacy_col > 0 AND @has_division_col = 0,
  'ALTER TABLE team_pairing_rules CHANGE league division ENUM(''Expert'', ''Intermediate'', ''Women'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @archives_table = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournament_archives'
);
SET @legacy_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournament_archives' AND COLUMN_NAME = 'league'
);
SET @has_division_col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournament_archives' AND COLUMN_NAME = 'division'
);
SET @sql = IF(
  @archives_table > 0 AND @legacy_col > 0 AND @has_division_col = 0,
  'ALTER TABLE tournament_archives CHANGE league division ENUM(''Expert'', ''Intermediate'', ''Women'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration 013 complete: division columns verified' AS message;
