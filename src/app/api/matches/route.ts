import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { teamAName, teamBName, totalOvers, location, passcode, tossWinner, tossDecision, playersA, playersB } = body

    if (!teamAName || !teamBName || !passcode || !playersA?.length || !playersB?.length || !tossWinner || !tossDecision) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (passcode.length < 4 || passcode.length > 6) {
      return NextResponse.json({ error: 'Passcode must be 4-6 digits' }, { status: 400 })
    }

    const passcodeHash = await bcrypt.hash(passcode, 10)

    // Normalize casing
    const nameA = teamAName.toUpperCase()
    const nameB = teamBName.toUpperCase()
    const tossW = tossWinner === 'a' ? 'a' : 'b' // store as a/b
    const tossD = tossDecision === 'BAT' ? 'BAT' : 'BOWL'

    const { data: match, error: matchError } = await supabaseAdmin
      .from('matches')
      .insert({
        team_a_name: nameA,
        team_b_name: nameB,
        total_overs: totalOvers || 20,
        location: location || null,
        passcode_hash: passcodeHash,
        status: 'upcoming',
        toss_winner: tossW,
        toss_decision: tossD,
      })
      .select()
      .single()

    if (matchError) throw matchError

    const playerRecords = [
      ...playersA.map((name: string, i: number) => ({
        match_id: match.id,
        name: name.toUpperCase(),
        team: 'a',
        batting_order: i + 1,
      })),
      ...playersB.map((name: string, i: number) => ({
        match_id: match.id,
        name: name.toUpperCase(),
        team: 'b',
        batting_order: i + 1,
      })),
    ]

    const { error: playersError } = await supabaseAdmin
      .from('players')
      .insert(playerRecords)

    if (playersError) throw playersError

    return NextResponse.json({ match })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ matches: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
