-- Tournament archives: snapshot completed division tournaments for historical viewing
USE table_tennis_tournament;

CREATE TABLE IF NOT EXISTS tournament_archives (
    id INT PRIMARY KEY AUTO_INCREMENT,
    division ENUM('Expert', 'Intermediate', 'Women') NOT NULL,
    name VARCHAR(200) NOT NULL,
    completed_at DATETIME NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    champion_team_name VARCHAR(150) NULL,
    runner_up_team_name VARCHAR(150) NULL,
    participant_count INT DEFAULT 0,
    snapshot_json JSON NOT NULL,
    INDEX idx_division (division),
    INDEX idx_completed_at (completed_at),
    INDEX idx_archived_at (archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
