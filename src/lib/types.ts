export type MatchStatus = 'upcoming' | 'live' | 'innings_break' | 'completed'

export interface Match {
  id: string
  team_a_name: string
  team_b_name: string
  total_overs: number
  location: string | null
  passcode_hash: string
  status: MatchStatus
  toss_winner: string | null
  toss_decision: 'BAT' | 'BOWL' | null
  man_of_match_id: string | null
  winner: string | null
  result_summary: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Player {
  id: string
  match_id: string
  name: string
  team: 'a' | 'b'
  batting_order: number | null
  created_at: string
}

export interface Innings {
  id: string
  match_id: string
  innings_number: 1 | 2
  batting_team: 'a' | 'b'
  bowling_team: 'a' | 'b'
  total_runs: number
  total_wickets: number
  total_overs_bowled: number
  total_balls: number
  total_extras: number
  is_completed: boolean
  striker_id: string | null
  non_striker_id: string | null
  current_bowler_id: string | null
  created_at: string
  updated_at: string
}

export interface BallEvent {
  id: string
  match_id: string
  innings_id: string
  over_number: number
  ball_number: number
  batsman_id: string
  bowler_id: string
  runs_scored: number
  is_extra: boolean
  extra_type: 'wide' | 'no_ball' | 'bye' | 'leg_bye' | null
  extra_runs: number
  is_wicket: boolean
  wicket_type: 'bowled' | 'caught' | 'lbw' | 'run_out' | 'stumped' | 'hit_wicket' | 'retired' | null
  dismissed_player_id: string | null
  is_boundary: boolean
  total_runs: number
  commentary: string | null
  is_undone: boolean
  created_at: string
}

export interface BatsmanStats {
  player: Player
  runs: number
  balls: number
  fours: number
  sixes: number
  strikeRate: number
  isOut: boolean
  dismissalText: string
}

export interface BowlerStats {
  player: Player
  overs: string
  balls: number
  maidens: number
  runs: number
  wickets: number
  economy: number
}

export interface MatchData {
  match: Match
  players: Player[]
  innings: Innings[]
  ballEvents: BallEvent[]
}
