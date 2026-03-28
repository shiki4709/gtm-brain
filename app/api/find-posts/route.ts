import { NextResponse } from 'next/server'

interface Post {
  url: string
  author: string
  title: string
  snippet: string
  activity_id: string
  engagement: number // estimated from snippet signals
}

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000

export async function POST(request: Request) {
  const body = await request.json()
  const keywords = (body.keywords ?? '').trim()

  if (!keywords) {
    return NextResponse.json({ error: 'No keywords provided' }, { status: 400 })
  }

  const braveKey = process.env.BRAVE_SEARCH_KEY ?? ''

  if (braveKey) {
    // Queries biased toward high-engagement posts
    const queries = [
      { q: `site:linkedin.com/posts ${keywords}`, fresh: '&freshness=p3m' },
      { q: `site:linkedin.com/posts ${keywords} "comments" OR "reactions" OR "likes"`, fresh: '&freshness=p3m' },
      { q: `linkedin viral post ${keywords}`, fresh: '&freshness=p3m' },
      { q: `site:linkedin.com/posts ${keywords}`, fresh: '' },
    ]

    for (const { q, fresh } of queries) {
      try {
        const apiUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20${fresh}`
        const resp = await fetch(apiUrl, {
          headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        })

        if (resp.ok) {
          const data = await resp.json()
          const posts = parseBraveAPIResults(data)
          // Hard filter: only posts from the last 3 months
          const recent = posts.filter(p => isRecent(p, data))
          if (recent.length > 0) {
            return NextResponse.json({
              posts: recent,
              query: keywords,
              source: 'brave-api',
              note: fresh ? undefined : 'Showing recent posts — older results filtered out',
            })
          }
        }
      } catch {
        // Try next query
      }
    }

    return NextResponse.json({ posts: [], query: keywords, source: 'brave-api' })
  }

  // Fallback: scrape Brave Search HTML
  const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(`linkedin post ${keywords}`)}`

  try {
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    })
    const html = await resp.text()
    const posts = parseBraveHTML(html)
    return NextResponse.json({ posts, query: keywords, source: 'brave-scrape' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Search failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Check if a post is from the last 3 months using Brave's metadata
function isRecent(post: Post, braveData: Record<string, unknown>): boolean {
  const results = ((braveData.web as Record<string, unknown[]>)?.results ?? []) as Array<Record<string, unknown>>
  const match = results.find(r => {
    const url = (r.url as string) ?? ''
    return url.includes(post.activity_id) || url === post.url
  })

  if (match) {
    // Brave returns page_age as ISO date string
    const pageAge = (match.page_age as string) ?? (match.age as string) ?? ''
    if (pageAge) {
      const postDate = new Date(pageAge)
      if (!isNaN(postDate.getTime())) {
        return Date.now() - postDate.getTime() < THREE_MONTHS_MS
      }
    }
  }

  // If no date metadata, allow it (better to show than miss)
  return true
}

function parseBraveAPIResults(data: Record<string, unknown>): Post[] {
  const results = (data.web as Record<string, unknown[]>)?.results ?? []
  const seen = new Set<string>()
  const posts: Post[] = []

  for (const r of results as Array<Record<string, string>>) {
    const url = r.url ?? ''
    if (!url.includes('linkedin.com/posts/')) continue
    const clean = url.replace(/[?&](utm_\w+|trk|rcm)=[^&]*/g, '').replace(/[&?]$/, '')

    const actMatch = clean.match(/activity-(\d+)/)
    const dedupKey = actMatch ? actMatch[1] : clean
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)

    const postMatch = clean.match(/linkedin\.com\/posts\/([^_]+?)[-_](.+?)(?:-activity|-\d|$)/)
    const author = postMatch ? postMatch[1].replace(/-/g, ' ') : ''

    const snippet = (r.description ?? '').substring(0, 200)
    posts.push({
      url: clean,
      author,
      title: (r.title ?? '').substring(0, 120),
      snippet,
      activity_id: actMatch ? actMatch[1] : '',
      engagement: estimateEngagement(snippet, r.title ?? ''),
    })
  }

  // Sort by estimated engagement, highest first
  posts.sort((a, b) => b.engagement - a.engagement)

  return posts
}

// Extract engagement signals from snippet text
// LinkedIn snippets often contain "X likes · Y comments" or "X reactions"
function estimateEngagement(snippet: string, title: string): number {
  const text = `${snippet} ${title}`.toLowerCase()
  let score = 0

  // Look for numbers near engagement keywords
  const patterns = [
    /(\d[\d,]*)\s*(?:likes?|reactions?)/gi,
    /(\d[\d,]*)\s*(?:comments?)/gi,
    /(\d[\d,]*)\s*(?:reposts?|shares?)/gi,
  ]

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern)
    for (const m of matches) {
      score += parseInt(m[1].replace(/,/g, ''), 10) || 0
    }
  }

  // Boost posts by well-known authors (Brave ranks these higher naturally)
  // Higher Brave ranking position = likely more engagement
  if (score === 0) score = 1 // baseline so sorting is stable

  return score
}

function parseBraveHTML(rawHtml: string): Post[] {
  const html = rawHtml
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  const urlMatches = html.match(/linkedin\.com\/posts\/([^\s"<>]+activity-\d+[^\s"<>]*)/g) ?? []
  const urls = urlMatches.map(u => 'https://www.' + u)

  const snippetMatches = html.match(/<p class="snippet-description[^"]*"[^>]*>([\s\S]*?)<\/p>/g) ?? []
  const snippets = snippetMatches.map(s => s.replace(/<[^>]+>/g, '').trim())

  const titleMatches = html.match(/<span class="snippet-title"[^>]*>([\s\S]*?)<\/span>/g) ?? []
  const titles = titleMatches.map(t => t.replace(/<[^>]+>/g, '').trim())

  const seen = new Set<string>()
  const posts: Post[] = []
  let snippetIdx = 0

  for (const url of urls) {
    const clean = url.replace(/[?&](utm_\w+|trk|rcm)=[^&]*/g, '').replace(/[&?]$/, '')
    const actMatch = clean.match(/activity-(\d+)/)
    if (!actMatch || seen.has(actMatch[1])) continue
    seen.add(actMatch[1])

    const snippet = snippetIdx < snippets.length ? snippets[snippetIdx++] : ''
    const postMatch = clean.match(/linkedin\.com\/posts\/([^_]+)_(.+?)(?:-activity|-\d)/)
    const author = postMatch ? postMatch[1].replace(/-/g, ' ') : ''
    const searchTitle = posts.length < titles.length ? titles[posts.length] : ''
    const title = searchTitle || (postMatch ? postMatch[2].replace(/-/g, ' ') : '')

    posts.push({
      url: clean,
      author,
      title: title.substring(0, 120),
      snippet: snippet.substring(0, 200),
      activity_id: actMatch[1],
      engagement: estimateEngagement(snippet, title),
    })
  }

  posts.sort((a, b) => b.engagement - a.engagement)
  return posts
}
