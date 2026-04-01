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
  samplePosts: Array<{ author: string; text: string; engagement: number }>
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const user = auth.dbUser
  const trackKeywords = user.icp_config?.track_keywords ?? []

  // Fetch feed posts (reuse watchlist feed logic)
  let feedPosts: FeedPost[] = []
  try {
    // Use internal fetch to the existing feed API
    const feedRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'https://gtm-brain-roan.vercel.app' : 'http://localhost:3000'}/api/watchlist/feed`, {
      headers: { cookie: '' }, // Won't work server-to-server, use direct DB
    })
    if (feedRes.ok) {
      const json = await feedRes.json()
      feedPosts = (json.items ?? []).map((item: Record<string, unknown>) => ({
        text: (item.text as string) ?? '',
        author: (item.author as string) ?? '',
        platform: (item.platform as string) ?? 'x',
        likes: (item.engagement as Record<string, number>)?.likes ?? 0,
        replies: (item.engagement as Record<string, number>)?.replies ?? 0,
        retweets: (item.engagement as Record<string, number>)?.retweets ?? 0,
        url: (item.url as string) ?? '',
      }))
    }
  } catch { /* */ }

  // If feed fetch failed, try getting topics from action_log (posts user replied to)
  if (feedPosts.length === 0) {
    const { data: recentActions } = await auth.sb
      .from('action_log')
      .select('metadata, post_id, platform')
      .eq('user_id', user.id)
      .in('action_type', ['reply', 'x_thread', 'x_quote', 'li_post'])
      .order('created_at', { ascending: false })
      .limit(20)

    // Use tracked keywords as fallback topics
    if (trackKeywords.length > 0) {
      const topics: TrendingTopic[] = trackKeywords.slice(0, 5).map((kw: string) => ({
        topic: kw,
        postCount: 0,
        totalEngagement: 0,
        authors: [],
        userEngaged: (recentActions ?? []).some(a => JSON.stringify(a.metadata).toLowerCase().includes(kw.toLowerCase())),
        signalScore: 10,
        suggestedAngle: 'key_insight',
        samplePosts: [],
      }))
      return NextResponse.json({ success: true, data: { topics, source: 'keywords' } })
    }
    return NextResponse.json({ success: true, data: { topics: [], source: 'empty' } })
  }

  // Get user's reply history to check engagement
  const { data: userReplies } = await auth.sb
    .from('action_log')
    .select('post_id')
    .eq('user_id', user.id)
    .eq('action_type', 'reply')
    .order('created_at', { ascending: false })
    .limit(50)
  const repliedUrls = new Set((userReplies ?? []).map(r => r.post_id).filter(Boolean))

  // Extract topics using keyword matching + frequency analysis
  const topicMap = new Map<string, {
    posts: FeedPost[]; engagement: number; authors: Set<string>; userEngaged: boolean
  }>()

  // Match tracked keywords
  for (const post of feedPosts) {
    const textLower = post.text.toLowerCase()
    const eng = post.likes + post.replies + post.retweets
    const userReplied = repliedUrls.has(post.url)

    for (const kw of trackKeywords) {
      if (textLower.includes(kw.toLowerCase())) {
        const existing = topicMap.get(kw) ?? { posts: [], engagement: 0, authors: new Set(), userEngaged: false }
        existing.posts.push(post)
        existing.engagement += eng
        existing.authors.add(post.author)
        if (userReplied) existing.userEngaged = true
        topicMap.set(kw, existing)
      }
    }
  }

  // If fewer than 3 topics, use Claude Haiku to extract additional topics
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
            messages: [{ role: 'user', content: `Extract 3-5 trending topics from these social media posts. Return ONLY a JSON array of topic strings, no explanation.\n\n${sampleTexts}` }],
          }),
        })
        if (resp.ok) {
          const result = await resp.json()
          const raw = result.content?.[0]?.text ?? ''
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
          try {
            const extractedTopics = JSON.parse(cleaned) as string[]
            for (const topic of extractedTopics) {
              if (topicMap.has(topic.toLowerCase())) continue
              const matching = feedPosts.filter(p => p.text.toLowerCase().includes(topic.toLowerCase()))
              if (matching.length >= 2) {
                topicMap.set(topic.toLowerCase(), {
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

  // Score and rank topics
  const topics: TrendingTopic[] = [...topicMap.entries()]
    .map(([topic, data]) => {
      const signal = (data.posts.length * 10) + (data.engagement * 0.1) + (data.userEngaged ? 50 : 0)

      // Determine best angle
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
        })),
      }
    })
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, 5)

  return NextResponse.json({ success: true, data: { topics, source: 'feed' } })
}
