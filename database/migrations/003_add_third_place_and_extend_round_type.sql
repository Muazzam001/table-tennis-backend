-- Migration 003: Third Place round type
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/003_add_third_place_and_extend_round_type.sql

USE table_tennis_tournament;

ALTER TABLE matches
  MODIFY COLUMN round_type ENUM('Qualifying', 'Quarter Final', 'Semi Final', 'Final', 'Third Place') DEFAULT 'Qualifying';

SELECT 'Migration 003 complete' AS message;
