import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { DEMO_EMAIL } from '@/lib/config'

interface Tweet {
  id: string
  text: string
  username: string
  name: string
  followers: number
  likes: number
  retweets: number
  replies: number
}

export async function POST(request: Request) {
  const body = await request.json()
  const { accounts, topics } = body as { accounts?: string[]; topics?: string[] }

  const apiKey = process.env.SOCIALDATA_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'SocialData API not configured' }, { status: 400 })
  }

  if ((!accounts || accounts.length === 0) && (!topics || topics.length === 0)) {
    return NextResponse.json({ error: 'No accounts or topics provided' }, { status: 400 })
  }

  const allTweets: Tweet[] = []
  const seen = new Set<string>()

  // Search by account
  for (const handle of accounts ?? []) {
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
        const tweets = (data.tweets ?? []).slice(0, 3)
        for (const tw of tweets) {
          if (seen.has(tw.id_str)) continue
          seen.add(tw.id_str)
          allTweets.push(parseTweet(tw))
        }
      }
    } catch {
      // Skip failed account
    }
  }

  // Search by topic
  for (const topic of topics ?? []) {
    try {
      const query = `${topic} min_retweets:5 lang:en`
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
          .filter((tw: Record<string, string>) => !tw.full_text?.startsWith('RT @'))
          .slice(0, 3)
        for (const tw of tweets) {
          if (seen.has(tw.id_str)) continue
          seen.add(tw.id_str)
          allTweets.push(parseTweet(tw))
        }
      }
    } catch {
      // Skip failed topic
    }
  }

  // Save to Supabase
  if (allTweets.length > 0) {
    const sb = createServiceClient()
    const { data: user } = await sb
      .from('sb_users')
      .select('id')
      .eq('email', DEMO_EMAIL)
      .single()

    if (user) {
      const rows = allTweets.map(tw => ({
        user_id: user.id,
        tweet_id: tw.id,
        tweet_url: `https://x.com/${tw.username}/status/${tw.id}`,
        author_handle: tw.username,
        author_name: tw.name,
        tweet_text: tw.text,
        status: 'surfaced',
      }))
      await sb.from('sb_x_engage').insert(rows)
    }
  }

  return NextResponse.json({ tweets: allTweets })
}

function parseTweet(tw: Record<string, unknown>): Tweet {
  const user = tw.user as Record<string, unknown> | undefined
  return {
    id: (tw.id_str as string) ?? '',
    text: (tw.full_text as string) ?? (tw.text as string) ?? '',
    username: (user?.screen_name as string) ?? '',
    name: (user?.name as string) ?? '',
    followers: (user?.followers_count as number) ?? 0,
    likes: (tw.favorite_count as number) ?? 0,
    retweets: (tw.retweet_count as number) ?? 0,
    replies: (tw.reply_count as number) ?? 0,
  }
}
