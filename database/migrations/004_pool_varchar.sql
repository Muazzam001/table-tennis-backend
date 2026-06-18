-- Migration 004: Dynamic group ids (A–Z) — pool as VARCHAR instead of ENUM
-- Supports 2, 4, 8, or 16 groups in the flexible tournament format
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/004_pool_varchar.sql

USE table_tennis_tournament;

ALTER TABLE matches
  MODIFY COLUMN pool VARCHAR(15) NULL COMMENT 'Group id for qualifying (A-Z). NULL for knockout.';

SELECT 'Migration 004 complete' AS message;
