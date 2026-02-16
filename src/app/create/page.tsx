'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, X, Users, Trophy, MapPin, Lock, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function CreateMatch() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [teamAName, setTeamAName] = useState('')
  const [teamBName, setTeamBName] = useState('')
  const [totalOvers, setTotalOvers] = useState(20)
  const [location, setLocation] = useState('')
  const [passcode, setPasscode] = useState('')
  const [playersA, setPlayersA] = useState<string[]>(Array(11).fill(''))
  const [playersB, setPlayersB] = useState<string[]>(Array(11).fill(''))
  const [step, setStep] = useState(1) // 1: match info, 2: team A, 3: team B

  const updatePlayer = (team: 'a' | 'b', idx: number, value: string) => {
    if (team === 'a') {
      const copy = [...playersA]
      copy[idx] = value
      setPlayersA(copy)
    } else {
      const copy = [...playersB]
      copy[idx] = value
      setPlayersB(copy)
    }
  }

  const addPlayer = (team: 'a' | 'b') => {
    if (team === 'a') setPlayersA([...playersA, ''])
    else setPlayersB([...playersB, ''])
  }

  const removePlayer = (team: 'a' | 'b', idx: number) => {
    if (team === 'a' && playersA.length > 2) {
      setPlayersA(playersA.filter((_, i) => i !== idx))
    } else if (team === 'b' && playersB.length > 2) {
      setPlayersB(playersB.filter((_, i) => i !== idx))
    }
  }

  const handleSubmit = async () => {
    const filteredA = playersA.filter(p => p.trim())
    const filteredB = playersB.filter(p => p.trim())

    if (filteredA.length < 2 || filteredB.length < 2) {
      toast.error('Each team needs at least 2 players')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamAName,
          teamBName,
          totalOvers,
          location: location || null,
          passcode,
          playersA: filteredA,
          playersB: filteredB,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Match created successfully!')
      router.push(`/scorer/${data.match.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create match'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const canProceedStep1 = teamAName.trim() && teamBName.trim() && passcode.length >= 4 && passcode.length <= 6
  const canProceedStep2 = playersA.filter(p => p.trim()).length >= 2
  const canSubmit = playersB.filter(p => p.trim()).length >= 2

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <header className="bg-white/80 backdrop-blur-md border-b border-blue-100 sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-1.5 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-lg font-bold text-blue-900">Create Match</h1>
        </div>
      </header>

      {/* Progress */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="flex gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Step {step} of 3: {step === 1 ? 'Match Details' : step === 2 ? `${teamAName || 'Team A'} Players` : `${teamBName || 'Team B'} Players`}
        </p>
      </div>

      <main className="max-w-lg mx-auto px-4 py-6">
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <Trophy className="w-4 h-4" />
                <span className="text-sm font-semibold">Match Info</span>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Team A Name *</label>
                <input
                  type="text"
                  value={teamAName}
                  onChange={e => setTeamAName(e.target.value)}
                  placeholder="e.g. KMR9 Warriors"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Team B Name *</label>
                <input
                  type="text"
                  value={teamBName}
                  onChange={e => setTeamBName(e.target.value)}
                  placeholder="e.g. City Strikers"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Overs</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={totalOvers}
                    onChange={e => setTotalOvers(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    <MapPin className="w-3 h-3 inline mr-1" />Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  <Lock className="w-3 h-3 inline mr-1" />Scorer Passcode (4-6 digits) *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={passcode}
                  onChange={e => setPasscode(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition tracking-widest"
                />
                <p className="text-xs text-gray-400 mt-1">This passcode protects scorer access and match deletion</p>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
            >
              Next: {teamAName || 'Team A'} Players
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <PlayerList
              teamName={teamAName}
              players={playersA}
              onChange={(idx, val) => updatePlayer('a', idx, val)}
              onAdd={() => addPlayer('a')}
              onRemove={(idx) => removePlayer('a', idx)}
            />
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition">
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canProceedStep2}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40 hover:bg-blue-700 transition"
              >
                Next: {teamBName || 'Team B'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <PlayerList
              teamName={teamBName}
              players={playersB}
              onChange={(idx, val) => updatePlayer('b', idx, val)}
              onAdd={() => addPlayer('b')}
              onRemove={(idx) => removePlayer('b', idx)}
            />
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition">
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || loading}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium text-sm disabled:opacity-40 hover:bg-blue-700 transition flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Create Match
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function PlayerList({
  teamName,
  players,
  onChange,
  onAdd,
  onRemove,
}: {
  teamName: string
  players: string[]
  onChange: (idx: number, val: string) => void
  onAdd: () => void
  onRemove: (idx: number) => void
}) {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-blue-600">
          <Users className="w-4 h-4" />
          <span className="text-sm font-semibold">{teamName} - Playing XI</span>
        </div>
        <span className="text-xs text-gray-400">{players.filter(p => p.trim()).length} players</span>
      </div>

      <div className="space-y-2">
        {players.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
            <input
              type="text"
              value={p}
              onChange={e => onChange(i, e.target.value)}
              placeholder={`Player ${i + 1}`}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
            />
            {players.length > 2 && (
              <button onClick={() => onRemove(i)} className="p-1.5 text-gray-400 hover:text-red-500 transition">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={onAdd}
        className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition flex items-center justify-center gap-1"
      >
        <Plus className="w-3 h-3" />
        Add Player
      </button>
    </div>
  )
}
