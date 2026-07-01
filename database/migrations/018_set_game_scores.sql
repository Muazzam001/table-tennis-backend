-- Per-set game scores for margin-weighted standings tie-breaks
ALTER TABLE matches
  ADD COLUMN set_game_scores JSON NULL
  COMMENT 'Array of {team1, team2} game points per set played'
  AFTER score_team2;
