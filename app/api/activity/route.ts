import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

interface ActionLogRow {
  id: string
  action_type: string
  post_id: string | null
  platform: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const ACTION_LABELS: Record<string, string> = {
  reply: 'Replied to a post',
  reply_copy: 'Copied a reply',
  dm_draft: 'Drafted a DM',
  dm_send: 'Sent a DM',
  scrape: 'Scraped a post',
  x_thread: 'Created an X thread',
  x_quote: 'Quoted a post on X',
  x_post: 'Posted on X',
  li_comment: 'Commented on LinkedIn',
  li_post: 'Posted on LinkedIn',
  li_carousel: 'Created LinkedIn carousel',
  li_connection: 'Sent LinkedIn connection',
  notification_skip: 'Skipped a notification',
}

function groupByDate(items: ActionLogRow[]): Record<string, ActionLogRow[]> {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const groups: Record<string, ActionLogRow[]> = {}

  for (const item of items) {
    const dateStr = item.created_at.slice(0, 10)
    const itemDate = new Date(item.created_at)

    let label: string
    if (dateStr === todayStr) {
      label = 'Today'
    } else if (dateStr === yesterdayStr) {
      label = 'Yesterday'
    } else if (itemDate >= weekAgo) {
      label = 'This week'
    } else {
      label = 'Older'
    }

    const existing = groups[label]
    if (existing) {
      existing.push(item)
    } else {
      groups[label] = [item]
    }
  }

  return groups
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await auth.sb
    .from('action_log')
    .select('id, action_type, post_id, platform, metadata, created_at')
    .eq('user_id', auth.dbUser.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as ActionLogRow[]
  const grouped = groupByDate(rows)

  const enriched = Object.fromEntries(
    Object.entries(grouped).map(([label, items]) => [
      label,
      items.map((item) => ({
        ...item,
        label: ACTION_LABELS[item.action_type] ?? item.action_type,
        content_preview:
          typeof item.metadata?.content === 'string'
            ? (item.metadata.content as string).slice(0, 60)
            : null,
      })),
    ])
  )

  return NextResponse.json({ success: true, data: enriched })
}
