import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { logAction } from '@/lib/goals'

// GET — retrieve published content for the "Published" tab
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const contentTypes = ['x_thread', 'x_quote', 'x_post', 'li_post', 'li_carousel', 'li_comment', 'reply']
  const { data } = await auth.sb
    .from('action_log')
    .select('id, action_type, platform, metadata, created_at')
    .eq('user_id', auth.dbUser.id)
    .in('action_type', contentTypes)
    .not('metadata->content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ success: true, items: data ?? [] })
}

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
