import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { dbUser: user, sb } = auth

  const insights: Record<string, unknown> = {}

  // 1. Reply style effectiveness (from content_tags + x_engage engagement data)
  const { data: replyTags } = await sb
    .from('sb_content_tags')
    .select('reference_id, tags, engagement')
    .eq('user_id', user.id)
    .eq('platform', 'x')
    .eq('content_type', 'reply')

  if (replyTags && replyTags.length > 0) {
    // Group by reply_style
    const styleMap = new Map<string, { count: number; totalLikes: number; totalReplies: number }>()

    for (const tag of replyTags) {
      const tags = tag.tags as Record<string, string>
      const engagement = tag.engagement as Record<string, number> | null
      const style = tags.reply_style
      if (!style) continue

      const entry = styleMap.get(style) ?? { count: 0, totalLikes: 0, totalReplies: 0 }
      entry.count++
      entry.totalLikes += engagement?.likes ?? 0
      entry.totalReplies += engagement?.replies ?? 0
      styleMap.set(style, entry)
    }

    insights.reply_by_style = Array.from(styleMap.entries())
      .map(([style, data]) => ({
        style,
        count: data.count,
        avg_likes: data.count > 0 ? Math.round((data.totalLikes / data.count) * 10) / 10 : 0,
        avg_replies: data.count > 0 ? Math.round((data.totalReplies / data.count) * 10) / 10 : 0,
        total_engagement: data.totalLikes + data.totalReplies,
      }))
      .sort((a, b) => b.total_engagement - a.total_engagement)

    insights.total_replies_classified = replyTags.length
    insights.total_with_engagement = replyTags.filter(t => {
      const e = t.engagement as Record<string, number> | null
      return e && (e.likes > 0 || e.replies > 0)
    }).length
  }

  // 2. Best accounts to engage with (from x_engage + content_tags)
  const { data: engages } = await sb
    .from('sb_x_engage')
    .select('id, author_handle, author_name, status')
    .eq('user_id', user.id)
    .in('status', ['posted', 'drafted'])

  if (engages && engages.length > 0) {
    // Get engagement data for posted replies
    const engageIds = engages.map(e => e.id)
    const { data: engageTags } = await sb
      .from('sb_content_tags')
      .select('reference_id, engagement')
      .eq('user_id', user.id)
      .eq('platform', 'x')
      .in('reference_id', engageIds)

    const engageMap = new Map((engageTags ?? []).map(t => [t.reference_id, t.engagement as Record<string, number> | null]))

    // Group by author
    const authorMap = new Map<string, { handle: string; name: string; replies: number; totalLikes: number }>()
    for (const e of engages) {
      const handle = e.author_handle as string
      const entry = authorMap.get(handle) ?? { handle, name: e.author_name as string, replies: 0, totalLikes: 0 }
      entry.replies++
      const engagement = engageMap.get(e.id)
      entry.totalLikes += engagement?.likes ?? 0
      authorMap.set(handle, entry)
    }

    insights.best_accounts = Array.from(authorMap.values())
      .sort((a, b) => b.totalLikes - a.totalLikes)
      .slice(0, 10)
  }

  return NextResponse.json({ success: true, data: insights })
}
