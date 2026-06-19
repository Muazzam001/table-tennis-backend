-- Men/Women gender divisions + Beginner/Intermediate/Expert expertise (6 tournament tracks)
-- Legacy division values: Expert -> Men-Expert, Intermediate -> Men-Intermediate, Women -> Women-Intermediate

USE table_tennis_tournament;

ALTER TABLE players
  MODIFY expertise_level ENUM('Beginner', 'Intermediate', 'Expert') NOT NULL DEFAULT 'Beginner';

UPDATE players
SET expertise_level = 'Intermediate'
WHERE expertise_level IS NULL;

-- Step 1: widen ENUMs to accept legacy + new track ids
ALTER TABLE division_settings
  MODIFY division ENUM(
    'Expert', 'Intermediate', 'Women',
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert'
  ) NOT NULL;

ALTER TABLE teams
  MODIFY division ENUM(
    'Expert', 'Intermediate', 'Women',
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert'
  ) NOT NULL;

ALTER TABLE matches
  MODIFY division ENUM(
    'Expert', 'Intermediate', 'Women',
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert'
  ) NOT NULL;

ALTER TABLE team_pairing_rules
  MODIFY division ENUM(
    'Expert', 'Intermediate', 'Women',
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert'
  ) NOT NULL;

ALTER TABLE tournament_archives
  MODIFY division ENUM(
    'Expert', 'Intermediate', 'Women',
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert'
  ) NOT NULL;

-- Step 2: migrate legacy track values
UPDATE division_settings SET division = 'Men-Expert' WHERE division = 'Expert';
UPDATE division_settings SET division = 'Men-Intermediate' WHERE division = 'Intermediate';
UPDATE division_settings SET division = 'Women-Intermediate' WHERE division = 'Women';

UPDATE teams SET division = 'Men-Expert' WHERE division = 'Expert';
UPDATE teams SET division = 'Men-Intermediate' WHERE division = 'Intermediate';
UPDATE teams SET division = 'Women-Intermediate' WHERE division = 'Women';

UPDATE matches SET division = 'Men-Expert' WHERE division = 'Expert';
UPDATE matches SET division = 'Men-Intermediate' WHERE division = 'Intermediate';
UPDATE matches SET division = 'Women-Intermediate' WHERE division = 'Women';

UPDATE team_pairing_rules SET division = 'Men-Expert' WHERE division = 'Expert';
UPDATE team_pairing_rules SET division = 'Men-Intermediate' WHERE division = 'Intermediate';
UPDATE team_pairing_rules SET division = 'Women-Intermediate' WHERE division = 'Women';

UPDATE tournament_archives SET division = 'Men-Expert' WHERE division = 'Expert';
UPDATE tournament_archives SET division = 'Men-Intermediate' WHERE division = 'Intermediate';
UPDATE tournament_archives SET division = 'Women-Intermediate' WHERE division = 'Women';

-- Step 3: shrink ENUMs to new track ids only
ALTER TABLE division_settings
  MODIFY division ENUM(
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert'
  ) NOT NULL;

INSERT IGNORE INTO division_settings (division, competition_format) VALUES
  ('Men-Beginner', 'doubles'),
  ('Men-Intermediate', 'doubles'),
  ('Men-Expert', 'doubles'),
  ('Women-Beginner', 'doubles'),
  ('Women-Intermediate', 'doubles'),
  ('Women-Expert', 'doubles');

ALTER TABLE teams
  MODIFY division ENUM(
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert'
  ) NOT NULL;

ALTER TABLE matches
  MODIFY division ENUM(
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert'
  ) NOT NULL;

ALTER TABLE team_pairing_rules
  MODIFY division ENUM(
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert'
  ) NOT NULL;

ALTER TABLE tournament_archives
  MODIFY division ENUM(
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert'
  ) NOT NULL;

SELECT 'Migration 014 complete: 6 tournament tracks (gender + expertise)' AS message;
