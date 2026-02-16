'use client'

import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { MatchData, Player, Innings, BallEvent } from '@/lib/types'
import { formatBallDisplay, formatOvers, generateCommentary } from '@/lib/cricket-utils'
import { ArrowLeft, Lock, Loader2, Undo2, Trash2, Share2, AlertTriangle, Radio } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

export default function ScorerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [verified, setVerified] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [matchData, setMatchData] = useState<MatchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletePasscode, setDeletePasscode] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showWicketDialog, setShowWicketDialog] = useState(false)
  const [pendingWicketRuns, setPendingWicketRuns] = useState(0)
  const [showBowlerSelect, setShowBowlerSelect] = useState(false)
  const [showBatsmanSelect, setShowBatsmanSelect] = useState(false)
  const [showInningsSetup, setShowInningsSetup] = useState(false)
  const [selectedBattingTeam, setSelectedBattingTeam] = useState<'a' | 'b'>('a')

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

  const searchParams = useSearchParams()

  const verifyPasscode = async (pass?: string) => {
    const code = typeof pass === 'string' ? pass : passcode
    if (!code) return
    setVerifying(true)
    try {
      const res = await fetch(`/api/matches/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: code }),
      })
      const data = await res.json()
      if (data.valid) {
        setVerified(true)
        setPasscode(code)
        toast.success('Access granted')
        // remove passcode from URL for security
        try { router.replace(`/scorer/${id}`) } catch {}
      } else toast.error('Invalid passcode')
    } catch { toast.error('Verification failed') }
    finally { setVerifying(false) }
  }

  useEffect(() => {
    const p = searchParams?.get('passcode')
    if (p) verifyPasscode(p)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apiScore = async (action: string, data: Record<string, unknown>) => {
    setSyncing(true)
    try {
      const res = await fetch(`/api/matches/${id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      const result = await res.json()
      await fetchMatch()
      return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed'
      toast.error(msg)
      throw err
    } finally { setSyncing(false) }
  }

  const handleStartInnings = async () => {
    if (!matchData) return
    const inningsNumber = matchData.innings.length + 1
    if (inningsNumber > 2) return

    const battingTeam = selectedBattingTeam
    const bowlingTeam = battingTeam === 'a' ? 'b' : 'a'

    await apiScore('start_innings', { inningsNumber, battingTeam, bowlingTeam })
    setShowInningsSetup(false)
    toast.success(`Innings ${inningsNumber} started!`)
  }

  const currentInnings = matchData?.innings.find(i => !i.is_completed)
  const currentBalls = matchData?.ballEvents.filter(
    e => e.innings_id === currentInnings?.id && !e.is_undone
  ) || []

  const handleRecordBall = async (
    runs: number,
    extraType: string | null = null,
    extraRuns: number = 0,
    isWicket: boolean = false,
    wicketType: string | null = null,
    dismissedId: string | null = null
  ) => {
    if (!currentInnings || !matchData) return

    const isLegalBall = extraType !== 'wide' && extraType !== 'no_ball'
    const currentBallCount = currentBalls.filter(
      e => e.extra_type !== 'wide' && e.extra_type !== 'no_ball'
    ).length
    const currentOver = Math.floor(currentBallCount / 6)
    const ballInOver = (currentBallCount % 6) + 1
    const overNum = isLegalBall ? currentOver : Math.floor(currentBallCount / 6)
    const ballNum = isLegalBall ? ballInOver : currentBalls.filter(
      e => e.over_number === currentOver
    ).length + 1

    const totalRunsForBall = runs + extraRuns
    const isBoundary = (runs === 4 || runs === 6) && !extraType
    const batsman = matchData.players.find(p => p.id === currentInnings.striker_id)
    const bowler = matchData.players.find(p => p.id === currentInnings.current_bowler_id)

    if (!batsman || !bowler) {
      toast.error('Please select striker and bowler first')
      return
    }

    const commentary = generateCommentary(
      { over_number: overNum, ball_number: ballNum, is_wicket: isWicket, wicket_type: wicketType, extra_type: extraType, runs_scored: runs, extra_runs: extraRuns } as BallEvent,
      batsman, bowler
    )

    const newTotalBalls = currentInnings.total_balls + (isLegalBall ? 1 : 0)
    const newTotalRuns = currentInnings.total_runs + totalRunsForBall
    const newTotalWickets = currentInnings.total_wickets + (isWicket ? 1 : 0)
    const newTotalExtras = currentInnings.total_extras + extraRuns + (extraType === 'wide' || extraType === 'no_ball' ? 1 : 0)

    // Strike rotation
    let newStriker = currentInnings.striker_id
    let newNonStriker = currentInnings.non_striker_id
    if (isLegalBall && !isWicket) {
      if (runs % 2 !== 0) {
        newStriker = currentInnings.non_striker_id
        newNonStriker = currentInnings.striker_id
      }
      // End of over rotation
      if (newTotalBalls % 6 === 0 && newTotalBalls > 0) {
        const temp = newStriker
        newStriker = newNonStriker
        newNonStriker = temp
      }
    }

    if (isWicket) {
      newStriker = null // Will need to select new batsman
    }

    const ballEvent = {
      innings_id: currentInnings.id,
      over_number: overNum,
      ball_number: ballNum,
      batsman_id: batsman.id,
      bowler_id: bowler.id,
      runs_scored: runs,
      is_extra: !!extraType,
      extra_type: extraType,
      extra_runs: extraType === 'wide' || extraType === 'no_ball' ? extraRuns + 1 : extraRuns,
      is_wicket: isWicket,
      wicket_type: wicketType,
      dismissed_player_id: dismissedId || (isWicket ? batsman.id : null),
      is_boundary: isBoundary,
      total_runs: totalRunsForBall + (extraType === 'wide' || extraType === 'no_ball' ? 1 : 0),
      commentary,
    }

    const inningsUpdates = {
      total_runs: newTotalRuns + (extraType === 'wide' || extraType === 'no_ball' ? 1 : 0),
      total_wickets: newTotalWickets,
      total_balls: newTotalBalls,
      total_overs_bowled: parseFloat(formatOvers(newTotalBalls)),
      total_extras: newTotalExtras,
      striker_id: newStriker,
      non_striker_id: newNonStriker,
    }

    await apiScore('record_ball', {
      ballEvent,
      inningsUpdates,
      inningsId: currentInnings.id,
    })

    // Check if innings over (all out or overs done)
    const maxBalls = matchData.match.total_overs * 6
    if (newTotalBalls >= maxBalls || newTotalWickets >= 10) {
      await handleEndInnings()
    }

    // Check 2nd innings - target chased
    if (currentInnings.innings_number === 2) {
      const firstInnings = matchData.innings.find(i => i.innings_number === 1)
      if (firstInnings && inningsUpdates.total_runs > firstInnings.total_runs) {
        const winner = currentInnings.batting_team === 'a' ? matchData.match.team_a_name : matchData.match.team_b_name
        const wicketsLeft = 10 - newTotalWickets
        await apiScore('complete_match', {
          winner: currentInnings.batting_team,
          resultSummary: `${winner} won by ${wicketsLeft} wicket(s)`,
        })
        toast.success(`${winner} wins!`)
      }
    }
  }

  const handleEndInnings = async () => {
    if (!currentInnings || !matchData) return

    if (currentInnings.innings_number === 2) {
      // Match complete
      const inn1 = matchData.innings.find(i => i.innings_number === 1)
      const inn2Runs = currentInnings.total_runs
      const inn1Runs = inn1?.total_runs || 0

      let winner = ''
      let summary = ''
      if (inn2Runs > inn1Runs) {
        const winTeam = currentInnings.batting_team === 'a' ? matchData.match.team_a_name : matchData.match.team_b_name
        winner = currentInnings.batting_team
        summary = `${winTeam} won by ${10 - currentInnings.total_wickets} wicket(s)`
      } else if (inn1Runs > inn2Runs) {
        const winTeam = currentInnings.bowling_team === 'a' ? matchData.match.team_a_name : matchData.match.team_b_name
        winner = currentInnings.bowling_team
        summary = `${winTeam} won by ${inn1Runs - inn2Runs} run(s)`
      } else {
        summary = 'Match Tied!'
      }

      await apiScore('end_innings', { inningsId: currentInnings.id })
      await apiScore('complete_match', { winner, resultSummary: summary })
      toast.success(summary)
    } else {
      await apiScore('end_innings', { inningsId: currentInnings.id })
      toast.success('Innings ended. Ready for 2nd innings.')
    }
  }

  const handleUndo = async () => {
    if (!currentInnings || currentBalls.length === 0) return
    const lastBall = currentBalls[currentBalls.length - 1]
    const isLegal = lastBall.extra_type !== 'wide' && lastBall.extra_type !== 'no_ball'

    const inningsUpdates = {
      total_runs: currentInnings.total_runs - lastBall.total_runs,
      total_wickets: currentInnings.total_wickets - (lastBall.is_wicket ? 1 : 0),
      total_balls: currentInnings.total_balls - (isLegal ? 1 : 0),
      total_overs_bowled: parseFloat(formatOvers(currentInnings.total_balls - (isLegal ? 1 : 0))),
      total_extras: currentInnings.total_extras - lastBall.extra_runs,
      striker_id: lastBall.batsman_id,
      non_striker_id: currentInnings.non_striker_id,
    }

    await apiScore('undo_ball', { ballId: lastBall.id, inningsId: currentInnings.id, inningsUpdates })
    toast.success('Last ball undone')
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/matches/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: deletePasscode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Match deleted')
      router.push('/')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      toast.error(msg)
    } finally { setDeleting(false) }
  }

  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/match/${id}` : ''

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink)
    toast.success('Match link copied!')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!matchData) return null

  // Passcode gate
  if (!verified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg max-w-sm w-full space-y-4">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Scorer Access</h2>
            <p className="text-sm text-gray-500 mt-1">{matchData.match.team_a_name} vs {matchData.match.team_b_name}</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={passcode}
            onChange={e => setPasscode(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter passcode"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-center text-lg tracking-[0.5em] focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            onKeyDown={e => e.key === 'Enter' && verifyPasscode()}
          />
          <button
            onClick={verifyPasscode}
            disabled={passcode.length < 4 || verifying}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-40 hover:bg-blue-700 transition flex items-center justify-center gap-2"
          >
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Unlock Scorer Panel
          </button>
          <Link href={`/match/${id}`} className="block text-center text-sm text-blue-600 hover:underline">
            View as spectator instead
          </Link>
        </div>
      </div>
    )
  }

  const { match, players } = matchData
  const teamAPlayers = players.filter(p => p.team === 'a')
  const teamBPlayers = players.filter(p => p.team === 'b')

  const battingPlayers = currentInnings
    ? players.filter(p => p.team === currentInnings.batting_team)
    : []
  const bowlingPlayers = currentInnings
    ? players.filter(p => p.team === currentInnings.bowling_team)
    : []

  const dismissedIds = currentBalls
    .filter(e => e.is_wicket && e.dismissed_player_id)
    .map(e => e.dismissed_player_id)

  const availableBatsmen = battingPlayers.filter(
    p => p.id !== currentInnings?.striker_id && p.id !== currentInnings?.non_striker_id && !dismissedIds.includes(p.id)
  )

  const striker = players.find(p => p.id === currentInnings?.striker_id)
  const nonStriker = players.find(p => p.id === currentInnings?.non_striker_id)
  const bowler = players.find(p => p.id === currentInnings?.current_bowler_id)

  const currentOverNum = currentInnings ? Math.floor(
    currentBalls.filter(e => e.extra_type !== 'wide' && e.extra_type !== 'no_ball').length / 6
  ) : 0
  const thisOverBalls = currentBalls.filter(e => {
    const legalBefore = currentBalls
      .filter(b => new Date(b.created_at) <= new Date(e.created_at) && b.extra_type !== 'wide' && b.extra_type !== 'no_ball')
      .length
    const over = legalBefore > 0 ? Math.floor((legalBefore - 1) / 6) : 0
    return e.over_number === currentOverNum || over === currentOverNum
  })

  const firstInnings = matchData.innings.find(i => i.innings_number === 1)
  const target = currentInnings?.innings_number === 2 && firstInnings ? firstInnings.total_runs + 1 : null

  const needsSetup = !currentInnings && (match.status === 'upcoming' || match.status === 'innings_break')
  const needsBatsmen = currentInnings && (!currentInnings.striker_id || !currentInnings.non_striker_id)
  const needsBowler = currentInnings && !currentInnings.current_bowler_id

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-blue-100 sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-sm font-bold text-blue-900">Scorer Panel</h1>
              <p className="text-xs text-gray-500">{match.team_a_name} vs {match.team_b_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {syncing && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              syncing ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'
            }`}>
              {syncing ? 'Syncing...' : 'Synced'}
            </span>
            <button onClick={copyShareLink} className="p-1.5 hover:bg-gray-100 rounded-lg transition" title="Share match link">
              <Share2 className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-24">
        {/* Score Summary */}
        {currentInnings && (
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Radio className="w-3 h-3 text-red-500 animate-pulse" />
                <span className="text-xs font-medium text-red-600">LIVE</span>
                <span className="text-xs text-gray-400">Innings {currentInnings.innings_number}</span>
              </div>
              {target && <span className="text-xs font-medium text-blue-600">Target: {target}</span>}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">
                {currentInnings.total_runs}/{currentInnings.total_wickets}
              </span>
              <span className="text-lg text-gray-500">
                ({formatOvers(currentInnings.total_balls)} ov)
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {currentInnings.batting_team === 'a' ? match.team_a_name : match.team_b_name} batting
            </p>
          </div>
        )}

        {/* Innings Setup */}
        {needsSetup && (
          <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">
              {match.status === 'innings_break' ? 'Start 2nd Innings' : 'Start Match'}
            </h3>
            {!showInningsSetup ? (
              <button
                onClick={() => {
                  if (match.status === 'innings_break' && firstInnings) {
                    setSelectedBattingTeam(firstInnings.bowling_team as 'a' | 'b')
                  }
                  setShowInningsSetup(true)
                }}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition"
              >
                {match.status === 'innings_break' ? 'Start 2nd Innings' : 'Start Innings'}
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Who bats first?</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedBattingTeam('a')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                        selectedBattingTeam === 'a' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {match.team_a_name}
                    </button>
                    <button
                      onClick={() => setSelectedBattingTeam('b')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                        selectedBattingTeam === 'b' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {match.team_b_name}
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleStartInnings}
                  className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition"
                >
                  Confirm & Start
                </button>
              </div>
            )}
          </div>
        )}

        {/* Select Batsmen */}
        {currentInnings && (needsBatsmen || showBatsmanSelect) && (
          <div className="bg-white rounded-xl p-4 border border-blue-200 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Select Batsmen</h3>
            {!currentInnings.striker_id && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Striker</label>
                <div className="grid grid-cols-2 gap-2">
                  {(showBatsmanSelect ? availableBatsmen : battingPlayers.filter(p => !dismissedIds.includes(p.id))).map(p => (
                    <button
                      key={p.id}
                      onClick={async () => {
                        await apiScore('update_innings', {
                          inningsId: currentInnings.id,
                          updates: { striker_id: p.id },
                        })
                        setShowBatsmanSelect(false)
                      }}
                      className="py-2 px-3 bg-gray-50 rounded-lg text-sm hover:bg-blue-50 hover:text-blue-700 transition border border-gray-100"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {currentInnings.striker_id && !currentInnings.non_striker_id && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Non-Striker</label>
                <div className="grid grid-cols-2 gap-2">
                  {battingPlayers.filter(p => p.id !== currentInnings.striker_id && !dismissedIds.includes(p.id)).map(p => (
                    <button
                      key={p.id}
                      onClick={async () => {
                        await apiScore('update_innings', {
                          inningsId: currentInnings.id,
                          updates: { non_striker_id: p.id },
                        })
                        setShowBatsmanSelect(false)
                      }}
                      className="py-2 px-3 bg-gray-50 rounded-lg text-sm hover:bg-blue-50 hover:text-blue-700 transition border border-gray-100"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Select Bowler */}
        {currentInnings && (needsBowler || showBowlerSelect) && (
          <div className="bg-white rounded-xl p-4 border border-blue-200 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Select Bowler</h3>
            <div className="grid grid-cols-2 gap-2">
              {bowlingPlayers.map(p => (
                <button
                  key={p.id}
                  onClick={async () => {
                    await apiScore('update_innings', {
                      inningsId: currentInnings.id,
                      updates: { current_bowler_id: p.id },
                    })
                    setShowBowlerSelect(false)
                  }}
                  className={`py-2 px-3 rounded-lg text-sm transition border ${
                    p.id === currentInnings.current_bowler_id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border-gray-100'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Current Batsmen & Bowler display */}
        {currentInnings && !needsBatsmen && !needsBowler && !showBatsmanSelect && !showBowlerSelect && (
          <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs text-gray-400">Striker</p>
                <p className="text-sm font-semibold text-gray-800">{striker?.name || '-'} *</p>
              </div>
              <div className="flex-1 text-right">
                <p className="text-xs text-gray-400">Non-Striker</p>
                <p className="text-sm font-semibold text-gray-800">{nonStriker?.name || '-'}</p>
              </div>
            </div>
            <div className="border-t border-gray-50 pt-2 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Bowler</p>
                <p className="text-sm font-semibold text-gray-800">{bowler?.name || '-'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowBatsmanSelect(true)} className="text-xs text-blue-600 hover:underline">
                  Change Batsmen
                </button>
                <button onClick={() => setShowBowlerSelect(true)} className="text-xs text-blue-600 hover:underline">
                  Change Bowler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* This Over */}
        {currentInnings && currentBalls.length > 0 && (
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500 mb-2">This Over</p>
            <div className="flex gap-2 flex-wrap">
              {thisOverBalls.map(b => (
                <span
                  key={b.id}
                  className={`w-9 h-9 flex items-center justify-center rounded-full text-xs font-bold ${
                    b.is_wicket ? 'bg-red-100 text-red-700' :
                    b.runs_scored === 6 ? 'bg-green-100 text-green-700' :
                    b.runs_scored === 4 ? 'bg-blue-100 text-blue-700' :
                    b.runs_scored === 0 ? 'bg-gray-100 text-gray-500' :
                    'bg-gray-50 text-gray-700'
                  }`}
                >
                  {formatBallDisplay(b)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Scoring Controls */}
        {currentInnings && !needsBatsmen && !needsBowler && (
          <div className="space-y-3">
            {/* Runs */}
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-3">RUNS</p>
              <div className="grid grid-cols-6 gap-2">
                {[0, 1, 2, 3, 4, 6].map(r => (
                  <button
                    key={r}
                    onClick={() => handleRecordBall(r)}
                    disabled={syncing}
                    className={`py-3 rounded-xl text-lg font-bold transition-all active:scale-95 disabled:opacity-50 ${
                      r === 4 ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-2 border-blue-200' :
                      r === 6 ? 'bg-green-50 text-green-700 hover:bg-green-100 border-2 border-green-200' :
                      r === 0 ? 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200' :
                      'bg-gray-50 text-gray-800 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Extras */}
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-3">EXTRAS</p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => handleRecordBall(0, 'wide', 0)}
                  disabled={syncing}
                  className="py-2.5 bg-orange-50 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-100 transition active:scale-95 border border-orange-200"
                >
                  Wide
                </button>
                <button
                  onClick={() => handleRecordBall(0, 'no_ball', 0)}
                  disabled={syncing}
                  className="py-2.5 bg-orange-50 text-orange-700 rounded-xl text-sm font-semibold hover:bg-orange-100 transition active:scale-95 border border-orange-200"
                >
                  No Ball
                </button>
                <button
                  onClick={() => handleRecordBall(1, 'bye', 0)}
                  disabled={syncing}
                  className="py-2.5 bg-yellow-50 text-yellow-700 rounded-xl text-sm font-semibold hover:bg-yellow-100 transition active:scale-95 border border-yellow-200"
                >
                  Bye
                </button>
                <button
                  onClick={() => handleRecordBall(1, 'leg_bye', 0)}
                  disabled={syncing}
                  className="py-2.5 bg-yellow-50 text-yellow-700 rounded-xl text-sm font-semibold hover:bg-yellow-100 transition active:scale-95 border border-yellow-200"
                >
                  Leg Bye
                </button>
              </div>
            </div>

            {/* Wicket */}
            <div className="bg-white rounded-xl p-4 border border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-3">WICKET</p>
              {!showWicketDialog ? (
                <button
                  onClick={() => { setPendingWicketRuns(0); setShowWicketDialog(true) }}
                  disabled={syncing}
                  className="w-full py-3 bg-red-50 text-red-700 rounded-xl font-bold text-base hover:bg-red-100 transition active:scale-95 border-2 border-red-200"
                >
                  WICKET
                </button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Runs scored on this ball</label>
                    <div className="flex gap-2">
                      {[0, 1, 2, 3].map(r => (
                        <button
                          key={r}
                          onClick={() => setPendingWicketRuns(r)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                            pendingWicketRuns === r ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket'].map(wt => (
                      <button
                        key={wt}
                        onClick={() => {
                          handleRecordBall(pendingWicketRuns, null, 0, true, wt)
                          setShowWicketDialog(false)
                        }}
                        className="py-2 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 transition capitalize border border-red-200"
                      >
                        {wt.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowWicketDialog(false)} className="w-full text-sm text-gray-500 hover:underline">
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleUndo}
                disabled={syncing || currentBalls.length === 0}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-200 transition flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Undo2 className="w-4 h-4" />
                Undo
              </button>
              <button
                onClick={handleEndInnings}
                disabled={syncing}
                className="flex-1 py-3 bg-amber-100 text-amber-800 rounded-xl font-medium text-sm hover:bg-amber-200 transition"
              >
                End Innings
              </button>
            </div>
          </div>
        )}

        {/* Match Completed */}
        {match.status === 'completed' && (
          <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-center space-y-2">
            <p className="text-lg font-bold text-green-800">Match Completed</p>
            {match.result_summary && <p className="text-sm text-green-700">{match.result_summary}</p>}
          </div>
        )}

        {/* Delete Section */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="w-full py-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Match
          </button>
        </div>

        {/* Delete Dialog */}
        {showDeleteDialog && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Delete Match</h3>
                  <p className="text-xs text-gray-500">This action cannot be easily undone</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 bg-red-50 p-3 rounded-lg">
                This will permanently delete this match and all data.
              </p>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={deletePasscode}
                onChange={e => setDeletePasscode(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter passcode to confirm"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-center text-lg tracking-[0.5em] focus:ring-2 focus:ring-red-500 outline-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteDialog(false); setDeletePasscode('') }}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deletePasscode.length < 4 || deleting}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
