-- Collapse 6 expertise-based tracks to 2 gender divisions (Men / Women)
-- Expertise remains on players only; tournament brackets are gender-based.

USE table_tennis_tournament;

-- Step 1: widen ENUMs (add Men; Women already exists as legacy value)
ALTER TABLE division_settings
  MODIFY division ENUM(
    'Expert', 'Intermediate', 'Women',
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert',
    'Men'
  ) NOT NULL;

ALTER TABLE teams
  MODIFY division ENUM(
    'Expert', 'Intermediate', 'Women',
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert',
    'Men'
  ) NOT NULL;

ALTER TABLE matches
  MODIFY division ENUM(
    'Expert', 'Intermediate', 'Women',
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert',
    'Men'
  ) NOT NULL;

ALTER TABLE team_pairing_rules
  MODIFY division ENUM(
    'Expert', 'Intermediate', 'Women',
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert',
    'Men'
  ) NOT NULL;

ALTER TABLE tournament_archives
  MODIFY division ENUM(
    'Expert', 'Intermediate', 'Women',
    'Men-Beginner', 'Men-Intermediate', 'Men-Expert',
    'Women-Beginner', 'Women-Intermediate', 'Women-Expert',
    'Men'
  ) NOT NULL;

-- Step 2: migrate all rows to Men or Women
UPDATE teams SET division = 'Men'
WHERE division IN ('Expert', 'Intermediate', 'Men-Beginner', 'Men-Intermediate', 'Men-Expert');

UPDATE teams SET division = 'Women'
WHERE division IN ('Women-Beginner', 'Women-Intermediate', 'Women-Expert');

UPDATE matches SET division = 'Men'
WHERE division IN ('Expert', 'Intermediate', 'Men-Beginner', 'Men-Intermediate', 'Men-Expert');

UPDATE matches SET division = 'Women'
WHERE division IN ('Women-Beginner', 'Women-Intermediate', 'Women-Expert');

UPDATE team_pairing_rules SET division = 'Men'
WHERE division IN ('Expert', 'Intermediate', 'Men-Beginner', 'Men-Intermediate', 'Men-Expert');

UPDATE team_pairing_rules SET division = 'Women'
WHERE division IN ('Women-Beginner', 'Women-Intermediate', 'Women-Expert');

UPDATE tournament_archives SET division = 'Men'
WHERE division IN ('Expert', 'Intermediate', 'Men-Beginner', 'Men-Intermediate', 'Men-Expert');

UPDATE tournament_archives SET division = 'Women'
WHERE division IN ('Women-Beginner', 'Women-Intermediate', 'Women-Expert');

DELETE FROM division_settings;

INSERT INTO division_settings (division, competition_format) VALUES
  ('Men', 'doubles'),
  ('Women', 'doubles');

-- Step 3: shrink ENUMs to gender divisions only
ALTER TABLE division_settings
  MODIFY division ENUM('Men', 'Women') NOT NULL;

ALTER TABLE teams
  MODIFY division ENUM('Men', 'Women') NOT NULL;

ALTER TABLE matches
  MODIFY division ENUM('Men', 'Women') NOT NULL;

ALTER TABLE team_pairing_rules
  MODIFY division ENUM('Men', 'Women') NOT NULL;

ALTER TABLE tournament_archives
  MODIFY division ENUM('Men', 'Women') NOT NULL;

SELECT 'Migration 015 complete: 2 gender divisions (Men / Women)' AS message;
