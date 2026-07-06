/** Tournament domain types for group stage + knockout and tier pyramid formats */

export type TournamentFormat =
  | 'groups'
  | 'groups-4'
  | 'pools-2'
  | 'single-group'
  | 'tier-pyramid';

export type TournamentStatus =
  | 'Draft'
  | 'Group Stage Active'
  | 'Group Stage Completed'
  | 'Quarterfinals Active'
  | 'Semifinals Active'
  | 'Final Active'
  | 'Completed';

/** Tier Pyramid tournament lifecycle (used when format is tier-pyramid) */
export type PyramidTournamentStatus =
  | 'Draft'
  | 'Level 1A Active'
  | 'Level 1A Complete'
  | 'Level 1B Waiting'
  | 'Level 1B Ready'
  | 'Level 1B Active'
  | 'Level 1B Complete'
  | 'Level 1 Active'
  | 'Level 1 Complete'
  | 'Level 2 Active'
  | 'Level 2 Complete'
  | 'Level 3 Active'
  | 'Level 3 Complete'
  | 'Semifinals Active'
  | 'Semifinals Complete'
  | 'Final Active'
  | 'Completed';

export type Level1bStatus = 'waiting' | 'ready' | 'active' | 'complete';

export type PyramidStage = 'S1' | 'S2' | 'L1B' | 'L2' | 'L3' | 'Final';

export type PyramidEntrantStage =
  | 'registered'
  | 'S1'
  | 'S2'
  | 'L1B'
  | 'L2'
  | 'L3'
  | 'final'
  | 'champion'
  | 'eliminated';

export type EntrantStatus = 'active' | 'advanced' | 'eliminated' | 'withdrawn';

export type PoolId = string;

export type RoundType =
  | 'Qualifying'
  | 'Quarter Final'
  | 'Semi Final'
  | 'Final'
  | 'Third Place'
  | 'S1'
  | 'S2'
  | 'Level 1B'
  | 'Level 2'
  | 'Level 3';

export interface Team {
  id: number;
  team_name: string;
  division?: string;
}

export interface TierPyramidConfig {
  format: 'tier-pyramid';
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  s1GroupCount: number;
  s1GroupSize: number;
  s1QualifiersPerGroup: number;
  l1bAdvanceCount: number;
  s2AdvanceCount: number;
  s2DropCount: number;
  l2AdvanceCount: number;
  l3AdvanceCount: number;
  auto_advance?: boolean;
}

export interface TierAssignment {
  teamId: number;
  tier: 1 | 2 | 3;
}

export interface PyramidEntrant extends Team {
  tier: 1 | 2 | 3;
  pyramid_stage: PyramidEntrantStage;
  pyramid_status: EntrantStatus;
  matches_won?: number;
  advancement_source?: string;
}

export interface SetGameScore {
  team1: number;
  team2: number;
}

export interface MatchResult {
  score_team1: number;
  score_team2: number;
  winner_team_id: number | null;
  status: string;
  is_abandoned?: boolean;
  /** Per-set game points, e.g. [{ team1: 11, team2: 7 }, { team1: 11, team2: 4 }] */
  set_game_scores?: SetGameScore[] | string | null;
  /** 11 or 21 — game length used when this result was recorded */
  game_point_format?: 11 | 21 | null;
}

export interface Match extends MatchResult {
  id?: number;
  team1_id: number;
  team2_id: number;
  team1_name?: string;
  team2_name?: string;
  scheduled_date?: string;
  venue?: string;
  round_type: RoundType;
  pool?: PoolId | null;
  pyramid_stage?: PyramidStage | null;
  stage_sequence?: number | null;
  division?: string;
}

export interface TournamentConfig {
  format: TournamentFormat;
  participantCount: number;
  groupCount: number;
  groupSize: number;
  qualifiersPerGroup: number;
  poolIds?: string[];
}

export interface StandingRow {
  id: number;
  team_name: string;
  rank: number;
  matches_played: number;
  matches_won: number;
  matches_lost: number;
  points: number;
  sets_won: number;
  sets_lost: number;
  set_difference: number;
  points_won: number;
  points_lost: number;
  /** NRR-style game-point margin: (points won per match) − (points lost per match) */
  point_difference: number;
  /** Knockout / shutout / margin quality from per-set game scores */
  margin_quality_score: number;
  /** Rewards dominant set-score wins (2-0) over narrow wins (2-1) */
  dominance_score: number;
  /** @deprecated Use sets_won — kept for API compatibility */
  games_won: number;
  /** @deprecated Use sets_lost — kept for API compatibility */
  games_lost: number;
  /** @deprecated Use set_difference — GD is NRR-style decimal (set rate for − set rate against) */
  game_difference: number;
}

export interface Group {
  id: PoolId;
  teams: Team[];
}

export interface KnockoutBracket {
  quarterFinals: BracketMatch[];
  semiFinals: BracketMatch[];
  final: BracketMatch | null;
  thirdPlace: BracketMatch | null;
}

export interface BracketMatch {
  id?: number;
  label: string;
  team1_id: number | null;
  team2_id: number | null;
  team1_name?: string;
  team2_name?: string;
  winner_team_id?: number | null;
  status?: string;
  scheduled_date?: string;
}

export interface Tournament {
  config: TournamentConfig;
  status: TournamentStatus;
  groups: Group[];
  standings: Record<PoolId, StandingRow[]>;
  bracket: KnockoutBracket;
  matches: Match[];
}
