import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

interface WhoReplies {
  readonly handle: string
  readonly name: string
  readonly followers: number
  readonly replyCount: number
  readonly lastReply: string
  readonly isIcp: boolean
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { dbUser, sb } = auth
  const xHandle = dbUser.x_handle as string | null
  if (!xHandle) {
    return NextResponse.json({ success: false, error: 'No X handle configured' }, { status: 400 })
  }

  const apiKey = process.env.SOCIALDATA_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'SocialData API key not configured' }, { status: 500 })
  }

  // Fetch ICP titles for cross-referencing
  const icpConfig = (dbUser.icp_config as { titles?: string[] } | null) ?? {}
  const icpKeywords = (icpConfig.titles ?? []).map((t: string) => t.toLowerCase())

  try {
    const query = `to:${xHandle}`
    const res = await fetch(
      `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(query)}&type=Latest`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      },
    )

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `SocialData error: ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    const tweets = (data.tweets ?? []) as Array<{
      user: { screen_name: string; name: string; followers_count: number; description?: string }
      full_text: string
      tweet_created_at: string
    }>

    // Aggregate by author
    const authorMap = new Map<string, {
      name: string
      followers: number
      replyCount: number
      lastReply: string
      bio: string
    }>()

    for (const tweet of tweets) {
      const handle = tweet.user.screen_name
      // Skip self-replies
      if (handle.toLowerCase() === xHandle.toLowerCase()) continue

      const existing = authorMap.get(handle)
      if (existing) {
        authorMap.set(handle, {
          ...existing,
          replyCount: existing.replyCount + 1,
          lastReply: tweet.full_text.length > existing.lastReply.length ? tweet.full_text : existing.lastReply,
        })
      } else {
        authorMap.set(handle, {
          name: tweet.user.name,
          followers: tweet.user.followers_count,
          replyCount: 1,
          lastReply: tweet.full_text,
          bio: tweet.user.description ?? '',
        })
      }
    }

    // Check ICP match and sort by frequency
    const results: WhoReplies[] = [...authorMap.entries()]
      .map(([handle, info]) => {
        const bioLower = info.bio.toLowerCase()
        const isIcp = icpKeywords.length > 0
          ? icpKeywords.some((kw: string) => bioLower.includes(kw))
          : false
        return {
          handle,
          name: info.name,
          followers: info.followers,
          replyCount: info.replyCount,
          lastReply: info.lastReply.slice(0, 200),
          isIcp,
        }
      })
      .sort((a, b) => b.replyCount - a.replyCount)
      .slice(0, 20)

    // Save to sb_insights for caching
    await sb.from('sb_insights').insert({
      user_id: dbUser.id,
      insight_type: 'who_replies',
      insight_data: { repliers: results, generatedAt: new Date().toISOString() } as unknown as Record<string, unknown>,
      confidence: Math.min(1, results.length / 10),
    })

    return NextResponse.json({ success: true, data: results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
