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

  // Fetch LinkedIn posts via Apify (parallel)
  const apifyToken = process.env.APIFY_TOKEN ?? ''
  if (apifyToken && linkedinProfiles.length > 0) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const actorId = 'harvestapi~linkedin-profile-posts'

    const linkedinPromises = linkedinProfiles.map(async (profile) => {
      try {
        const profileUrl = profile.profile_url ?? `https://www.linkedin.com/in/${profile.username}`
        const resp = await fetch(
          `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileUrls: [profileUrl], maxPosts: 5 }),
            signal: AbortSignal.timeout(30000),
          }
        )

        if (!resp.ok) return

        const posts = await resp.json() as Array<Record<string, unknown>>

        for (const post of posts) {
          const postUrl = (post.postUrl as string) ?? (post.url as string) ?? ''
          const postText = (post.text as string) ?? (post.postText as string) ?? ''
          const postDate = (post.postedAt as string) ?? (post.date as string) ?? ''

          // Filter by date — use postedAt field or activity ID
          let postTimestamp = 0
          if (postDate) {
            postTimestamp = new Date(postDate).getTime()
          }
          if (postTimestamp === 0 || isNaN(postTimestamp)) {
            const actMatch = postUrl.match(/activity[- ](\d+)/)
            if (actMatch) {
              postTimestamp = Number(BigInt(actMatch[1]) >> BigInt(22))
            }
          }

          if (postTimestamp > 0 && postTimestamp < thirtyDaysAgo) continue

          items.push({
            platform: 'linkedin',
            author: profile.display_name ?? profile.username,
            authorHandle: profile.username,
            text: postText.substring(0, 200),
            url: postUrl || profileUrl,
            time: postTimestamp > 0 ? new Date(postTimestamp).toISOString() : '',
            engagement: {
              likes: (post.numLikes as number) ?? (post.reactions as number) ?? 0,
              replies: (post.numComments as number) ?? (post.comments as number) ?? 0,
              retweets: (post.numShares as number) ?? (post.shares as number) ?? 0,
            },
          })
        }
      } catch {
        // Skip failed profile — Apify timeout or error
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
