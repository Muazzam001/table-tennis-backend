-- Level 1B stage: extend pyramid enums and add level1b_status gate column

ALTER TABLE division_settings
  ADD COLUMN level1b_status ENUM('waiting', 'ready', 'active', 'complete')
    NOT NULL DEFAULT 'waiting'
    COMMENT 'Stage gate for Level 1B (between S1 and Level 2)';

ALTER TABLE teams
  MODIFY COLUMN pyramid_stage ENUM(
    'registered', 'S1', 'S2', 'L1B', 'L2', 'L3', 'final', 'champion', 'eliminated'
  ) NULL;

ALTER TABLE matches
  MODIFY COLUMN round_type ENUM(
    'Qualifying', 'Quarter Final', 'Semi Final', 'Final', 'Third Place',
    'S1', 'S2', 'Level 1B', 'Level 2', 'Level 3'
  ) DEFAULT 'Qualifying';

ALTER TABLE matches
  MODIFY COLUMN pyramid_stage ENUM('S1', 'S2', 'L1B', 'L2', 'L3', 'Final') NULL;
