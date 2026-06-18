/** Tournament domain types for group stage + knockout format */

export type TournamentFormat = 'groups' | 'groups-4' | 'pools-2';

export type TournamentStatus =
  | 'Draft'
  | 'Group Stage Active'
  | 'Group Stage Completed'
  | 'Quarterfinals Active'
  | 'Semifinals Active'
  | 'Final Active'
  | 'Completed';

export type PoolId = string;

export type RoundType =
  | 'Qualifying'
  | 'Quarter Final'
  | 'Semi Final'
  | 'Final'
  | 'Third Place';

export interface Team {
  id: number;
  team_name: string;
  league?: string;
}

export interface MatchResult {
  score_team1: number;
  score_team2: number;
  winner_team_id: number | null;
  status: string;
  is_abandoned?: boolean;
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
  league?: string;
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
