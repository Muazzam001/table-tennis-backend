-- Per-league competition format (singles vs doubles) and singles team support
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/010_league_settings_and_singles.sql

USE table_tennis_tournament;

-- Per-league settings (competition format)
CREATE TABLE IF NOT EXISTS league_settings (
    league ENUM('Expert', 'Intermediate', 'Women') PRIMARY KEY,
    competition_format ENUM('doubles', 'singles') NOT NULL DEFAULT 'doubles',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO league_settings (league, competition_format) VALUES
    ('Expert', 'doubles'),
    ('Intermediate', 'doubles'),
    ('Women', 'doubles');

-- Allow singles teams (one player per team)
ALTER TABLE teams MODIFY COLUMN player2_id INT NULL;

-- Prevent duplicate singles entrants per league
CREATE UNIQUE INDEX idx_unique_singles_entrant ON teams (league, player1_id);

SELECT 'Migration 010 applied: league_settings and singles support' AS message;
