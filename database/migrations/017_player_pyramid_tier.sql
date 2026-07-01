-- Store tier-pyramid seed tier on the player record (single source of truth).
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/017_player_pyramid_tier.sql

ALTER TABLE players
  ADD COLUMN pyramid_tier TINYINT UNSIGNED NULL
    COMMENT '1, 2, or 3 for tier-pyramid eligibility'
    AFTER category,
  ADD INDEX idx_pyramid_tier (pyramid_tier);
