'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Radio, Trophy, MapPin, Clock, Trash2 } from 'lucide-react'
import { formatOvers } from '@/lib/cricket-utils'
import { toast } from 'sonner'
import { Match } from '@/lib/types'

export default function Home() {
  const [matches, setMatches] = useState<Match[]>([])
  // summary stored per-match with optional scores for both sides, current batting team, toss, and final result
  interface Summary {
    teamAScore?: string
    teamAOvers?: string
    teamBScore?: string
    teamBOvers?: string
    battingTeam?: 'a' | 'b'
    toss?: string
    result?: string
  }
  const [matchSummaries, setMatchSummaries] = useState<Record<string, Summary>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/matches')
      .then(r => r.json())
      .then(d => {
        const list: Match[] = (d.matches || []).map((m: Match) => ({
          ...m,
          team_a_name: m.team_a_name.toUpperCase(),
          team_b_name: m.team_b_name.toUpperCase(),
        }))
        setMatches(list)
        // after getting base list, fetch details for each
        return list
      })
      .then(async (list: Match[]) => {
        const summaries: Record<string, Summary> = {}
        await Promise.all(
          list.map(async m => {
            try {
              const res = await fetch(`/api/matches/${m.id}`)
              if (!res.ok) return
              const data = await res.json()
              const { match, innings } = data as any

              // initialize empty scores
              const s: Summary = {}

              if (innings && innings.length > 0) {
                // gather scores for each batting team
                innings.forEach((inn: any) => {
                  const scoreStr = `${inn.total_runs}/${inn.total_wickets}`
                  const oversStr = `(${formatOvers(inn.total_balls)})`
                  if (inn.batting_team === 'a') {
                    s.teamAScore = scoreStr
                    s.teamAOvers = oversStr
                  } else {
                    s.teamBScore = scoreStr
                    s.teamBOvers = oversStr
                  }
                })

                // determine current innings for live/ongoing info
                const current = innings.find((i: any) => !i.is_completed) || innings[innings.length - 1]
                if (current) {
                  s.battingTeam = current.batting_team
                }
              }

              // if match has been completed but no innings data (unlikely) or just want result text
              if (match.status === 'completed' && match.result_summary) {
                s.result = match.result_summary
              }

              // toss info
              if (match.toss_winner && match.toss_decision) {
                const tname = match.toss_winner === 'a' ? match.team_a_name : match.team_b_name
                s.toss = `Toss: ${tname} chose to ${match.toss_decision.toLowerCase()}`
              }

              summaries[m.id] = s
            } catch {}
          })
        )
        setMatchSummaries(summaries)
      })
      .finally(() => setLoading(false))
  }, [])

  const liveMatches = matches.filter(m => m.status === 'live' || m.status === 'innings_break')
  const upcomingMatches = matches.filter(m => m.status === 'upcoming')
  const completedMatches = matches.filter(m => m.status === 'completed')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-blue-100 sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-bold text-blue-900 tracking-tight">KMR9-LiveScore</h1>
          </div>
          <Link
            href="/create"
            className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Match
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <Trophy className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">No matches yet</h2>
              <p className="text-gray-500 text-sm mt-1">Create your first match to get started</p>
            </div>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Match
            </Link>
          </div>
        ) : (
          <>
            {liveMatches.length > 0 && (
              <MatchSection
                title="Live"
                icon={<Radio className="w-4 h-4 text-red-500 animate-pulse" />}
                matches={liveMatches}
                summaries={matchSummaries}
                onDelete={(id: string) => setMatches(prev => prev.filter(m => m.id !== id))}
              />
            )}
            {upcomingMatches.length > 0 && (
              <MatchSection
                title="Upcoming"
                icon={<Clock className="w-4 h-4 text-blue-500" />}
                matches={upcomingMatches}
                summaries={matchSummaries}
                onDelete={(id: string) => setMatches(prev => prev.filter(m => m.id !== id))}
              />
            )}
            {completedMatches.length > 0 && (
              <MatchSection
                title="Completed"
                icon={<Trophy className="w-4 h-4 text-green-500" />}
                matches={completedMatches}
                summaries={matchSummaries}
                onDelete={(id: string) => setMatches(prev => prev.filter(m => m.id !== id))}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

function MatchSection({ title, icon, matches, onDelete, summaries }: { title: string; icon: React.ReactNode; matches: Match[]; onDelete: (id: string) => void; summaries: Record<string, Summary> }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">{title}</h2>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{matches.length}</span>
      </div>
      <div className="space-y-3">
        {matches.map(m => (
          <MatchCard key={m.id} match={m} onDelete={onDelete} summary={summaries[m.id] || {}} />
        ))}
      </div>
    </section>
  )
}

function MatchCard({ match, onDelete, summary }: { match: Match; onDelete: (id: string) => void; summary: Summary }) {
  const router = useRouter()
  const isLive = match.status === 'live' || match.status === 'innings_break'
  const startX = useRef(0)
  const dragging = useRef(false)
  const [translate, setTranslate] = useState(0)
  // summary now comes from props
  // const summary = matchSummaries[match.id] || {}
  const revealWidth = 88

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    startX.current = e.clientX
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const delta = e.clientX - startX.current
    if (delta < 0) {
      setTranslate(Math.max(delta, -revealWidth))
    } else {
      setTranslate(0)
    }
  }

  const handlePointerUp = () => {
    dragging.current = false
    if (translate <= -revealWidth / 2) setTranslate(-revealWidth)
    else setTranslate(0)
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (translate !== 0) {
      // if open, close on tap
      setTranslate(0)
      e.preventDefault()
      e.stopPropagation()
      return
    }
    router.push(`/match/${match.id}`)
  }

  const handleDelete = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    const pass = window.prompt('Enter match passcode to delete')
    if (!pass) return
    try {
      const res = await fetch(`/api/matches/${match.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: pass }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      toast.success('Match deleted')
      onDelete(match.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      toast.error(msg)
    }
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center justify-end pr-4">
        <button onClick={handleDelete} className="h-12 w-20 bg-red-50 text-red-600 rounded-md flex items-center justify-center">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleCardClick}
        style={{ transform: `translateX(${translate}px)` }}
        className={`rounded-xl p-4 border transition-all ${isLive ? 'bg-white border-blue-200 shadow-sm shadow-blue-100 hover:shadow-md' : 'bg-blue-50 border-blue-100 hover:shadow-md'}`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isLive ? 'bg-red-50 text-red-600' :
            match.status === 'upcoming' ? 'bg-blue-50 text-blue-600' :
            'bg-green-50 text-green-600'
          }`}>
            {isLive && <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full mr-1 animate-pulse" />}
            {match.status === 'innings_break' ? 'Innings Break' : match.status.charAt(0).toUpperCase() + match.status.slice(1)}
          </span>
          {match.location && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {match.location}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div>
            {/* team A line */}
            <p className={`font-semibold text-gray-900 ${match.status === 'completed' && match.winner === 'a' ? 'text-green-600' : ''}`}>              
              {match.team_a_name}{summary.teamAScore ? ` ${summary.teamAScore}` : ''}
              {summary.teamAOvers && (
                <span className="text-xs text-gray-400"> {summary.teamAOvers}</span>
              )}
              {match.status === 'completed' && match.winner === 'a' && (
                <Trophy className="inline w-3 h-3 text-green-600 ml-1" />
              )}
            </p>

            <p className="text-xs text-gray-400">vs</p>

            {/* team B line */}
            <p className={`font-semibold text-gray-900 ${match.status === 'completed' && match.winner === 'b' ? 'text-green-600' : ''}`}>              
              {match.team_b_name}{summary.teamBScore ? ` ${summary.teamBScore}` : ''}
              {summary.teamBOvers && (
                <span className="text-xs text-gray-400"> {summary.teamBOvers}</span>
              )}
              {match.status === 'completed' && match.winner === 'b' && (
                <Trophy className="inline w-3 h-3 text-green-600 ml-1" />
              )}
            </p>

            {summary.toss && <p className="text-xs text-gray-500 mt-0.5">{summary.toss}</p>}
          </div>
          <div className="text-right">
            {/* show overs for current innings when live, otherwise show match total overs */}
            {match.status !== 'completed' && summary.battingTeam ? (
              <p className="text-xs text-gray-400">
                {summary.battingTeam === 'a' ? summary.teamAOvers : summary.teamBOvers}
              </p>
            ) : (
              <p className="text-xs text-gray-400">
                {match.total_overs} overs
              </p>
            )}
            {summary.result && (
              <p className="text-xs text-green-600 font-medium mt-1">{summary.result}</p>
            )}
          </div>
        </div>
      </div>
      </div>
  )
}
