-- Full database reset: drop ALL tables including users
-- Use only when you need a completely clean database
-- Usage: mysql -u root -p < database/reset_full.sql
-- Then: mysql -u root -p < database/schema.sql

USE table_tennis_tournament;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS statistics;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Full database reset completed. Run schema.sql to recreate tables.' AS message;
