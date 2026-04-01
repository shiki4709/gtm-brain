import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { logAction } from '@/lib/goals'

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action_type, post_id, platform, metadata } = body as {
    action_type: string
    post_id?: string
    platform?: string
    metadata?: Record<string, unknown>
  }

  const validTypes = ['reply', 'reply_copy', 'dm_draft', 'dm_send', 'scrape', 'dm_reply_received', 'x_thread', 'x_quote', 'x_post', 'li_comment', 'li_post', 'li_carousel', 'li_connection']
  if (!action_type || !validTypes.includes(action_type)) {
    return NextResponse.json({ success: false, error: `Invalid action_type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }

  await logAction(auth.sb, auth.dbUser.id, action_type, post_id, platform, metadata)
  return NextResponse.json({ success: true })
}
