-- Doubles team pairing rules (must / never / prefer pair)
-- Only applies when a division's competition_format is doubles.
-- Usage: mysql -u root -p table_tennis_tournament < database/migrations/011_team_pairing_rules.sql

USE table_tennis_tournament;

CREATE TABLE IF NOT EXISTS team_pairing_rules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    related_player_id INT NOT NULL,
    rule_type ENUM('must_pair', 'never_pair', 'prefer_pair') NOT NULL,
    division ENUM('Expert', 'Intermediate', 'Women') NOT NULL,
    priority INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_pairing_rule (player_id, related_player_id, rule_type, division),
    INDEX idx_player (player_id),
    INDEX idx_related (related_player_id),
    INDEX idx_division (division),
    INDEX idx_rule_type (rule_type),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (related_player_id) REFERENCES players(id) ON DELETE CASCADE,
    CHECK (player_id < related_player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'team_pairing_rules table ready' AS message;
