-- Per-division competition format (singles vs doubles) and singles team support
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/010_division_settings_and_singles.sql

USE table_tennis_tournament;

-- Per-division settings (competition format)
CREATE TABLE IF NOT EXISTS division_settings (
    division ENUM('Expert', 'Intermediate', 'Women') PRIMARY KEY,
    competition_format ENUM('doubles', 'singles') NOT NULL DEFAULT 'doubles',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO division_settings (division, competition_format) VALUES
    ('Expert', 'doubles'),
    ('Intermediate', 'doubles'),
    ('Women', 'doubles');

-- Allow singles teams (one player per team)
ALTER TABLE teams MODIFY COLUMN player2_id INT NULL;

-- Prevent duplicate singles entrants per division
CREATE UNIQUE INDEX idx_unique_singles_entrant ON teams (division, player1_id);

SELECT 'Migration 010 applied: division_settings and singles support' AS message;
