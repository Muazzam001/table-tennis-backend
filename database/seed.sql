-- Seed data for testing and development
-- Seeds players only (28 Expert men). Teams and matches are created via the app:
--   1. Home page: "Seed Demo Players" (admin)
--   2. Teams page: generate and save teams per league
--   3. Matches page: generate group-stage schedule and knockout rounds
--   API: POST /api/seed/players  (legacy alias: POST /api/seed/teams-and-matches)
--
-- Tournament note: flexible group stage requires an EVEN number of teams per league
-- (minimum 4). Example: 28 players → 14 Expert teams → 2 groups of 7.
-- Team names are short labels only (e.g. "1", "2"); league is stored on teams.league.
--
-- Usage: mysql -u root -p < database/seed.sql
-- Prerequisite: database/schema.sql must be applied first

USE table_tennis_tournament;

-- Clear existing player seed data (optional — comment out to append)
-- DELETE FROM players WHERE email LIKE '%@ebitlogix.com';

-- ('Waheed A', 'waheed.a@ebitlogix.com', 'Expert', 'Men', TRUE),
-- ('Mahboob H', 'mahboob.h@ebitlogix.com', 'Expert', 'Men', TRUE),
-- ('Aqib M', 'aqib.m@ebitlogix.com', 'Expert', 'Men', TRUE),

-- Expert players (Men)
INSERT INTO players (name, email, expertise_level, category, is_active) VALUES
('Zafar A', 'zafar.a@ebitlogix.com', 'Expert', 'Men', TRUE),
('Zaigham B', 'zaigham.b@ebitlogix.com', 'Expert', 'Men', TRUE),
('Besalat A', 'besalat.a@ebitlogix.com', 'Expert', 'Men', TRUE),
('Ali R', 'ali.r@ebitlogix.com', 'Expert', 'Men', TRUE),
('Bilal S', 'bilal.s@ebitlogix.com', 'Expert', 'Men', TRUE),
('Shahrukh K', 'shahrukh.k@ebitlogix.com', 'Expert', 'Men', TRUE),
('Uzair A', 'uzair.a@ebitlogix.com', 'Expert', 'Men', TRUE),
('Mehroz K', 'mehroz.k@ebitlogix.com', 'Expert', 'Men', TRUE),
('Muazzam Y', 'muazzam.y@ebitlogix.com', 'Expert', 'Men', TRUE),
('Ghulam D', 'ghulam.gd@ebitlogix.com', 'Expert', 'Men', TRUE),
('Ramzan K', 'ramzan.k@ebitlogix.com', 'Expert', 'Men', TRUE),
('M Arshad', 'm.arshad@ebitlogix.com', 'Expert', 'Men', TRUE),
('Salman M', 'salman.m@ebitlogix.com', 'Expert', 'Men', TRUE),
('Zeeshan F', 'zeeshan.f@ebitlogix.com', 'Expert', 'Men', TRUE),
('Haroon R', 'haroon.r@ebitlogix.com', 'Expert', 'Men', TRUE),
('Hamza QA', 'hamza.qa@ebitlogix.com', 'Expert', 'Men', TRUE),
('M Inamullah', 'm.inamullah@ebitlogix.com', 'Expert', 'Men', TRUE),
('Ahmad T', 'ahmad.t@ebitlogix.com', 'Expert', 'Men', TRUE),
('M Naseem', 'm.naseem@ebitlogix.com', 'Expert', 'Men', TRUE),
('Arslan QA', 'arslan.qa@ebitlogix.com', 'Expert', 'Men', TRUE),
('Usama S', 'usama.s@ebitlogix.com', 'Expert', 'Men', TRUE),
('Zaeem A', 'zaeem.a@ebitlogix.com', 'Expert', 'Men', TRUE),
('M Waqas', 'm.waqas@ebitlogix.com', 'Expert', 'Men', TRUE),
('Aizaz A', 'aizaz.a@ebitlogix.com', 'Expert', 'Men', TRUE),
('Faizan R', 'faizan.r@ebitlogix.com', 'Expert', 'Men', TRUE),
('Anees R', 'anees.r@ebitlogix.com', 'Expert', 'Men', TRUE),
('M Usman', 'm.usman@ebitlogix.com', 'Expert', 'Men', TRUE),
('Hamza I', 'hamza.i@ebitlogix.com', 'Expert', 'Men', TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  expertise_level = VALUES(expertise_level),
  category = VALUES(category),
  is_active = VALUES(is_active);

-- Intermediate players (Men) — add via app or extend this file as needed
-- INSERT INTO players (name, email, expertise_level, category, is_active) VALUES ...

-- ('Masooma Z', 'masooma.z@ebitlogix.com', 'Expert', 'Women', TRUE),
-- ('Arshia T', 'arshia.t@ebitlogix.com', 'Expert', 'Women', TRUE),
-- ('Zainab K', 'zainab.k@ebitlogix.com', 'Expert', 'Women', TRUE),

-- Women players — add via app or extend this file as needed
-- INSERT INTO players (name, email, expertise_level, category, is_active) VALUES ...
INSERT INTO players (name, email, expertise_level, category, is_active) VALUES
('Ayesha A', 'ayesha.a@ebitlogix.com', 'Expert', 'Women', TRUE),
('Benish A', 'benish.a@ebitlogix.com', 'Expert', 'Women', TRUE),
('Urwah A', 'urwah.a@ebitlogix.com', 'Expert', 'Women', TRUE),
('Hafsa S', 'hafsa.s@ebitlogix.com', 'Expert', 'Women', TRUE),
('Malaika K', 'malaika.k@ebitlogix.com', 'Expert', 'Women', TRUE),
('Mahnoor T', 'mahnoor.t@ebitlogix.com', 'Expert', 'Women', TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  expertise_level = VALUES(expertise_level),
  category = VALUES(category),
  is_active = VALUES(is_active);
SELECT CONCAT('Seeded ', COUNT(*), ' players') AS message FROM players WHERE is_active = TRUE;
