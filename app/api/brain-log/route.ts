import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Log a brain recommendation + user action
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { source_url, platform, author_handle, recommended_action, priority, reason, engagement_at_time, user_action } = body

  const { data, error } = await auth.sb
    .from('sb_brain_log')
    .insert({
      user_id: auth.dbUser.id,
      platform,
      source_url,
      author_handle,
      recommended_action,
      priority,
      reason,
      engagement_at_time,
      user_action,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id })
}

// Update outcome for a logged recommendation
export async function PATCH(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, outcome, user_action } = body

  const updates: Record<string, unknown> = {}
  if (outcome) updates.outcome = outcome
  if (user_action) updates.user_action = user_action

  const { error } = await auth.sb
    .from('sb_brain_log')
    .update(updates)
    .eq('id', id)
    .eq('user_id', auth.dbUser.id)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
