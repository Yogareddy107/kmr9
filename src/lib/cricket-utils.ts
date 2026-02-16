import { BallEvent, Player, BatsmanStats, BowlerStats } from './types'

export function computeBatsmanStats(
  ballEvents: BallEvent[],
  players: Player[],
  battingTeam: 'a' | 'b'
): BatsmanStats[] {
  const batsmen = players.filter(p => p.team === battingTeam)
  const active = ballEvents.filter(e => !e.is_undone)

  return batsmen.map(player => {
    const faced = active.filter(
      e => e.batsman_id === player.id && e.extra_type !== 'wide'
    )
    const runs = faced.reduce((sum, e) => sum + e.runs_scored, 0)
    const balls = faced.length
    const fours = faced.filter(e => e.runs_scored === 4 && e.is_boundary).length
    const sixes = faced.filter(e => e.runs_scored === 6 && e.is_boundary).length

    const dismissal = active.find(
      e => e.is_wicket && e.dismissed_player_id === player.id
    )

    let dismissalText = ''
    if (dismissal) {
      const bowler = players.find(p => p.id === dismissal.bowler_id)
      dismissalText = `${dismissal.wicket_type} b ${bowler?.name || ''}`
    }

    return {
      player,
      runs,
      balls,
      fours,
      sixes,
      strikeRate: balls > 0 ? (runs / balls) * 100 : 0,
      isOut: !!dismissal,
      dismissalText,
    }
  })
}

export function computeBowlerStats(
  ballEvents: BallEvent[],
  players: Player[],
  bowlingTeam: 'a' | 'b'
): BowlerStats[] {
  const bowlers = players.filter(p => p.team === bowlingTeam)
  const active = ballEvents.filter(e => !e.is_undone)

  return bowlers
    .map(player => {
      const bowled = active.filter(e => e.bowler_id === player.id)
      const legalBalls = bowled.filter(
        e => e.extra_type !== 'wide' && e.extra_type !== 'no_ball'
      ).length
      const runs = bowled.reduce((sum, e) => sum + e.total_runs, 0)
      const wickets = bowled.filter(
        e => e.is_wicket && e.wicket_type !== 'run_out'
      ).length

      const completedOvers = Math.floor(legalBalls / 6)
      const remainingBalls = legalBalls % 6
      const oversStr = `${completedOvers}.${remainingBalls}`

      // Maidens
      let maidens = 0
      const overMap = new Map<number, BallEvent[]>()
      bowled.forEach(e => {
        const key = e.over_number
        if (!overMap.has(key)) overMap.set(key, [])
        overMap.get(key)!.push(e)
      })
      overMap.forEach(events => {
        const legalInOver = events.filter(
          e => e.extra_type !== 'wide' && e.extra_type !== 'no_ball'
        )
        if (legalInOver.length === 6) {
          const totalRuns = events.reduce((s, e) => s + e.total_runs, 0)
          if (totalRuns === 0) maidens++
        }
      })

      const economy =
        legalBalls > 0 ? (runs / (legalBalls / 6)) : 0

      return {
        player,
        overs: oversStr,
        balls: legalBalls,
        maidens,
        runs,
        wickets,
        economy,
      }
    })
    .filter(b => b.balls > 0 || b.wickets > 0)
}

export function getThisOverBalls(ballEvents: BallEvent[], currentOver: number): BallEvent[] {
  return ballEvents
    .filter(e => !e.is_undone && e.over_number === currentOver)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export function formatBallDisplay(event: BallEvent): string {
  if (event.is_wicket) return 'W'
  if (event.extra_type === 'wide') return `${event.total_runs}Wd`
  if (event.extra_type === 'no_ball') return `${event.total_runs}Nb`
  if (event.extra_type === 'bye') return `${event.runs_scored}B`
  if (event.extra_type === 'leg_bye') return `${event.runs_scored}Lb`
  return event.runs_scored.toString()
}

export function formatOvers(balls: number): string {
  const overs = Math.floor(balls / 6)
  const rem = balls % 6
  return `${overs}.${rem}`
}

export function generateCommentary(event: BallEvent, batsman: Player, bowler: Player): string {
  const over = `${event.over_number}.${event.ball_number}`
  if (event.is_wicket) {
    return `${over} - OUT! ${batsman.name} ${event.wicket_type}. ${bowler.name} strikes!`
  }
  if (event.extra_type === 'wide') {
    return `${over} - Wide ball, ${event.extra_runs} extra run(s)`
  }
  if (event.extra_type === 'no_ball') {
    return `${over} - No ball! ${event.runs_scored} run(s) scored`
  }
  if (event.runs_scored === 6) {
    return `${over} - SIX! ${batsman.name} smashes ${bowler.name} for a maximum!`
  }
  if (event.runs_scored === 4) {
    return `${over} - FOUR! ${batsman.name} finds the boundary off ${bowler.name}`
  }
  if (event.runs_scored === 0) {
    return `${over} - Dot ball. ${bowler.name} to ${batsman.name}, no run`
  }
  return `${over} - ${batsman.name} takes ${event.runs_scored} run(s) off ${bowler.name}`
}

export function getCurrentRunRate(runs: number, balls: number): string {
  if (balls === 0) return '0.00'
  return ((runs / balls) * 6).toFixed(2)
}

export function getRequiredRunRate(target: number, currentRuns: number, ballsRemaining: number): string {
  if (ballsRemaining <= 0) return '0.00'
  const needed = target - currentRuns
  return ((needed / ballsRemaining) * 6).toFixed(2)
}
