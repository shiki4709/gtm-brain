import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

interface SocialDataTweet {
  id_str: string
  full_text?: string
  text?: string
  created_at?: string
  favorite_count?: number
  retweet_count?: number
  reply_count?: number
  views_count?: number
  in_reply_to_status_id_str?: string | null
  is_quote_status?: boolean
  user?: {
    screen_name?: string
    name?: string
  }
}

interface ParentTweet {
  id_str: string
  full_text?: string
  text?: string
  user?: {
    screen_name?: string
    name?: string
  }
}

interface MyContentItem {
  id: string
  type: 'reply' | 'thread' | 'quote' | 'post'
  platform: 'x'
  text: string
  url: string
  createdAt: string
  engagement: {
    likes: number
    replies: number
    retweets: number
    views?: number
  }
  replyTo?: {
    author: string
    text: string
    url: string
  }
  fromBrain: boolean
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const xHandle = auth.dbUser.x_handle
  if (!xHandle) {
    return NextResponse.json({
      success: true,
      items: [],
      message: 'No X handle configured. Set it in Settings.',
    })
  }

  const apiKey = process.env.SOCIALDATA_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'SocialData API not configured' }, { status: 500 })
  }

  const handle = xHandle.replace(/^@/, '').trim()

  // Fetch user's recent tweets
  const query = `from:${handle}`
  let tweets: SocialDataTweet[] = []
  try {
    const resp = await fetch(
      `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(query)}&type=Latest`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!resp.ok) {
      return NextResponse.json({ success: false, error: `SocialData API error: ${resp.status}` }, { status: 502 })
    }
    const data = await resp.json()
    tweets = (data.tweets ?? []).slice(0, 50) as SocialDataTweet[]
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: `Failed to fetch tweets: ${message}` }, { status: 502 })
  }

  // Get action_log entries for cross-referencing "from Brain"
  const { data: actionLogs } = await auth.sb
    .from('action_log')
    .select('post_id, action_type, metadata')
    .eq('user_id', auth.dbUser.id)
    .in('action_type', ['reply', 'reply_copy', 'x_thread', 'x_quote', 'x_post', 'content'])
    .order('created_at', { ascending: false })
    .limit(200)

  const brainPostIds = new Set<string>(
    (actionLogs ?? [])
      .map((a: { post_id?: string | null }) => a.post_id)
      .filter((id): id is string => id !== null && id !== undefined)
  )

  // Collect reply parent IDs to batch-fetch
  const parentIds = tweets
    .filter(tw => tw.in_reply_to_status_id_str)
    .map(tw => tw.in_reply_to_status_id_str as string)

  // Fetch parent tweets (deduplicated)
  const uniqueParentIds = [...new Set(parentIds)]
  const parentMap = new Map<string, ParentTweet>()

  // Fetch parents in parallel (max 10 to avoid rate limits)
  const parentFetches = uniqueParentIds.slice(0, 10).map(async (pid) => {
    try {
      const resp = await fetch(
        `https://api.socialdata.tools/twitter/tweets/${pid}`,
        {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        }
      )
      if (resp.ok) {
        const parent = await resp.json() as ParentTweet
        parentMap.set(pid, parent)
      }
    } catch {
      // Skip failed parent fetches
    }
  })
  await Promise.all(parentFetches)

  // Build response items
  const items: MyContentItem[] = tweets.map((tw) => {
    const tweetText = tw.full_text ?? tw.text ?? ''
    const tweetUrl = `https://x.com/${handle}/status/${tw.id_str}`

    // Determine type
    let type: MyContentItem['type'] = 'post'
    if (tw.in_reply_to_status_id_str) {
      type = 'reply'
    } else if (tw.is_quote_status) {
      type = 'quote'
    }

    // Check if created via Brain — match tweet URL or parent URL in action_log
    const fromBrain = brainPostIds.has(tweetUrl) ||
      (tw.in_reply_to_status_id_str
        ? brainPostIds.has(`https://x.com/i/status/${tw.in_reply_to_status_id_str}`) ||
          // Also check if any action log post_id contains the parent tweet ID
          (actionLogs ?? []).some((a: { post_id?: string | null }) =>
            a.post_id?.includes(tw.in_reply_to_status_id_str as string)
          )
        : false)

    // Build replyTo if it's a reply and we have the parent
    let replyTo: MyContentItem['replyTo'] | undefined
    if (tw.in_reply_to_status_id_str) {
      const parent = parentMap.get(tw.in_reply_to_status_id_str)
      if (parent) {
        const parentHandle = parent.user?.screen_name ?? 'unknown'
        replyTo = {
          author: `@${parentHandle}`,
          text: (parent.full_text ?? parent.text ?? '').slice(0, 200),
          url: `https://x.com/${parentHandle}/status/${parent.id_str}`,
        }
      }
    }

    return {
      id: tw.id_str,
      type,
      platform: 'x' as const,
      text: tweetText,
      url: tweetUrl,
      createdAt: (() => {
        // Use snowflake ID for reliable timestamp
        const TWITTER_EPOCH = 1288834974657
        if (tw.id_str) {
          const ms = (Number(BigInt(tw.id_str as string) >> BigInt(22))) + TWITTER_EPOCH
          return new Date(ms).toISOString()
        }
        // Fallback: parse Twitter date format
        if (tw.created_at) return new Date(tw.created_at as string).toISOString()
        return new Date().toISOString()
      })(),
      engagement: {
        likes: tw.favorite_count ?? 0,
        replies: tw.reply_count ?? 0,
        retweets: tw.retweet_count ?? 0,
        views: tw.views_count,
      },
      replyTo,
      fromBrain,
    }
  })

  return NextResponse.json({ success: true, items })
}
