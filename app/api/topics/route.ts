import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { buildUserProfile } from '@/lib/user-profile'

// Trending topics engine — combines network signals with broader niche trends

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
  source: 'network' | 'trending' | 'both'  // where the signal came from
  samplePosts: Array<{ author: string; text: string; engagement: number; url: string }>
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const user = auth.dbUser
  const trackKeywords: string[] = user.icp_config?.track_keywords ?? []
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''

  // Fetch posts from watched accounts
  const feedPosts: FeedPost[] = []

  const { data: watchlist } = await auth.sb
    .from('sb_watchlist')
    .select('username, platform')
    .eq('user_id', user.id)

  const xAccounts = (watchlist ?? []).filter((w: { platform: string }) => w.platform === 'x')

  if (socialDataKey && xAccounts.length > 0) {
    const TWITTER_EPOCH = 1288834974657
    const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000
    const promises = xAccounts.slice(0, 10).map(async (account: { username: string }) => {
      try {
        const resp = await fetch(
          `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(`from:${account.username}`)}&type=Latest`,
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
            return !text.startsWith('RT @') && !text.startsWith('@') && text.length >= 30
          })
          .slice(0, 10)

        for (const tw of tweets) {
          const text = (tw.full_text as string) ?? (tw.text as string) ?? ''
          const idStr = tw.id_str as string

          // Only include posts from last 48 hours
          if (idStr) {
            const tweetMs = (Number(BigInt(idStr) >> BigInt(22))) + TWITTER_EPOCH
            if (tweetMs < twoDaysAgo) continue
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
      } catch { /* skip */ }
    })
    await Promise.all(promises)
  }

  // Build user profile for AI analysis
  const profile = await buildUserProfile(
    auth.sb, user.id,
    user.icp_config ?? { titles: [], exclude: [] },
    user.mode ?? 'personal_brand',
  )

  // STEP 1: Extract real themes from network posts via Haiku
  const networkTopics: TrendingTopic[] = []

  if (apiKey && feedPosts.length >= 3) {
    const postSamples = feedPosts
      .sort((a, b) => (b.likes + b.replies + b.retweets) - (a.likes + a.replies + a.retweets))
      .slice(0, 20)
      .map((p, i) => `[${i}] @${p.author}: "${p.text.substring(0, 200)}" (${p.likes + p.replies + p.retweets} eng)`)
      .join('\n')

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: `Analyze these posts from accounts this user watches. Extract the 5-8 specific THEMES being discussed — not generic keywords like "ai" or "startup", but specific conversations like "Claude Code shipping daily", "AI agent frameworks", "founder burnout in year 2".

USER FOCUS: ${profile.interests.slice(0, 10).join(', ') || trackKeywords.join(', ') || 'technology and business'}

POSTS FROM THEIR NETWORK:
${postSamples}

Return ONLY a JSON array:
[{"topic": "specific theme 3-6 words", "angle": "trending|data_point|framework|contrarian_take|how_to|breaking", "post_indices": [0, 3, 7], "why_relevant": "5 words why this matters to the user"}]

Rules:
- Extract ACTUAL themes from the posts, don't invent topics
- Be specific: "AI coding assistants replacing junior devs" not just "AI"
- Include post_indices that discuss this theme
- Rank by engagement velocity (high engagement + multiple authors = trending)` }],
        }),
      })

      if (resp.ok) {
        const result = await resp.json()
        const raw = result.content?.[0]?.text ?? ''
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        try {
          const extracted = JSON.parse(cleaned) as Array<{
            topic: string; angle: string; post_indices: number[]; why_relevant: string
          }>

          const sortedPosts = feedPosts
            .sort((a, b) => (b.likes + b.replies + b.retweets) - (a.likes + a.replies + a.retweets))
            .slice(0, 20)

          for (const item of extracted) {
            const matchedPosts = (item.post_indices ?? [])
              .map(i => sortedPosts[i])
              .filter(Boolean)

            if (matchedPosts.length === 0) continue

            const authors = [...new Set(matchedPosts.map(p => p.author))]
            const totalEng = matchedPosts.reduce((s, p) => s + p.likes + p.replies + p.retweets, 0)

            networkTopics.push({
              topic: item.topic,
              postCount: matchedPosts.length,
              totalEngagement: totalEng,
              authors: authors.slice(0, 5),
              userEngaged: false,
              signalScore: (matchedPosts.length * 20) + (totalEng * 0.1) + (authors.length * 15),
              suggestedAngle: item.angle ?? 'trending',
              source: 'network',
              samplePosts: matchedPosts.slice(0, 3).map(p => ({
                author: p.author,
                text: p.text.substring(0, 200),
                engagement: p.likes + p.replies + p.retweets,
                url: p.url,
              })),
            })
          }
        } catch { /* parse error */ }
      }
    } catch { /* api error */ }
  }

  // STEP 2: Search X for broader trending posts in user's niche
  const trendingTopics: TrendingTopic[] = []

  if (socialDataKey && apiKey && profile.interests.length > 0) {
    // Pick 2-3 interest areas to search for trending content
    const searchTerms = profile.interests.slice(0, 3)

    const trendingPosts: FeedPost[] = []
    const TWITTER_EPOCH = 1288834974657

    const trendPromises = searchTerms.map(async (term) => {
      try {
        const query = `${term} min_faves:50 lang:en`
        const resp = await fetch(
          `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(query)}&type=Top`,
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
            return !text.startsWith('RT @') && text.length >= 40
          })
          .slice(0, 5)

        for (const tw of tweets) {
          const text = (tw.full_text as string) ?? (tw.text as string) ?? ''
          const idStr = tw.id_str as string
          trendingPosts.push({
            text,
            author: tw.user?.screen_name ?? '',
            platform: 'x',
            likes: (tw.favorite_count as number) ?? 0,
            replies: (tw.reply_count as number) ?? 0,
            retweets: (tw.retweet_count as number) ?? 0,
            url: `https://x.com/${tw.user?.screen_name ?? 'x'}/status/${idStr}`,
          })
        }
      } catch { /* skip */ }
    })

    await Promise.all(trendPromises)

    // Use Haiku to extract themes from trending posts
    if (trendingPosts.length >= 3) {
      const trendSamples = trendingPosts
        .sort((a, b) => (b.likes + b.replies + b.retweets) - (a.likes + a.replies + a.retweets))
        .slice(0, 15)
        .map((p, i) => `[${i}] @${p.author}: "${p.text.substring(0, 200)}" (${p.likes + p.replies + p.retweets} eng)`)
        .join('\n')

      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 400,
            messages: [{ role: 'user', content: `What are the hottest conversations happening on X right now that overlap with "${profile.interests.slice(0, 5).join(', ')}"?

TRENDING POSTS:
${trendSamples}

Return ONLY a JSON array of 3-5 themes:
[{"topic": "specific trending theme 3-6 words", "angle": "trending|breaking|contrarian_take|data_point", "post_indices": [0, 2], "why_hot": "why this is blowing up right now in 5 words"}]

Be specific. "OpenAI board drama fallout" not "AI news". These should be CONVERSATIONS people are having right now.` }],
          }),
        })

        if (resp.ok) {
          const result = await resp.json()
          const raw = result.content?.[0]?.text ?? ''
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
          try {
            const extracted = JSON.parse(cleaned) as Array<{
              topic: string; angle: string; post_indices: number[]; why_hot: string
            }>

            const sortedTrending = trendingPosts
              .sort((a, b) => (b.likes + b.replies + b.retweets) - (a.likes + a.replies + a.retweets))
              .slice(0, 15)

            for (const item of extracted) {
              const matchedPosts = (item.post_indices ?? [])
                .map(i => sortedTrending[i])
                .filter(Boolean)

              if (matchedPosts.length === 0) continue

              // Check if this topic already exists in network topics
              const existingIdx = networkTopics.findIndex(nt =>
                nt.topic.toLowerCase().includes(item.topic.toLowerCase().split(' ')[0]) ||
                item.topic.toLowerCase().includes(nt.topic.toLowerCase().split(' ')[0])
              )

              if (existingIdx >= 0) {
                // Merge: topic exists in both network and trending
                networkTopics[existingIdx] = {
                  ...networkTopics[existingIdx],
                  source: 'both',
                  signalScore: networkTopics[existingIdx].signalScore * 1.5, // boost merged topics
                }
                continue
              }

              const authors = [...new Set(matchedPosts.map(p => p.author))]
              const totalEng = matchedPosts.reduce((s, p) => s + p.likes + p.replies + p.retweets, 0)

              trendingTopics.push({
                topic: item.topic,
                postCount: matchedPosts.length,
                totalEngagement: totalEng,
                authors: authors.slice(0, 5),
                userEngaged: false,
                signalScore: (totalEng * 0.05) + (matchedPosts.length * 10),
                suggestedAngle: item.angle ?? 'trending',
                source: 'trending',
                samplePosts: matchedPosts.slice(0, 3).map(p => ({
                  author: p.author,
                  text: p.text.substring(0, 200),
                  engagement: p.likes + p.replies + p.retweets,
                  url: p.url,
                })),
              })
            }
          } catch { /* parse error */ }
        }
      } catch { /* api error */ }
    }
  }

  // STEP 3: Surface breaking news from HN front page (always-on, no interest filter)
  const breakingTopics: TrendingTopic[] = []

  if (apiKey) {
    try {
      // Fetch HN front page top stories
      const hnResp = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
        signal: AbortSignal.timeout(5000),
      })
      if (hnResp.ok) {
        const topIds = (await hnResp.json() as number[]).slice(0, 15)
        const hnStories = await Promise.all(
          topIds.map(async (id) => {
            try {
              const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
                signal: AbortSignal.timeout(3000),
              })
              if (!r.ok) return null
              const story = await r.json()
              return {
                title: story.title ?? '',
                score: story.score ?? 0,
                comments: story.descendants ?? 0,
                url: story.url ?? `https://news.ycombinator.com/item?id=${id}`,
                hnUrl: `https://news.ycombinator.com/item?id=${id}`,
                by: story.by ?? '',
              }
            } catch { return null }
          })
        )
        const validStories = hnStories.filter(Boolean).filter(s => s!.score >= 50) as Array<{
          title: string; score: number; comments: number; url: string; hnUrl: string; by: string
        }>

        if (validStories.length >= 3) {
          // Use Haiku to find tech/startup breaking news worth posting about
          const hnSamples = validStories.slice(0, 12)
            .map((s, i) => `[${i}] "${s.title}" (${s.score} pts, ${s.comments} comments)`)
            .join('\n')

          const hnResp2 = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 400,
              messages: [{ role: 'user', content: `These are the top Hacker News stories right now. Which 3-5 are the biggest BREAKING NEWS or CONTROVERSIES that tech/startup people should have an opinion about?

HN FRONT PAGE:
${hnSamples}

Return ONLY a JSON array:
[{"topic": "specific headline 4-7 words", "post_indices": [0, 3], "why_hot": "5 words why this matters"}]

Rules:
- Only include stories that are genuinely controversial, surprising, or breaking
- Skip Show HN, hiring posts, tutorials, and evergreen content
- Focus on: company drama, policy changes, acquisitions, security incidents, market shifts` }],
            }),
          })

          if (hnResp2.ok) {
            const result = await hnResp2.json()
            const raw = result.content?.[0]?.text ?? ''
            const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
            try {
              const extracted = JSON.parse(cleaned) as Array<{
                topic: string; post_indices: number[]; why_hot: string
              }>
              for (const item of extracted) {
                const matched = (item.post_indices ?? []).map(i => validStories[i]).filter(Boolean)
                if (matched.length === 0) continue
                const totalEng = matched.reduce((s, p) => s + p.score + p.comments, 0)

                // Skip if already covered by network or trending topics
                const alreadyCovered = [...networkTopics, ...trendingTopics].some(t =>
                  t.topic.toLowerCase().split(' ').some(w => item.topic.toLowerCase().includes(w) && w.length > 4)
                )
                if (alreadyCovered) continue

                breakingTopics.push({
                  topic: item.topic,
                  postCount: matched.length,
                  totalEngagement: totalEng,
                  authors: matched.map(p => p.by).slice(0, 3),
                  userEngaged: false,
                  signalScore: totalEng * 0.3 + matched[0].score * 0.5,
                  suggestedAngle: 'breaking',
                  source: 'trending',
                  samplePosts: matched.slice(0, 2).map(p => ({
                    author: p.by,
                    text: p.title,
                    engagement: p.score + p.comments,
                    url: p.hnUrl,
                  })),
                })
              }
            } catch { /* parse error */ }
          }
        }
      }
    } catch { /* HN API error */ }
  }

  // Combine and rank all topics
  const allTopics = [...networkTopics, ...trendingTopics, ...breakingTopics]
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, 10)

  // Mark user engagement
  const { data: userReplies } = await auth.sb
    .from('action_log')
    .select('post_id')
    .eq('user_id', user.id)
    .eq('action_type', 'reply')
    .order('created_at', { ascending: false })
    .limit(50)
  const repliedUrls = new Set((userReplies ?? []).map((r: { post_id: string }) => r.post_id).filter(Boolean))

  for (const topic of allTopics) {
    topic.userEngaged = topic.samplePosts.some(p => repliedUrls.has(p.url))
  }

  return NextResponse.json({
    success: true,
    data: {
      topics: allTopics,
      source: allTopics.length > 0 ? 'ai' : 'empty',
      networkCount: networkTopics.length,
      trendingCount: trendingTopics.length,
    },
  })
}
