import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import bcrypt from 'bcryptjs'

export async function POST(
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
      .eq('is_deleted', false)
      .single()

    if (error || !match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    const valid = await bcrypt.compare(passcode, match.passcode_hash)
    return NextResponse.json({ valid })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
