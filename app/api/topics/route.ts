import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

interface FeedPost {
  text: string
  author: string
  platform: string
  likes: number
  replies: number
  retweets: number
  url: string
}

interface TrendingTopic {
  topic: string
  postCount: number
  totalEngagement: number
  authors: string[]
  userEngaged: boolean
  signalScore: number
  suggestedAngle: string
  samplePosts: Array<{ author: string; text: string; engagement: number; url: string }>
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const user = auth.dbUser
  const trackKeywords: string[] = user.icp_config?.track_keywords ?? []

  // Fetch X posts directly from SocialData (same as watchlist/feed does)
  const feedPosts: FeedPost[] = []

  const { data: watchlist } = await auth.sb
    .from('sb_watchlist')
    .select('username, platform')
    .eq('user_id', user.id)

  const xAccounts = (watchlist ?? []).filter((w: { platform: string }) => w.platform === 'x')
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''

  if (socialDataKey && xAccounts.length > 0) {
    const TWITTER_EPOCH = 1288834974657
    const promises = xAccounts.slice(0, 10).map(async (account: { username: string }) => {
      try {
        const query = `from:${account.username}`
        const resp = await fetch(
          `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(query)}&type=Latest`,
          {
            headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
          }
        )
        if (!resp.ok) return
        const data = await resp.json()
        const tweets = (data.tweets ?? [])
          .filter((tw: Record<string, unknown>) => {
            const text = (tw.full_text as string) ?? (tw.text as string) ?? ''
            return !text.startsWith('RT @') && !text.startsWith('@')
          })
          .slice(0, 15)

        for (const tw of tweets) {
          const text = (tw.full_text as string) ?? (tw.text as string) ?? ''
          const idStr = tw.id_str as string
          let tweetTime = ''
          if (idStr) {
            const tweetMs = (Number(BigInt(idStr) >> BigInt(22))) + TWITTER_EPOCH
            tweetTime = new Date(tweetMs).toISOString()
          }
          feedPosts.push({
            text,
            author: account.username,
            platform: 'x',
            likes: (tw.favorite_count as number) ?? 0,
            replies: (tw.reply_count as number) ?? 0,
            retweets: (tw.retweet_count as number) ?? 0,
            url: `https://x.com/${account.username}/status/${idStr}`,
          })
        }
      } catch { /* skip this account */ }
    })
    await Promise.all(promises)
  }

  if (feedPosts.length === 0 && trackKeywords.length > 0) {
    // Fallback: use tracked keywords as topics without feed data
    const topics: TrendingTopic[] = trackKeywords.slice(0, 5).map((kw: string) => ({
      topic: kw,
      postCount: 0,
      totalEngagement: 0,
      authors: [],
      userEngaged: false,
      signalScore: 10,
      suggestedAngle: 'key_insight',
      samplePosts: [],
    }))
    return NextResponse.json({ success: true, data: { topics, source: 'keywords' } })
  }

  if (feedPosts.length === 0) {
    return NextResponse.json({ success: true, data: { topics: [], source: 'empty' } })
  }

  // Get user's reply history
  const { data: userReplies } = await auth.sb
    .from('action_log')
    .select('post_id')
    .eq('user_id', user.id)
    .eq('action_type', 'reply')
    .order('created_at', { ascending: false })
    .limit(50)
  const repliedUrls = new Set((userReplies ?? []).map((r: { post_id: string }) => r.post_id).filter(Boolean))

  // Group posts by topic using tracked keywords
  const topicMap = new Map<string, {
    posts: FeedPost[]; engagement: number; authors: Set<string>; userEngaged: boolean
  }>()

  for (const post of feedPosts) {
    const textLower = post.text.toLowerCase()
    const eng = post.likes + post.replies + post.retweets
    const userReplied = repliedUrls.has(post.url)

    for (const kw of trackKeywords) {
      if (textLower.includes(kw.toLowerCase())) {
        const existing = topicMap.get(kw) ?? { posts: [], engagement: 0, authors: new Set<string>(), userEngaged: false }
        existing.posts.push(post)
        existing.engagement += eng
        existing.authors.add(post.author)
        if (userReplied) existing.userEngaged = true
        topicMap.set(kw, existing)
      }
    }
  }

  // If fewer than 3 keyword-matched topics, use Claude Haiku for topic extraction
  if (topicMap.size < 3 && feedPosts.length >= 5) {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
    if (apiKey) {
      try {
        const sampleTexts = feedPosts.slice(0, 10).map(p => p.text.substring(0, 200)).join('\n---\n')
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{ role: 'user', content: `Extract 3-5 trending topics from these social media posts. Return ONLY a JSON array of short topic strings (2-4 words each), no explanation.\n\n${sampleTexts}` }],
          }),
        })
        if (resp.ok) {
          const result = await resp.json()
          const raw = result.content?.[0]?.text ?? ''
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
          try {
            const extracted = JSON.parse(cleaned) as string[]
            for (const topic of extracted) {
              const key = topic.toLowerCase()
              if (topicMap.has(key)) continue
              const matching = feedPosts.filter(p => p.text.toLowerCase().includes(key))
              if (matching.length >= 2) {
                topicMap.set(key, {
                  posts: matching,
                  engagement: matching.reduce((s, p) => s + p.likes + p.replies + p.retweets, 0),
                  authors: new Set(matching.map(p => p.author)),
                  userEngaged: matching.some(p => repliedUrls.has(p.url)),
                })
              }
            }
          } catch { /* */ }
        }
      } catch { /* */ }
    }
  }

  // Score and rank
  const topics: TrendingTopic[] = [...topicMap.entries()]
    .map(([topic, data]) => {
      const signal = (data.posts.length * 10) + (data.engagement * 0.1) + (data.userEngaged ? 50 : 0)
      const hasData = data.posts.some(p => /\d+%|\$\d|x\d|\d+x/i.test(p.text))
      const hasFramework = data.posts.some(p => /step|framework|system|playbook|process|how to/i.test(p.text))
      const angle = hasFramework ? 'framework' : hasData ? 'data_point' : data.posts.length >= 4 ? 'trending' : 'key_insight'

      return {
        topic,
        postCount: data.posts.length,
        totalEngagement: data.engagement,
        authors: [...data.authors].slice(0, 5),
        userEngaged: data.userEngaged,
        signalScore: signal,
        suggestedAngle: angle,
        samplePosts: data.posts.slice(0, 3).map(p => ({
          author: p.author,
          text: p.text.substring(0, 200),
          engagement: p.likes + p.replies + p.retweets,
          url: p.url,
        })),
      }
    })
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, 5)

  return NextResponse.json({ success: true, data: { topics, source: 'feed' } })
}
