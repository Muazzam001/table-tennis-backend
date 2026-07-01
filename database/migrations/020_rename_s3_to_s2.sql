-- Rename Tier Pyramid stage S3 → S2 (Tier 1 round-robin at Level 1)
-- Step 1: add S2 to enums (if upgrading from S3-only schema)

ALTER TABLE matches
  MODIFY round_type ENUM(
    'Qualifying', 'Quarter Final', 'Semi Final', 'Final', 'Third Place',
    'S1', 'S3', 'S2', 'Level 2', 'Level 3'
  ) NOT NULL DEFAULT 'Qualifying';

ALTER TABLE matches
  MODIFY pyramid_stage ENUM('S1', 'S3', 'S2', 'L2', 'L3', 'Final') NULL;

ALTER TABLE teams
  MODIFY pyramid_stage ENUM(
    'registered', 'S1', 'S3', 'S2', 'L2', 'L3', 'final', 'champion', 'eliminated'
  ) NULL;

-- Step 2: migrate data
UPDATE matches SET round_type = 'S2' WHERE round_type = 'S3';
UPDATE matches SET pyramid_stage = 'S2' WHERE pyramid_stage = 'S3';

UPDATE teams SET pyramid_stage = 'S2' WHERE pyramid_stage = 'S3';
UPDATE teams
SET advancement_source = REPLACE(advancement_source, 'S3-', 'S2-')
WHERE advancement_source LIKE 'S3-%';

UPDATE tournament_progression_log SET from_stage = 'S2' WHERE from_stage = 'S3';
UPDATE tournament_progression_log SET to_stage = 'S2' WHERE to_stage = 'S3';

UPDATE division_settings
SET format_config = REPLACE(
  REPLACE(format_config, '"s3AdvanceCount"', '"s2AdvanceCount"'),
  '"s3DropCount"', '"s2DropCount"'
)
WHERE tournament_format = 'tier-pyramid' AND format_config IS NOT NULL;

-- Step 3: drop S3 from enums
ALTER TABLE teams
  MODIFY pyramid_stage ENUM(
    'registered', 'S1', 'S2', 'L2', 'L3', 'final', 'champion', 'eliminated'
  ) NULL;

ALTER TABLE matches
  MODIFY round_type ENUM(
    'Qualifying', 'Quarter Final', 'Semi Final', 'Final', 'Third Place',
    'S1', 'S2', 'Level 2', 'Level 3'
  ) NOT NULL DEFAULT 'Qualifying';

ALTER TABLE matches
  MODIFY pyramid_stage ENUM('S1', 'S2', 'L2', 'L3', 'Final') NULL;
