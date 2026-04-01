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

  // Get recent posts from brain_log (already processed by the feed)
  let feedPosts: FeedPost[] = []
  try {
    const { data: brainPosts } = await auth.sb
      .from('sb_brain_log')
      .select('source_url, author_handle, platform, engagement_at_time')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (brainPosts && brainPosts.length > 0) {
      feedPosts = brainPosts.map((p: Record<string, unknown>) => {
        const eng = (p.engagement_at_time as Record<string, number>) ?? {}
        return {
          text: '', // brain_log doesn't store full text — we'll use keywords
          author: (p.author_handle as string) ?? '',
          platform: (p.platform as string) ?? 'x',
          likes: eng.likes ?? 0,
          replies: eng.comments ?? eng.replies ?? 0,
          retweets: eng.shares ?? eng.retweets ?? 0,
          url: (p.source_url as string) ?? '',
        }
      })
    }

    // Also get recent X engage items which have full text
    const { data: xEngagePosts } = await auth.sb
      .from('sb_x_engage')
      .select('tweet_url, author_handle, tweet_text')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)

    if (xEngagePosts) {
      for (const p of xEngagePosts) {
        feedPosts.push({
          text: (p.tweet_text as string) ?? '',
          author: (p.author_handle as string) ?? '',
          platform: 'x',
          likes: 0, replies: 0, retweets: 0,
          url: (p.tweet_url as string) ?? '',
        })
      }
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
