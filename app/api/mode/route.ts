import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createDefaultGoals } from '@/lib/goals'
import type { UserMode } from '@/lib/types'

// POST: Set user mode and create default goals
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { mode } = body as { mode: UserMode }

  const validModes: UserMode[] = ['personal_brand', 'b2b_outbound', 'both']
  if (!mode || !validModes.includes(mode)) {
    return NextResponse.json({ success: false, error: `Invalid mode. Must be one of: ${validModes.join(', ')}` }, { status: 400 })
  }

  // Update user mode
  const { error } = await auth.sb
    .from('sb_users')
    .update({ mode, mode_set: true })
    .eq('id', auth.dbUser.id)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Create default goals for the selected mode
  await createDefaultGoals(auth.sb, auth.dbUser.id, mode)

  return NextResponse.json({ success: true, data: { mode } })
}
