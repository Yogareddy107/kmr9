import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action, data } = body

    switch (action) {
      case 'start_innings': {
        const { inningsNumber, battingTeam, bowlingTeam } = data
        const { data: innings, error } = await supabaseAdmin
          .from('innings')
          .insert({
            match_id: id,
            innings_number: inningsNumber,
            batting_team: battingTeam,
            bowling_team: bowlingTeam,
          })
          .select()
          .single()

        if (error) throw error

        await supabaseAdmin
          .from('matches')
          .update({ status: 'live', updated_at: new Date().toISOString() })
          .eq('id', id)

        return NextResponse.json({ innings })
      }

      case 'update_innings': {
        const { inningsId, updates } = data
        const { error } = await supabaseAdmin
          .from('innings')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', inningsId)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'record_ball': {
        const { ballEvent, inningsUpdates, inningsId } = data

        const { data: event, error: ballError } = await supabaseAdmin
          .from('ball_events')
          .insert({ ...ballEvent, match_id: id })
          .select()
          .single()

        if (ballError) throw ballError

        if (inningsUpdates) {
          await supabaseAdmin
            .from('innings')
            .update({ ...inningsUpdates, updated_at: new Date().toISOString() })
            .eq('id', inningsId)
        }

        return NextResponse.json({ event })
      }

      case 'undo_ball': {
        const { ballId, inningsId: undoInningsId, inningsUpdates: undoInningsUpdates } = data

        const { error: undoError } = await supabaseAdmin
          .from('ball_events')
          .update({ is_undone: true })
          .eq('id', ballId)

        if (undoError) throw undoError

        if (undoInningsUpdates) {
          await supabaseAdmin
            .from('innings')
            .update({ ...undoInningsUpdates, updated_at: new Date().toISOString() })
            .eq('id', undoInningsId)
        }

        return NextResponse.json({ success: true })
      }

      case 'end_innings': {
        const { inningsId: endInningsId } = data
        await supabaseAdmin
          .from('innings')
          .update({ is_completed: true, updated_at: new Date().toISOString() })
          .eq('id', endInningsId)

        await supabaseAdmin
          .from('matches')
          .update({ status: 'innings_break', updated_at: new Date().toISOString() })
          .eq('id', id)

        return NextResponse.json({ success: true })
      }

      case 'complete_match': {
        const { winner, resultSummary } = data
        await supabaseAdmin
          .from('matches')
          .update({
            status: 'completed',
            winner,
            result_summary: resultSummary,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        return NextResponse.json({ success: true })
      }

      case 'update_match_status': {
        const { status } = data
        await supabaseAdmin
          .from('matches')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', id)

        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
