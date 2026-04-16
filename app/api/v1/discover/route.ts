// POST /api/v1/discover — Find high-engagement posts matching criteria
// 1 credit

import { withApiAuth, corsOptions } from '@/lib/api-v1-handler'

interface DiscoverRequest {
  readonly keywords: string
  readonly platform: 'x' | 'linkedin'
  readonly min_engagement?: number
  readonly accounts?: string[] // X only: specific handles to search
  readonly limit?: number
}

export const OPTIONS = corsOptions

export const POST = withApiAuth('/api/v1/discover', 1, 'discover', async (request) => {
  const body = await request.json() as DiscoverRequest

  if (!body.keywords && (!body.accounts || body.accounts.length === 0)) {
    throw new Error('keywords or accounts is required')
  }
  if (!body.platform) {
    throw new Error('platform is required ("x" or "linkedin")')
  }

  const limit = Math.min(body.limit ?? 10, 20)

  if (body.platform === 'x') {
    return discoverX(body, limit)
  }
  return discoverLinkedIn(body.keywords, limit)
})

// ═══ X/Twitter via SocialData ═══

async function discoverX(body: DiscoverRequest, limit: number): Promise<Record<string, unknown>> {
  const apiKey = process.env.SOCIALDATA_API_KEY ?? ''
  if (!apiKey) throw new Error('X/Twitter search is not configured')

  type RawTweet = Record<string, unknown> & {
    id_str?: string
    full_text?: string
    text?: string
    favorite_count?: number
    retweet_count?: number
    reply_count?: number
    user?: {
      screen_name?: string
      name?: string
      followers_count?: number
    }
  }

  const allPosts: Array<Record<string, unknown>> = []
  const seen = new Set<string>()

  // Search by accounts
  for (const handle of body.accounts ?? []) {
    try {
      const query = `from:${handle}`
      const resp = await fetch(
        `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(query)}&type=Latest`,
        {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        }
      )
      if (resp.ok) {
        const data = await resp.json()
        for (const tw of (data.tweets ?? []).slice(0, 5) as RawTweet[]) {
          const id = tw.id_str ?? ''
          if (seen.has(id)) continue
          seen.add(id)
          allPosts.push(formatTweet(tw))
        }
      }
    } catch { /* skip failed account */ }
  }

  // Search by keywords
  if (body.keywords) {
    try {
      const query = `${body.keywords} min_retweets:5 lang:en`
      const resp = await fetch(
        `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(query)}&type=Latest`,
        {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        }
      )
      if (resp.ok) {
        const data = await resp.json()
        const tweets = (data.tweets ?? [])
          .filter((tw: { full_text?: string }) => !tw.full_text?.startsWith('RT @'))
          .slice(0, limit) as RawTweet[]
        for (const tw of tweets) {
          const id = tw.id_str ?? ''
          if (seen.has(id)) continue
          seen.add(id)
          allPosts.push(formatTweet(tw))
        }
      }
    } catch { /* skip */ }
  }

  // Filter by minimum engagement if specified
  const minEng = body.min_engagement ?? 0
  const filtered = minEng > 0
    ? allPosts.filter(p => ((p.engagement as Record<string, number>)?.likes ?? 0) >= minEng)
    : allPosts

  return { posts: filtered.slice(0, limit), platform: 'x', query: body.keywords }
}

function formatTweet(tw: Record<string, unknown>): Record<string, unknown> {
  const user = tw.user as Record<string, unknown> | undefined
  return {
    id: tw.id_str,
    text: tw.full_text ?? tw.text,
    url: `https://x.com/${(user?.screen_name as string) ?? ''}/status/${tw.id_str}`,
    author: user?.name,
    author_handle: user?.screen_name,
    author_followers: user?.followers_count,
    engagement: {
      likes: tw.favorite_count ?? 0,
      retweets: tw.retweet_count ?? 0,
      replies: tw.reply_count ?? 0,
    },
  }
}

// ═══ LinkedIn via Brave Search ═══

async function discoverLinkedIn(keywords: string, limit: number): Promise<Record<string, unknown>> {
  const braveKey = process.env.BRAVE_SEARCH_KEY ?? ''
  if (!braveKey) throw new Error('LinkedIn search is not configured')

  const query = `site:linkedin.com/posts ${keywords}`
  const resp = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(limit, 20)}&freshness=p3m`,
    {
      headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    }
  )

  if (!resp.ok) throw new Error('LinkedIn search failed')

  const data = await resp.json()
  const results = ((data.web as Record<string, unknown[]>)?.results ?? []) as Array<Record<string, string>>
  const seen = new Set<string>()
  const posts: Array<Record<string, unknown>> = []

  for (const r of results) {
    const url = r.url ?? ''
    if (!url.includes('linkedin.com/posts/')) continue
    const clean = url.replace(/[?&](utm_\w+|trk|rcm)=[^&]*/g, '').replace(/[&?]$/, '')

    const actMatch = clean.match(/activity-(\d+)/)
    const dedupKey = actMatch ? actMatch[1] : clean
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)

    const postMatch = clean.match(/linkedin\.com\/posts\/([^_]+?)[-_](.+?)(?:-activity|-\d|$)/)
    posts.push({
      url: clean,
      author: postMatch ? postMatch[1].replace(/-/g, ' ') : '',
      title: (r.title ?? '').substring(0, 120),
      snippet: (r.description ?? '').substring(0, 200),
      activity_id: actMatch ? actMatch[1] : '',
    })
  }

  return { posts: posts.slice(0, limit), platform: 'linkedin', query: keywords }
}
