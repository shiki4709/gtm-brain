import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Surface relevant posts from Reddit and Hacker News
// Uses public APIs (no auth needed)

interface CommunityPost {
  platform: 'reddit' | 'hackernews'
  title: string
  text: string
  url: string
  commentsUrl: string
  score: number
  comments: number
  author: string
  subreddit?: string
  time: string
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const trackKeywords: string[] = auth.dbUser.icp_config?.track_keywords ?? []
  if (trackKeywords.length === 0) {
    return NextResponse.json({ success: true, posts: [], source: 'no_keywords' })
  }

  const posts: CommunityPost[] = []

  // Fetch from Reddit (public JSON API, no auth)
  const redditPromises = trackKeywords.slice(0, 3).map(async (keyword) => {
    try {
      const resp = await fetch(
        `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&t=day&limit=10`,
        {
          headers: { 'User-Agent': 'GTMBrain/1.0' },
          signal: AbortSignal.timeout(5000),
        }
      )
      if (!resp.ok) return
      const data = await resp.json()
      const children = data?.data?.children ?? []

      const oneDayAgo = Date.now() / 1000 - 24 * 60 * 60
      for (const child of children) {
        const post = child.data
        if (!post || post.over_18 || post.is_video) continue
        if ((post.created_utc ?? 0) < oneDayAgo) continue

        posts.push({
          platform: 'reddit',
          title: post.title ?? '',
          text: (post.selftext ?? '').substring(0, 300),
          url: post.url ?? '',
          commentsUrl: `https://www.reddit.com${post.permalink}`,
          score: post.score ?? 0,
          comments: post.num_comments ?? 0,
          author: post.author ?? '',
          subreddit: post.subreddit ?? '',
          time: new Date((post.created_utc ?? 0) * 1000).toISOString(),
        })
      }
    } catch { /* skip */ }
  })

  // Fetch from Hacker News (Algolia API)
  const hnPromises = trackKeywords.slice(0, 3).map(async (keyword) => {
    try {
      const oneDayAgoUnix = Math.floor(Date.now() / 1000) - 24 * 60 * 60
      const resp = await fetch(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(keyword)}&tags=story&hitsPerPage=10&numericFilters=created_at_i>${oneDayAgoUnix}`,
        { signal: AbortSignal.timeout(5000) }
      )
      if (!resp.ok) return
      const data = await resp.json()
      const hits = data?.hits ?? []

      for (const hit of hits) {
        posts.push({
          platform: 'hackernews',
          title: hit.title ?? '',
          text: '',
          url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
          commentsUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          score: hit.points ?? 0,
          comments: hit.num_comments ?? 0,
          author: hit.author ?? '',
          time: hit.created_at ?? '',
        })
      }
    } catch { /* skip */ }
  })

  await Promise.all([...redditPromises, ...hnPromises])

  // Sort by score (engagement proxy)
  posts.sort((a, b) => b.score - a.score)

  return NextResponse.json({ success: true, posts: posts.slice(0, 20) })
}
