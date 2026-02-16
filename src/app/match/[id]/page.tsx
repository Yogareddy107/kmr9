'use client'

import { useEffect, useState, useCallback, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { MatchData, BallEvent, Player, Innings } from '@/lib/types'
import {
  computeBatsmanStats,
  computeBowlerStats,
  formatBallDisplay,
  formatOvers,
  getCurrentRunRate,
  getRequiredRunRate,
} from '@/lib/cricket-utils'
import { Radio, MapPin, Clock, Trophy, ChevronDown, Share2, Wifi, WifiOff } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

type Tab = 'live' | 'scorecard' | 'scorer'

export default function MatchViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [matchData, setMatchData] = useState<MatchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('live')
  const [connected, setConnected] = useState(true)
  const [lastBallHighlight, setLastBallHighlight] = useState<string | null>(null)
  const [selectedInningsTab, setSelectedInningsTab] = useState<number>(1)
  const highlightTimeout = useRef<ReturnType<typeof setTimeout>>()

  const fetchMatch = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${id}`)
      if (!res.ok) { router.push('/'); return }
      const data = await res.json()
      setMatchData(data)
    } catch { router.push('/') }
    finally { setLoading(false) }
  }, [id, router])

  useEffect(() => { fetchMatch() }, [fetchMatch])

  // Real-time subscriptions
  useEffect(() => {
    const channel = supabase.channel(`match-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${id}`,
      }, () => { fetchMatch() })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'innings',
        filter: `match_id=eq.${id}`,
      }, () => { fetchMatch() })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ball_events',
        filter: `match_id=eq.${id}`,
      }, (payload) => {
        const newBall = payload.new as BallEvent
        // Trigger highlight
        if (newBall.is_wicket) {
          setLastBallHighlight('wicket')
        } else if (newBall.runs_scored === 6 && newBall.is_boundary) {
          setLastBallHighlight('six')
        } else if (newBall.runs_scored === 4 && newBall.is_boundary) {
          setLastBallHighlight('four')
        } else {
          setLastBallHighlight(null)
        }
        if (highlightTimeout.current) clearTimeout(highlightTimeout.current)
        highlightTimeout.current = setTimeout(() => setLastBallHighlight(null), 3000)
        fetchMatch()
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'ball_events',
        filter: `match_id=eq.${id}`,
      }, () => { fetchMatch() })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => { supabase.removeChannel(channel) }
  }, [id, fetchMatch])

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Match link copied!')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Loading match...</p>
        </div>
      </div>
    )
  }

  if (!matchData) return null

  const { match, players, innings, ballEvents } = matchData
  const activeBalls = ballEvents.filter(e => !e.is_undone)
  const currentInnings = innings.find(i => !i.is_completed) || innings[innings.length - 1]
  const firstInnings = innings.find(i => i.innings_number === 1)
  const secondInnings = innings.find(i => i.innings_number === 2)

  const inningsBalls = (inn: Innings) =>
    activeBalls.filter(e => e.innings_id === inn.id)

  // Current innings data
  const currentBalls = currentInnings ? inningsBalls(currentInnings) : []
  const striker = players.find(p => p.id === currentInnings?.striker_id)
  const nonStriker = players.find(p => p.id === currentInnings?.non_striker_id)
  const currentBowler = players.find(p => p.id === currentInnings?.current_bowler_id)

  const target = currentInnings?.innings_number === 2 && firstInnings
    ? firstInnings.total_runs + 1 : null

  // Batsman stats for current batsmen
  const strikerBalls = currentBalls.filter(e => e.batsman_id === striker?.id && e.extra_type !== 'wide')
  const strikerRuns = strikerBalls.reduce((s, e) => s + e.runs_scored, 0)
  const strikerFours = strikerBalls.filter(e => e.runs_scored === 4 && e.is_boundary).length
  const strikerSixes = strikerBalls.filter(e => e.runs_scored === 6 && e.is_boundary).length

  const nonStrikerBalls = currentBalls.filter(e => e.batsman_id === nonStriker?.id && e.extra_type !== 'wide')
  const nonStrikerRuns = nonStrikerBalls.reduce((s, e) => s + e.runs_scored, 0)

  // Bowler stats for current bowler
  const bowlerBalls = currentBalls.filter(e => e.bowler_id === currentBowler?.id)
  const bowlerLegalBalls = bowlerBalls.filter(e => e.extra_type !== 'wide' && e.extra_type !== 'no_ball').length
  const bowlerRuns = bowlerBalls.reduce((s, e) => s + e.total_runs, 0)
  const bowlerWickets = bowlerBalls.filter(e => e.is_wicket && e.wicket_type !== 'run_out').length

  // This over balls
  const legalBallCount = currentBalls.filter(e => e.extra_type !== 'wide' && e.extra_type !== 'no_ball').length
  const currentOverNumber = legalBallCount > 0 ? Math.floor((legalBallCount - 1) / 6) : 0
  const thisOverBalls = currentBalls.filter(e => e.over_number === currentOverNumber)

  // Fall of wickets
  const wicketBalls = currentBalls.filter(e => e.is_wicket)
  const fallOfWickets = wicketBalls.map((wb, i) => {
    const dismissedPlayer = players.find(p => p.id === wb.dismissed_player_id)
    const scoreAtWicket = currentBalls
      .filter(e => new Date(e.created_at) <= new Date(wb.created_at))
      .reduce((s, e) => s + e.total_runs, 0)
    return {
      wicketNum: i + 1,
      score: scoreAtWicket,
      player: dismissedPlayer?.name || 'Unknown',
      over: `${wb.over_number}.${wb.ball_number}`,
    }
  })

  // Partnership
  const lastWicketBall = wicketBalls[wicketBalls.length - 1]
  const partnershipBalls = lastWicketBall
    ? currentBalls.filter(e => new Date(e.created_at) > new Date(lastWicketBall.created_at))
    : currentBalls
  const partnershipRuns = partnershipBalls.reduce((s, e) => s + e.total_runs, 0)
  const partnershipBallCount = partnershipBalls.filter(e => e.extra_type !== 'wide' && e.extra_type !== 'no_ball').length

  // Commentary (latest first)
  const commentary = [...currentBalls].reverse().slice(0, 20)

  // Status badge
  const statusConfig: Record<string, { label: string; color: string; bg: string; dot?: boolean }> = {
    upcoming: { label: 'Upcoming', color: 'text-gray-600', bg: 'bg-gray-100' },
    live: { label: 'LIVE', color: 'text-red-600', bg: 'bg-red-50', dot: true },
    innings_break: { label: 'Innings Break', color: 'text-amber-600', bg: 'bg-amber-50' },
    completed: { label: 'Completed', color: 'text-green-600', bg: 'bg-green-50' },
  }
  const statusInfo = statusConfig[match.status] || statusConfig.upcoming

  // Highlight overlay class
  const highlightClass = lastBallHighlight === 'wicket'
    ? 'highlight-wicket'
    : lastBallHighlight === 'six'
    ? 'highlight-six'
    : lastBallHighlight === 'four'
    ? 'highlight-four'
    : ''

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 ${highlightClass}`}>
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-blue-100/50 sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center justify-between">
          <Link href="/" className="text-sm font-bold text-blue-700 tracking-tight">
            KMR9
          </Link>
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-red-500" />
            )}
            <button onClick={copyShareLink} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <Share2 className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto pb-8">
        {/* Score Card Hero */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 py-5 relative overflow-hidden">
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full border-[20px] border-white" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full border-[16px] border-white" />
          </div>

          <div className="relative z-10">
            {/* Match info */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                  match.status === 'live' ? 'bg-red-500/20 text-red-200' :
                  match.status === 'completed' ? 'bg-green-500/20 text-green-200' :
                  'bg-white/15 text-white/80'
                }`}>
                  {statusInfo.dot && <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />}
                  {statusInfo.label}
                </span>
              </div>
              {match.location && (
                <span className="text-[10px] text-blue-200 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {match.location}
                </span>
              )}
            </div>

            {/* Teams & Score */}
            <div className="space-y-2">
              {/* Team A */}
              <div className="flex items-center justify-between">
                <span className={`text-base font-semibold ${
                  currentInnings?.batting_team === 'a' ? 'text-white' : 'text-blue-200'
                }`}>
                  {match.team_a_name}
                </span>
                {firstInnings && (
                  <span className="text-lg font-bold">
                    {firstInnings.batting_team === 'a'
                      ? `${firstInnings.total_runs}/${firstInnings.total_wickets}`
                      : secondInnings && secondInnings.batting_team === 'a'
                      ? `${secondInnings.total_runs}/${secondInnings.total_wickets}`
                      : '-'}
                    <span className="text-sm text-blue-200 font-normal ml-1">
                      {firstInnings.batting_team === 'a'
                        ? `(${formatOvers(firstInnings.total_balls)})`
                        : secondInnings && secondInnings.batting_team === 'a'
                        ? `(${formatOvers(secondInnings.total_balls)})`
                        : ''}
                    </span>
                  </span>
                )}
              </div>

              {/* Team B */}
              <div className="flex items-center justify-between">
                <span className={`text-base font-semibold ${
                  currentInnings?.batting_team === 'b' ? 'text-white' : 'text-blue-200'
                }`}>
                  {match.team_b_name}
                </span>
                {innings.length > 0 && (
                  <span className="text-lg font-bold">
                    {firstInnings && firstInnings.batting_team === 'b'
                      ? `${firstInnings.total_runs}/${firstInnings.total_wickets}`
                      : secondInnings && secondInnings.batting_team === 'b'
                      ? `${secondInnings.total_runs}/${secondInnings.total_wickets}`
                      : '-'}
                    <span className="text-sm text-blue-200 font-normal ml-1">
                      {firstInnings && firstInnings.batting_team === 'b'
                        ? `(${formatOvers(firstInnings.total_balls)})`
                        : secondInnings && secondInnings.batting_team === 'b'
                        ? `(${formatOvers(secondInnings.total_balls)})`
                        : ''}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Status line */}
            <div className="mt-3 pt-3 border-t border-white/10">
              {match.status === 'completed' && match.result_summary ? (
                <p className="text-xs text-blue-100 font-medium flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-yellow-300" />
                  {match.result_summary}
                </p>
              ) : match.status === 'live' && currentInnings ? (
                <div className="flex items-center justify-between text-xs text-blue-200">
                  <span>CRR: {getCurrentRunRate(currentInnings.total_runs, currentInnings.total_balls)}</span>
                  {target && (
                    <span>
                      Need {target - currentInnings.total_runs} off{' '}
                      {match.total_overs * 6 - currentInnings.total_balls} balls
                      {' | '}RRR: {getRequiredRunRate(target, currentInnings.total_runs, match.total_overs * 6 - currentInnings.total_balls)}
                    </span>
                  )}
                  {!target && <span>{match.total_overs} overs</span>}
                </div>
              ) : match.status === 'innings_break' ? (
                <p className="text-xs text-amber-200 font-medium">Innings Break - {firstInnings && (firstInnings.batting_team === 'a' ? match.team_b_name : match.team_a_name)} need {(firstInnings?.total_runs || 0) + 1} to win</p>
              ) : (
                <p className="text-xs text-blue-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Match yet to begin
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-100 sticky top-[41px] z-40">
          <div className="flex">
            {(['live', 'scorecard', 'scorer'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={async () => {
                  if (tab === 'scorer') {
                    const pass = window.prompt('Enter scorer passcode')
                    if (!pass) return
                    try {
                      const res = await fetch(`/api/matches/${id}/verify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ passcode: pass }),
                      })
                      const data = await res.json()
                      if (data.valid) {
                        // navigate to scorer with passcode so scorer page can auto-verify
                        window.location.href = `/scorer/${id}?passcode=${encodeURIComponent(pass)}`
                      } else {
                        toast.error('Invalid passcode')
                      }
                    } catch {
                      toast.error('Verification failed')
                    }
                    return
                  }
                  setActiveTab(tab)
                }}
                className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                  activeTab === tab
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab === 'live' ? 'Live' : tab === 'scorecard' ? 'Scorecard' : 'Scorer'}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'live' ? (
          <div className="px-4 py-3 space-y-3">
            {/* Batsmen Section */}
            {currentInnings && match.status === 'live' && (striker || nonStriker) && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Batsmen</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {striker && (
                    <div className="px-3 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{striker.name}</span>
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">*</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-gray-900">{strikerRuns}</span>
                        <span className="text-xs text-gray-400 ml-1">({strikerBalls.length})</span>
                        {strikerFours > 0 && <span className="text-[10px] text-blue-500 ml-1.5">{strikerFours}x4</span>}
                        {strikerSixes > 0 && <span className="text-[10px] text-green-500 ml-1">{strikerSixes}x6</span>}
                      </div>
                    </div>
                  )}
                  {nonStriker && (
                    <div className="px-3 py-2.5 flex items-center justify-between">
                      <span className="text-sm text-gray-700">{nonStriker.name}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-gray-700">{nonStrikerRuns}</span>
                        <span className="text-xs text-gray-400 ml-1">({nonStrikerBalls.length})</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bowler Section */}
            {currentInnings && match.status === 'live' && currentBowler && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Bowler</p>
                </div>
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">{currentBowler.name}</span>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span>{Math.floor(bowlerLegalBalls / 6)}.{bowlerLegalBalls % 6} ov</span>
                    <span>{bowlerRuns} runs</span>
                    <span className="font-semibold text-gray-900">{bowlerWickets}W</span>
                  </div>
                </div>
              </div>
            )}

            {/* This Over */}
            {currentInnings && thisOverBalls.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Over {currentOverNumber + 1}
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {thisOverBalls.map(b => (
                    <span
                      key={b.id}
                      className={`w-8 h-8 flex items-center justify-center rounded-full text-[11px] font-bold transition-all ${
                        b.is_wicket ? 'bg-red-500 text-white ball-wicket' :
                        b.runs_scored === 6 && b.is_boundary ? 'bg-green-500 text-white ball-six' :
                        b.runs_scored === 4 && b.is_boundary ? 'bg-blue-500 text-white ball-four' :
                        b.runs_scored === 0 && !b.is_extra ? 'bg-gray-200 text-gray-500' :
                        b.is_extra ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-200' :
                        'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {formatBallDisplay(b)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mini Scorecard */}
            {currentInnings && (fallOfWickets.length > 0 || partnershipRuns > 0) && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                {/* Partnership */}
                {currentInnings && match.status === 'live' && striker && nonStriker && (
                  <div className="px-3 py-2.5 border-b border-gray-50">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Partnership</p>
                    <p className="text-sm text-gray-800">
                      <span className="font-bold">{partnershipRuns}</span>
                      <span className="text-gray-400 ml-1">({partnershipBallCount} balls)</span>
                    </p>
                  </div>
                )}

                {/* Fall of Wickets */}
                {fallOfWickets.length > 0 && (
                  <div className="px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Fall of Wickets</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {fallOfWickets.map(fow => (
                        <span key={fow.wicketNum} className="text-xs text-gray-600">
                          <span className="font-semibold text-gray-800">{fow.score}/{fow.wicketNum}</span>
                          <span className="text-gray-400 ml-0.5">({fow.player}, {fow.over})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Ball-by-Ball Commentary */}
            {commentary.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Commentary</p>
                </div>
                <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                  {commentary.map((ball, i) => {
                    const batsman = players.find(p => p.id === ball.batsman_id)
                    const bowler = players.find(p => p.id === ball.bowler_id)
                    return (
                      <div
                        key={ball.id}
                        className={`px-3 py-2.5 flex gap-3 ${
                          i === 0 && lastBallHighlight ? (
                            lastBallHighlight === 'wicket' ? 'bg-red-50' :
                            lastBallHighlight === 'six' ? 'bg-green-50' :
                            lastBallHighlight === 'four' ? 'bg-blue-50' : ''
                          ) : ''
                        }`}
                      >
                        <div className={`w-10 h-6 flex-shrink-0 flex items-center justify-center rounded text-[10px] font-bold ${
                          ball.is_wicket ? 'bg-red-100 text-red-700' :
                          ball.runs_scored === 6 && ball.is_boundary ? 'bg-green-100 text-green-700' :
                          ball.runs_scored === 4 && ball.is_boundary ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {ball.over_number}.{ball.ball_number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 leading-relaxed">
                            {ball.commentary || `${bowler?.name || ''} to ${batsman?.name || ''}, ${formatBallDisplay(ball)}`}
                          </p>
                        </div>
                        <span className={`text-xs font-bold flex-shrink-0 ${
                          ball.is_wicket ? 'text-red-600' :
                          ball.runs_scored === 6 && ball.is_boundary ? 'text-green-600' :
                          ball.runs_scored === 4 && ball.is_boundary ? 'text-blue-600' :
                          'text-gray-500'
                        }`}>
                          {formatBallDisplay(ball)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Upcoming state */}
            {match.status === 'upcoming' && (
              <div className="bg-white rounded-xl border border-gray-100 p-6 text-center space-y-2 shadow-sm">
                <Clock className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-base font-semibold text-gray-700">Match hasn&apos;t started yet</p>
                <p className="text-xs text-gray-400">{match.total_overs} overs match</p>
              </div>
            )}

            {/* Match Summary (completed) */}
            {match.status === 'completed' && (
              <MatchSummary matchData={matchData} />
            )}
          </div>
        ) : (
          /* SCORECARD TAB */
          <div className="px-4 py-3 space-y-3">
            {/* Innings selector */}
            {innings.length > 0 && (
              <div className="flex gap-2">
                {innings.map(inn => (
                  <button
                    key={inn.innings_number}
                    onClick={() => setSelectedInningsTab(inn.innings_number)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                      selectedInningsTab === inn.innings_number
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    {inn.batting_team === 'a' ? match.team_a_name : match.team_b_name}
                    {' '}{inn.total_runs}/{inn.total_wickets}
                  </button>
                ))}
              </div>
            )}

            {innings.length > 0 ? (
              <FullScorecard
                innings={innings.find(i => i.innings_number === selectedInningsTab) || innings[0]}
                ballEvents={activeBalls}
                players={players}
                match={match}
              />
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-6 text-center shadow-sm">
                <p className="text-sm text-gray-400">Scorecard will be available when the match starts</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

/* Full Scorecard Component */
function FullScorecard({ innings, ballEvents, players, match }: {
  innings: Innings
  ballEvents: BallEvent[]
  players: Player[]
  match: MatchData['match']
}) {
  const innBalls = ballEvents.filter(e => e.innings_id === innings.id)
  const batsmanStats = computeBatsmanStats(innBalls, players, innings.batting_team as 'a' | 'b')
  const bowlerStats = computeBowlerStats(innBalls, players, innings.bowling_team as 'a' | 'b')

  const battedStats = batsmanStats.filter(b => b.balls > 0 || b.isOut)
  const yetToBat = batsmanStats.filter(b => b.balls === 0 && !b.isOut)

  // Extras breakdown
  const wides = innBalls.filter(e => e.extra_type === 'wide').length
  const noBalls = innBalls.filter(e => e.extra_type === 'no_ball').length
  const byes = innBalls.filter(e => e.extra_type === 'bye').reduce((s, e) => s + e.runs_scored, 0)
  const legByes = innBalls.filter(e => e.extra_type === 'leg_bye').reduce((s, e) => s + e.runs_scored, 0)

  return (
    <div className="space-y-3">
      {/* Batting */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Batting</p>
          <p className="text-[10px] text-gray-400">
            {innings.batting_team === 'a' ? match.team_a_name : match.team_b_name}
          </p>
        </div>

        {/* Header */}
        <div className="px-3 py-1.5 flex items-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-50">
          <span className="flex-1">Batter</span>
          <span className="w-8 text-center">R</span>
          <span className="w-8 text-center">B</span>
          <span className="w-8 text-center">4s</span>
          <span className="w-8 text-center">6s</span>
          <span className="w-10 text-center">SR</span>
        </div>

        {battedStats.map(b => (
          <div key={b.player.id} className="px-3 py-2 flex items-center border-b border-gray-50 last:border-0">
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold truncate ${b.isOut ? 'text-gray-500' : 'text-gray-900'}`}>
                {b.player.name}
                {!b.isOut && innings.striker_id === b.player.id && <span className="text-blue-500 ml-1">*</span>}
              </p>
              <p className="text-[10px] text-gray-400 truncate">{b.isOut ? b.dismissalText : 'not out'}</p>
            </div>
            <span className={`w-8 text-center text-xs font-bold ${b.isOut ? 'text-gray-500' : 'text-gray-900'}`}>{b.runs}</span>
            <span className="w-8 text-center text-[11px] text-gray-500">{b.balls}</span>
            <span className="w-8 text-center text-[11px] text-gray-500">{b.fours}</span>
            <span className="w-8 text-center text-[11px] text-gray-500">{b.sixes}</span>
            <span className="w-10 text-center text-[11px] text-gray-500">{b.strikeRate.toFixed(1)}</span>
          </div>
        ))}

        {/* Extras & Total */}
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Extras</span>
            <span className="font-semibold text-gray-700">
              {innings.total_extras}
              <span className="text-[10px] text-gray-400 ml-1">
                (wd {wides}, nb {noBalls}, b {byes}, lb {legByes})
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-200">
            <span className="font-bold text-gray-800">Total</span>
            <span className="font-bold text-gray-900">
              {innings.total_runs}/{innings.total_wickets}
              <span className="text-gray-400 font-normal ml-1">({formatOvers(innings.total_balls)} ov)</span>
            </span>
          </div>
        </div>

        {/* Yet to bat */}
        {yetToBat.length > 0 && (
          <div className="px-3 py-2 border-t border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Yet to Bat</p>
            <p className="text-xs text-gray-600">{yetToBat.map(b => b.player.name).join(', ')}</p>
          </div>
        )}
      </div>

      {/* Bowling */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Bowling</p>
          <p className="text-[10px] text-gray-400">
            {innings.bowling_team === 'a' ? match.team_a_name : match.team_b_name}
          </p>
        </div>

        {/* Header */}
        <div className="px-3 py-1.5 flex items-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-50">
          <span className="flex-1">Bowler</span>
          <span className="w-8 text-center">O</span>
          <span className="w-8 text-center">M</span>
          <span className="w-8 text-center">R</span>
          <span className="w-8 text-center">W</span>
          <span className="w-10 text-center">Eco</span>
        </div>

        {bowlerStats.map(b => (
          <div key={b.player.id} className="px-3 py-2 flex items-center border-b border-gray-50 last:border-0">
            <span className="flex-1 text-xs font-semibold text-gray-900 truncate">{b.player.name}</span>
            <span className="w-8 text-center text-[11px] text-gray-600">{b.overs}</span>
            <span className="w-8 text-center text-[11px] text-gray-500">{b.maidens}</span>
            <span className="w-8 text-center text-[11px] text-gray-600">{b.runs}</span>
            <span className="w-8 text-center text-xs font-bold text-gray-900">{b.wickets}</span>
            <span className="w-10 text-center text-[11px] text-gray-500">{b.economy.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* Match Summary Component */
function MatchSummary({ matchData }: { matchData: MatchData }) {
  const { match, players, innings, ballEvents } = matchData
  const activeBalls = ballEvents.filter(e => !e.is_undone)

  // Top scorer
  let topScorer = { name: '', runs: 0, balls: 0 }
  players.forEach(p => {
    const faced = activeBalls.filter(e => e.batsman_id === p.id && e.extra_type !== 'wide')
    const runs = faced.reduce((s, e) => s + e.runs_scored, 0)
    if (runs > topScorer.runs) {
      topScorer = { name: p.name, runs, balls: faced.length }
    }
  })

  // Best bowler
  let bestBowler = { name: '', wickets: 0, runs: 0, balls: 0 }
  players.forEach(p => {
    const bowled = activeBalls.filter(e => e.bowler_id === p.id)
    const wickets = bowled.filter(e => e.is_wicket && e.wicket_type !== 'run_out').length
    const runs = bowled.reduce((s, e) => s + e.total_runs, 0)
    const balls = bowled.filter(e => e.extra_type !== 'wide' && e.extra_type !== 'no_ball').length
    if (wickets > bestBowler.wickets || (wickets === bestBowler.wickets && runs < bestBowler.runs)) {
      bestBowler = { name: p.name, wickets, runs, balls }
    }
  })

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Match Summary</p>
      </div>
      <div className="p-3 space-y-2">
        {match.result_summary && (
          <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg">
            <Trophy className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-xs font-semibold text-green-800">{match.result_summary}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-blue-50 rounded-lg p-2.5">
            <p className="text-[10px] text-blue-500 font-semibold uppercase">Top Scorer</p>
            <p className="text-sm font-bold text-blue-900">{topScorer.name}</p>
            <p className="text-xs text-blue-600">{topScorer.runs} ({topScorer.balls})</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-2.5">
            <p className="text-[10px] text-purple-500 font-semibold uppercase">Best Bowler</p>
            <p className="text-sm font-bold text-purple-900">{bestBowler.name}</p>
            <p className="text-xs text-purple-600">{bestBowler.wickets}/{bestBowler.runs} ({formatOvers(bestBowler.balls)})</p>
          </div>
        </div>
      </div>
    </div>
  )
}
