-- Application reset: clear tournament data, preserve admin users
-- Clears: statistics, matches, teams, players
-- Preserves: users
--
-- Usage: mysql -u root -p < database/reset.sql
--
-- After reset, recreate data with:
--   mysql -u root -p < database/seed.sql        (players only)
--   or Home page "Seed Demo Players" / POST /api/seed/players
-- Then create teams (Teams page) and schedules (Matches page) in the app.
--
-- For a full wipe including users, use: database/reset_full.sql

USE table_tennis_tournament;

SET FOREIGN_KEY_CHECKS = 0;

-- TRUNCATE + explicit AUTO_INCREMENT ensures IDs restart at 1
TRUNCATE TABLE statistics;
ALTER TABLE statistics AUTO_INCREMENT = 1;
TRUNCATE TABLE matches;
ALTER TABLE matches AUTO_INCREMENT = 1;
TRUNCATE TABLE teams;
ALTER TABLE teams AUTO_INCREMENT = 1;
TRUNCATE TABLE players;
ALTER TABLE players AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Application data reset completed. Users table preserved.' AS message;
