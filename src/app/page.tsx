'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Radio, Trophy, MapPin, Clock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Match } from '@/lib/types'

export default function Home() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/matches')
      .then(r => r.json())
      .then(d => setMatches(d.matches || []))
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
                onDelete={(id: string) => setMatches(prev => prev.filter(m => m.id !== id))}
              />
            )}
            {upcomingMatches.length > 0 && (
              <MatchSection
                title="Upcoming"
                icon={<Clock className="w-4 h-4 text-blue-500" />}
                matches={upcomingMatches}
                onDelete={(id: string) => setMatches(prev => prev.filter(m => m.id !== id))}
              />
            )}
            {completedMatches.length > 0 && (
              <MatchSection
                title="Completed"
                icon={<Trophy className="w-4 h-4 text-green-500" />}
                matches={completedMatches}
                onDelete={(id: string) => setMatches(prev => prev.filter(m => m.id !== id))}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}

function MatchSection({ title, icon, matches, onDelete }: { title: string; icon: React.ReactNode; matches: Match[]; onDelete: (id: string) => void }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">{title}</h2>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{matches.length}</span>
      </div>
      <div className="space-y-3">
        {matches.map(m => (
          <MatchCard key={m.id} match={m} onDelete={onDelete} />
        ))}
      </div>
    </section>
  )
}

function MatchCard({ match, onDelete }: { match: Match; onDelete: (id: string) => void }) {
  const router = useRouter()
  const isLive = match.status === 'live' || match.status === 'innings_break'
  const startX = useRef(0)
  const dragging = useRef(false)
  const [translate, setTranslate] = useState(0)
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
        className={`bg-white rounded-xl p-4 border transition-all ${isLive ? 'border-blue-200 shadow-sm shadow-blue-100 hover:shadow-md' : 'border-gray-100 hover:shadow-md'}`}
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
            <p className="font-semibold text-gray-900">{match.team_a_name}</p>
            <p className="text-xs text-gray-400">vs</p>
            <p className="font-semibold text-gray-900">{match.team_b_name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">{match.total_overs} overs</p>
            {match.result_summary && (
              <p className="text-xs text-green-600 font-medium mt-1">{match.result_summary}</p>
            )}
          </div>
        </div>
      </div>
      </div>
  )
}
