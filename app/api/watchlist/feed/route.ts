import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

interface FeedItem {
  platform: 'linkedin' | 'x'
  author: string
  authorHandle: string
  text: string
  url: string
  time: string
  engagement?: { likes?: number; replies?: number; retweets?: number }
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data: watchlist } = await auth.sb
    .from('sb_watchlist')
    .select('*')
    .eq('user_id', auth.dbUser.id)

  if (!watchlist || watchlist.length === 0) {
    return NextResponse.json({ success: true, items: [] })
  }

  const linkedinProfiles = watchlist.filter(w => w.platform === 'linkedin')
  const xAccounts = watchlist.filter(w => w.platform === 'x')

  const items: FeedItem[] = []

  // Fetch LinkedIn posts via Brave Search (parallel)
  const braveKey = process.env.BRAVE_SEARCH_KEY ?? ''
  if (braveKey && linkedinProfiles.length > 0) {
    const linkedinPromises = linkedinProfiles.map(async (profile) => {
      try {
        const q = `site:linkedin.com/posts/${profile.username}`
        const apiUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`
        const resp = await fetch(apiUrl, {
          headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        })

        if (!resp.ok) return

        const data = await resp.json()
        const results = (data.web?.results ?? []) as Array<Record<string, string>>

        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

        for (const r of results) {
          const url = r.url ?? ''
          if (!url.includes('linkedin.com/posts/')) continue

          // Filter out posts older than 30 days
          const pageAge = r.page_age ?? ''
          if (pageAge) {
            const postDate = new Date(pageAge)
            if (!isNaN(postDate.getTime()) && postDate.getTime() < thirtyDaysAgo) continue
          }

          // Extract post title from URL
          const titleMatch = url.match(/posts\/[^_]+[_-](.+?)(?:-activity|-\d|$)/)
          const title = titleMatch ? titleMatch[1].replace(/-/g, ' ').trim() : ''

          items.push({
            platform: 'linkedin',
            author: profile.display_name ?? profile.username,
            authorHandle: profile.username,
            text: (r.description ?? title ?? '').substring(0, 200),
            url: url.replace(/[?&](utm_\w+|trk|rcm)=[^&]*/g, '').replace(/[&?]$/, ''),
            time: pageAge,
          })
        }
      } catch {
        // Skip failed profile
      }
    })

    await Promise.all(linkedinPromises)
  }

  // Fetch X tweets via SocialData API (parallel)
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''
  if (socialDataKey && xAccounts.length > 0) {
    const xPromises = xAccounts.map(async (account) => {
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
        const tweets = (data.tweets ?? []).slice(0, 5)

        for (const tw of tweets) {
          items.push({
            platform: 'x',
            author: tw.user?.name ?? account.display_name ?? account.username,
            authorHandle: tw.user?.screen_name ?? account.username,
            text: (tw.full_text ?? tw.text ?? '').substring(0, 280),
            url: `https://x.com/${tw.user?.screen_name ?? account.username}/status/${tw.id_str}`,
            time: tw.created_at ?? '',
            engagement: {
              likes: tw.favorite_count ?? 0,
              replies: tw.reply_count ?? 0,
              retweets: tw.retweet_count ?? 0,
            },
          })
        }
      } catch {
        // Skip failed account
      }
    })

    await Promise.all(xPromises)
  }

  // Sort by time (newest first) — best effort since time formats differ
  items.sort((a, b) => {
    const timeA = new Date(a.time).getTime() || 0
    const timeB = new Date(b.time).getTime() || 0
    return timeB - timeA
  })

  // Update last_checked for all profiles
  const now = new Date().toISOString()
  await auth.sb
    .from('sb_watchlist')
    .update({ last_checked: now })
    .eq('user_id', auth.dbUser.id)

  return NextResponse.json({ success: true, items })
}
