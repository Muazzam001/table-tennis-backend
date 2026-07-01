-- Allow players without an email address
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/008_optional_player_email.sql

USE table_tennis_tournament;

ALTER TABLE players
  MODIFY COLUMN email VARCHAR(200) UNIQUE NULL;

SELECT 'players.email is now optional' AS message;
