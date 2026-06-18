-- Upgrade an existing database to the latest schema
--
-- Run each migration in order from the project root:
--
--   mysql -u root -p table_tennis_tournament < database/migrations/001_add_round_type_and_pool.sql
--   mysql -u root -p table_tennis_tournament < database/migrations/002_add_category_and_league.sql
--   mysql -u root -p table_tennis_tournament < database/migrations/003_add_third_place_and_extend_round_type.sql
--   mysql -u root -p table_tennis_tournament < database/migrations/004_pool_varchar.sql
--   mysql -u root -p table_tennis_tournament < database/migrations/005_unique_match_constraint.sql
--   mysql -u root -p table_tennis_tournament < database/migrations/008_optional_player_email.sql
--
-- For NEW databases, use database/schema.sql instead (already includes everything).
--
-- The seed controller (POST /api/seed/teams-and-matches) also applies these migrations automatically.

SELECT 'See comments in this file for migration commands.' AS message;
