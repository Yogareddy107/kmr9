import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import bcrypt from 'bcryptjs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: match, error: matchError } = await supabaseAdmin
      .from('matches')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (matchError || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    const { data: players } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('match_id', id)
      .order('batting_order')

    const { data: innings } = await supabaseAdmin
      .from('innings')
      .select('*')
      .eq('match_id', id)
      .order('innings_number')

    const { data: ballEvents } = await supabaseAdmin
      .from('ball_events')
      .select('*')
      .eq('match_id', id)
      .order('created_at')

    return NextResponse.json({
      match,
      players: players || [],
      innings: innings || [],
      ballEvents: ballEvents || [],
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { passcode } = await req.json()

    const { data: match, error } = await supabaseAdmin
      .from('matches')
      .select('passcode_hash')
      .eq('id', id)
      .single()

    if (error || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    const valid = await bcrypt.compare(passcode, match.passcode_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 })
    }

    // Soft delete
    await supabaseAdmin
      .from('matches')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
