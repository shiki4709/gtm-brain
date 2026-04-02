import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Find posts similar to a given URL — for B2B users to find more scrapeable posts

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { url?: string; text?: string }
  const { url, text } = body

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''

  if (!apiKey) return NextResponse.json({ success: false, error: 'API not configured' }, { status: 500 })

  // Step 1: Get the source post content
  let sourceText = text ?? ''

  if (url && !sourceText && socialDataKey) {
    // Fetch from LinkedIn or X
    if (url.includes('x.com') || url.includes('twitter.com')) {
      const tweetId = url.split('/status/')[1]?.split('?')[0]
      if (tweetId) {
        try {
          const resp = await fetch(
            `https://api.socialdata.tools/twitter/tweets/${tweetId}`,
            {
              headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
              signal: AbortSignal.timeout(5000),
            }
          )
          if (resp.ok) {
            const tweet = await resp.json()
            sourceText = tweet.full_text ?? tweet.text ?? ''
          }
        } catch { /* */ }
      }
    }
  }

  if (!sourceText) {
    return NextResponse.json({ success: false, error: 'Could not fetch post content. Paste the text instead.' }, { status: 400 })
  }

  // Step 2: Use Haiku to extract search queries from the post
  let searchQueries: string[] = []
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: `Extract 3 X/Twitter search queries that would find posts similar to this one. Focus on the topic and intent, not the exact words.

Post: "${sourceText.substring(0, 500)}"

Return ONLY a JSON array of 3 search query strings. Each should be 3-6 words, using X search syntax (no operators).
Example: ["B2B SaaS GTM playbook", "outbound sales automation tools", "founder-led sales strategy"]` }],
      }),
    })
    if (resp.ok) {
      const result = await resp.json()
      const raw = result.content?.[0]?.text ?? ''
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      searchQueries = JSON.parse(cleaned) as string[]
    }
  } catch { /* */ }

  if (searchQueries.length === 0) {
    // Fallback: use first few meaningful words
    searchQueries = [sourceText.split(/\s+/).slice(0, 5).join(' ')]
  }

  // Step 3: Search X for similar posts
  interface SimilarPost {
    author: string
    authorHandle: string
    text: string
    url: string
    likes: number
    replies: number
    retweets: number
    query: string
  }

  const results: SimilarPost[] = []
  const seenUrls = new Set<string>()
  const TWITTER_EPOCH = 1288834974657

  if (socialDataKey) {
    const promises = searchQueries.slice(0, 3).map(async (query) => {
      try {
        const fullQuery = `${query} min_faves:10 lang:en`
        const resp = await fetch(
          `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(fullQuery)}&type=Top`,
          {
            headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
          }
        )
        if (!resp.ok) return
        const data = await resp.json()
        const tweets = (data.tweets ?? [])
          .filter((tw: Record<string, unknown>) => {
            const t = (tw.full_text as string) ?? (tw.text as string) ?? ''
            return !t.startsWith('RT @') && t.length >= 40
          })
          .slice(0, 5)

        for (const tw of tweets) {
          const idStr = tw.id_str as string
          const tweetUrl = `https://x.com/${tw.user?.screen_name ?? 'x'}/status/${idStr}`
          if (seenUrls.has(tweetUrl)) continue
          seenUrls.add(tweetUrl)

          results.push({
            author: tw.user?.name ?? '',
            authorHandle: tw.user?.screen_name ?? '',
            text: ((tw.full_text ?? tw.text ?? '') as string).substring(0, 300),
            url: tweetUrl,
            likes: (tw.favorite_count as number) ?? 0,
            replies: (tw.reply_count as number) ?? 0,
            retweets: (tw.retweet_count as number) ?? 0,
            query,
          })
        }
      } catch { /* */ }
    })
    await Promise.all(promises)
  }

  // Sort by engagement
  results.sort((a, b) => (b.likes + b.replies + b.retweets) - (a.likes + a.replies + a.retweets))

  return NextResponse.json({
    success: true,
    posts: results.slice(0, 15),
    queries: searchQueries,
  })
}
