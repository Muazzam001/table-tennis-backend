-- Table Tennis Tournament Database Schema
-- Authoritative schema for new installations (June 2026)
-- Usage: mysql -u root -p < database/schema.sql

CREATE DATABASE IF NOT EXISTS table_tennis_tournament;
USE table_tennis_tournament;

-- Players: gender division (Men/Women) + expertise (Beginner/Intermediate/Expert)
CREATE TABLE IF NOT EXISTS players (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200) UNIQUE NULL,
    expertise_level ENUM('Beginner', 'Intermediate', 'Expert') NOT NULL DEFAULT 'Beginner',
    category ENUM('Men', 'Women') NOT NULL DEFAULT 'Men',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_expertise (expertise_level),
    INDEX idx_category (category),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per gender-division settings (Men / Women)
CREATE TABLE IF NOT EXISTS division_settings (
    division ENUM('Men', 'Women') PRIMARY KEY,
    competition_format ENUM('doubles', 'singles') NOT NULL DEFAULT 'doubles',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO division_settings (division, competition_format) VALUES
    ('Men', 'doubles'),
    ('Women', 'doubles');

-- Teams (gender division; player2_id NULL for singles)
CREATE TABLE IF NOT EXISTS teams (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_name VARCHAR(150) NOT NULL COMMENT 'Short display name only; division is in division column',
    player1_id INT NOT NULL,
    player2_id INT NULL COMMENT 'NULL for singles (one player per team)',
    division ENUM('Men', 'Women') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_doubles_team (player1_id, player2_id),
    UNIQUE KEY unique_singles_entrant (division, player1_id),
    INDEX idx_player1 (player1_id),
    INDEX idx_player2 (player2_id),
    INDEX idx_division (division),
    FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Matches (flexible groups A–Z, knockout rounds including Third Place)
CREATE TABLE IF NOT EXISTS matches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team1_id INT NOT NULL,
    team2_id INT NOT NULL,
    scheduled_date DATETIME NOT NULL,
    venue VARCHAR(150),
    status ENUM('Scheduled', 'In Progress', 'Completed', 'Cancelled') DEFAULT 'Scheduled',
    round_type ENUM('Qualifying', 'Quarter Final', 'Semi Final', 'Final', 'Third Place') DEFAULT 'Qualifying',
    pool VARCHAR(15) NULL COMMENT 'Group id for qualifying (A-Z). NULL for knockout rounds.',
    division ENUM('Men', 'Women') NOT NULL,
    winner_team_id INT NULL,
    score_team1 INT DEFAULT 0,
    score_team2 INT DEFAULT 0,
    is_abandoned BOOLEAN DEFAULT FALSE,
    abandoned_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_team1 (team1_id),
    INDEX idx_team2 (team2_id),
    INDEX idx_winner (winner_team_id),
    INDEX idx_scheduled_date (scheduled_date),
    INDEX idx_status (status),
    INDEX idx_round_type (round_type),
    INDEX idx_pool (pool),
    INDEX idx_division (division),
    UNIQUE KEY unique_match_teams_round_pool (team1_id, team2_id, round_type, pool),
    FOREIGN KEY (team1_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (team2_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (winner_team_id) REFERENCES teams(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Statistics (reserved for future aggregated stats; standings computed live from matches)
CREATE TABLE IF NOT EXISTS statistics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    team_id INT NOT NULL,
    matches_played INT DEFAULT 0,
    matches_won INT DEFAULT 0,
    matches_lost INT DEFAULT 0,
    total_points_scored INT DEFAULT 0,
    total_points_conceded INT DEFAULT 0,
    win_percentage DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_player (player_id),
    INDEX idx_team (team_id),
    UNIQUE KEY unique_player_team (player_id, team_id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Doubles team pairing rules (ignored for singles tracks)
CREATE TABLE IF NOT EXISTS team_pairing_rules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    related_player_id INT NOT NULL,
    rule_type ENUM('must_pair', 'never_pair', 'prefer_pair') NOT NULL,
    division ENUM('Men', 'Women') NOT NULL,
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

-- Tournament archives (completed track snapshots for historical viewing)
CREATE TABLE IF NOT EXISTS tournament_archives (
    id INT PRIMARY KEY AUTO_INCREMENT,
    division ENUM('Men', 'Women') NOT NULL,
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

-- Users (authentication; preserved by application reset)
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Database schema created successfully!' AS message;
