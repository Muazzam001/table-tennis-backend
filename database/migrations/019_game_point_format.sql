-- Per-match game length (11 or 21 point games) for margin / knockout tie-breaks
ALTER TABLE matches
  ADD COLUMN game_point_format TINYINT UNSIGNED NOT NULL DEFAULT 11
  COMMENT '11 or 21 point games when result was recorded'
  AFTER set_game_scores;
