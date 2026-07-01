-- Migration 016: Tier Pyramid tournament format
-- Adds format selection, entrant tier/stage tracking, pyramid match stages, progression audit log.
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/016_tier_pyramid.sql

USE table_tennis_tournament;

-- Persist tournament format per division (classic formats default to 'groups')
ALTER TABLE division_settings
  ADD COLUMN tournament_format ENUM(
    'groups', 'single-group', 'pools-2', 'tier-pyramid'
  ) NOT NULL DEFAULT 'groups' AFTER competition_format,
  ADD COLUMN format_config JSON NULL COMMENT 'Tier sizes, group count, qualifiers, etc.';

-- Entrant metadata for tier-pyramid tracks
ALTER TABLE teams
  ADD COLUMN tier TINYINT UNSIGNED NULL COMMENT '1, 2, or 3 for tier-pyramid' AFTER division,
  ADD COLUMN pyramid_stage ENUM(
    'registered', 'S1', 'S2', 'L2', 'L3', 'final', 'champion', 'eliminated'
  ) NULL AFTER tier,
  ADD COLUMN pyramid_status ENUM(
    'active', 'advanced', 'eliminated', 'withdrawn'
  ) NULL DEFAULT 'active' AFTER pyramid_stage,
  ADD COLUMN advancement_source VARCHAR(50) NULL COMMENT 'e.g. S1-A1, S2-top, L2-win' AFTER pyramid_status,
  ADD INDEX idx_tier (tier),
  ADD INDEX idx_pyramid_stage (pyramid_stage),
  ADD INDEX idx_pyramid_status (pyramid_status);

-- Extend match round types for pyramid stages
ALTER TABLE matches
  MODIFY round_type ENUM(
    'Qualifying', 'Quarter Final', 'Semi Final', 'Final', 'Third Place',
    'S1', 'S2', 'Level 2', 'Level 3'
  ) NOT NULL DEFAULT 'Qualifying',
  ADD COLUMN pyramid_stage ENUM('S1', 'S2', 'L2', 'L3', 'Final') NULL AFTER pool,
  ADD COLUMN stage_sequence INT NULL COMMENT 'Bracket slot index within stage' AFTER pyramid_stage,
  ADD INDEX idx_pyramid_stage_match (pyramid_stage);

-- Audit trail for advancement and admin overrides
CREATE TABLE IF NOT EXISTS tournament_progression_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    division ENUM('Men', 'Women') NOT NULL,
    team_id INT NOT NULL,
    from_stage VARCHAR(20) NOT NULL,
    to_stage VARCHAR(20) NOT NULL,
    from_status VARCHAR(20) NOT NULL,
    to_status VARCHAR(20) NOT NULL,
    reason ENUM('auto', 'manual_override', 'withdrawal', 'regeneration') NOT NULL,
    triggered_by_match_id INT NULL,
    admin_user_id INT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_division (division),
    INDEX idx_team (team_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (triggered_by_match_id) REFERENCES matches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 016 complete: Tier Pyramid format support' AS message;
