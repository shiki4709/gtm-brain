import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { scorePost, getIcpRelevanceWithHaiku, getIcpRelevanceWithProfile, getRecommendation } from '@/lib/scoring'
import type { ScoredPost, UserScoringConfig } from '@/lib/scoring'
import { buildUserProfile } from '@/lib/user-profile'

// Cron scanner — runs every 30 min via GitHub Actions
// Fetches posts from watched accounts + topic keywords
// Scores them with Haiku for ICP relevance
// Pushes top posts to connected notification channels

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const MAX_PUSHES_PER_SCAN = 15
const DEDUP_WINDOW_DAYS = 7
const WAKING_HOUR_START = 7
const WAKING_HOUR_END = 22
const MAX_PUSHES_PER_3H = 20

interface FeedItem {
  platform: 'linkedin' | 'x'
  author: string
  authorHandle: string
  text: string
  url: string
  time: string
  engagement?: { likes?: number; replies?: number; retweets?: number }
  authorFollowers?: number
}

// Vercel Cron calls GET, GitHub Actions calls POST — support both
export async function GET(request: Request) {
  return handleScan(request)
}

export async function POST(request: Request) {
  return handleScan(request)
}

async function handleScan(request: Request) {
  // Verify cron secret — Vercel sends CRON_SECRET header automatically
  const authHeader = request.headers.get('authorization') ?? ''
  const vercelCron = request.headers.get('x-vercel-cron') // Vercel sets this for cron jobs
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && !vercelCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createServiceClient()

  // Get all users with notification channels configured
  const { data: users } = await sb
    .from('sb_users')
    .select('*')
    .not('notification_channels', 'eq', '[]')

  if (!users || users.length === 0) {
    return NextResponse.json({ success: true, message: 'No users with notifications configured' })
  }

  const results: Array<{ userId: string; pushed: number; skipped: number }> = []

  for (const user of users) {
    const channels: Array<{ type: string; chat_id?: string; webhook_url?: string }> = user.notification_channels ?? []
    if (channels.length === 0) continue

    // Check timezone — only push during waking hours
    const tz = user.timezone ?? 'America/New_York'
    try {
      const now = new Date()
      const localHour = parseInt(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }))
      if (localHour < WAKING_HOUR_START || localHour >= WAKING_HOUR_END) {
        results.push({ userId: user.id, pushed: 0, skipped: 0 })
        continue
      }
    } catch {
      // Invalid timezone, proceed anyway
    }

    // Get user's watchlist
    const { data: watchlist } = await sb
      .from('sb_watchlist')
      .select('*')
      .eq('user_id', user.id)
      .limit(20) // cap per design doc

    if (!watchlist || watchlist.length === 0) {
      results.push({ userId: user.id, pushed: 0, skipped: 0 })
      continue
    }

    // Get recently pushed post URLs for dedup
    const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentNotifs } = await sb
      .from('sb_notifications')
      .select('post_url')
      .eq('user_id', user.id)
      .gte('pushed_at', dedupCutoff)

    const seenUrls = new Set((recentNotifs ?? []).map(n => n.post_url))

    // Check rate limit — max pushes in last 3 hours
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const { count: recentPushCount } = await sb
      .from('sb_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('pushed_at', threeHoursAgo)

    if ((recentPushCount ?? 0) >= MAX_PUSHES_PER_3H) {
      results.push({ userId: user.id, pushed: 0, skipped: 0 })
      continue
    }

    const remainingSlots = Math.min(MAX_PUSHES_PER_SCAN, MAX_PUSHES_PER_3H - (recentPushCount ?? 0))

    // Fetch posts from watched accounts + topics
    const posts = await fetchPosts(watchlist, user.icp_config?.track_keywords ?? [])

    // Filter out already-pushed and very old posts
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
    const freshPosts = posts.filter(p => {
      if (!p.time) return false
      const ts = new Date(p.time).getTime()
      if (isNaN(ts) || ts < oneDayAgo) return false
      if (seenUrls.has(p.url)) return false
      return true
    })

    // Score with user profile graph for accurate semantic relevance
    const config: UserScoringConfig = {
      trackKeywords: user.icp_config?.track_keywords ?? [],
      icpTitles: user.icp_config?.titles ?? [],
    }

    // Build user profile for semantic scoring
    const userProfile = await buildUserProfile(
      sb,
      user.id,
      user.icp_config ?? { titles: [], exclude: [] },
      user.mode ?? 'personal_brand',
    )

    // Fetch learned topic preferences for score boosting
    const { data: learnedInsight } = await sb
      .from('sb_insights')
      .select('insight_data')
      .eq('user_id', user.id)
      .eq('insight_type', 'weekly_brief')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    const insightData = learnedInsight?.insight_data as Record<string, Record<string, unknown>> | null
    const learnedTopics: string[] = insightData?.patterns?.bestTopics
      ? (insightData.patterns.bestTopics as string[])
      : []

    const scored = await Promise.all(freshPosts.map(async (post) => {
      // Use profile-based scoring (semantic, uses full user context)
      const haikuRelevance = userProfile.text.length > 50
        ? await getIcpRelevanceWithProfile(post.text, userProfile.text)
        : await getIcpRelevanceWithHaiku(post.text, config.icpTitles, config.trackKeywords)
      const rec = getRecommendation(post)

      // Skip posts with no real actions
      if (rec.actions[0]?.type === 'skip') return null

      // Opportunity score
      const authorFollowers = post.authorFollowers ?? 100
      const ageHours = Math.max(0.5, (Date.now() - new Date(post.time).getTime()) / 3600000)
      const recencyDecay = Math.max(0, 1 - (ageHours / 24))
      const existingReplies = post.engagement?.replies ?? 0
      const opportunityScore = (Math.log(authorFollowers + 1) * recencyDecay) / (existingReplies + 1)

      // Boost score if post text matches learned high-performing topics
      const topicBoost = learnedTopics.length > 0 &&
        learnedTopics.some(t => post.text.toLowerCase().includes(t.toLowerCase()))
        ? 1.15
        : 1.0

      const finalScore = ((haikuRelevance.score > 0 ? 200 * haikuRelevance.score : 0) +
        (rec.actions[0]?.priority === 'high' ? 100 : rec.actions[0]?.priority === 'medium' ? 30 : 1) +
        opportunityScore * 10) * topicBoost

      return { post, haikuRelevance, rec, finalScore }
    }))

    // Filter nulls, sort by score, take top N
    const topPosts = scored
      .filter((s): s is NonNullable<typeof s> => s !== null && s.haikuRelevance.score >= 0.15)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, remainingSlots)

    // Push to all connected channels
    let pushed = 0
    for (const { post, haikuRelevance, rec } of topPosts) {
      // Always draft a reply — this is a reply-focused bot
      const draftReply = await generateDraftReply(post)

      // Save to sb_notifications
      await sb.from('sb_notifications').insert({
        user_id: user.id,
        channel: channels[0]?.type ?? 'telegram',
        post_url: post.url,
        action_type: rec.actions[0]?.type ?? 'reply',
        draft_text: draftReply,
        score: Math.round(haikuRelevance.score * 100) / 100,
        status: 'pushed',
      })

      // Push to each channel
      for (const channel of channels) {
        if (channel.type === 'telegram' && channel.chat_id) {
          await pushToTelegram(channel.chat_id, post, rec, haikuRelevance, draftReply)
        }
        if (channel.type === 'slack' && channel.webhook_url) {
          await pushToSlack(channel.webhook_url, post, rec, haikuRelevance, draftReply)
        }
      }

      pushed++
    }

    results.push({ userId: user.id, pushed, skipped: freshPosts.length - pushed })
  }

  return NextResponse.json({ success: true, results })
}

// ═══ FETCH POSTS ═══

async function fetchPosts(
  watchlist: Array<{ platform: string; username: string; display_name: string; profile_url: string }>,
  trackKeywords: string[]
): Promise<FeedItem[]> {
  const items: FeedItem[] = []
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''

  // X tweets from watched accounts
  const xAccounts = watchlist.filter(w => w.platform === 'x')
  if (socialDataKey && xAccounts.length > 0) {
    const promises = xAccounts.map(async (account) => {
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
        const tweets = (data.tweets ?? [])
          .filter((tw: Record<string, unknown>) => {
            const text = (tw.full_text as string) ?? (tw.text as string) ?? ''
            return !text.startsWith('RT @') && !text.startsWith('@') && text.length >= 30
          })
          .slice(0, 5)

        const TWITTER_EPOCH = 1288834974657
        for (const tw of tweets) {
          let tweetTime = ''
          const idStr = tw.id_str as string
          if (idStr) {
            tweetTime = new Date((Number(BigInt(idStr) >> BigInt(22))) + TWITTER_EPOCH).toISOString()
          } else if (tw.created_at) {
            tweetTime = new Date(tw.created_at as string).toISOString()
          }

          items.push({
            platform: 'x',
            author: tw.user?.name ?? account.display_name ?? account.username,
            authorHandle: tw.user?.screen_name ?? account.username,
            text: ((tw.full_text ?? tw.text ?? '') as string).substring(0, 280),
            url: `https://x.com/${tw.user?.screen_name ?? account.username}/status/${idStr}`,
            time: tweetTime,
            engagement: { likes: tw.favorite_count ?? 0, replies: tw.reply_count ?? 0, retweets: tw.retweet_count ?? 0 },
            authorFollowers: tw.user?.followers_count ?? 0,
          })
        }
      } catch { /* skip */ }
    })
    await Promise.all(promises)
  }

  // Topic search
  if (socialDataKey && trackKeywords.length > 0) {
    const seenUrls = new Set(items.map(i => i.url))
    const topicPromises = trackKeywords.slice(0, 5).map(async (topic) => {
      try {
        const query = `${topic} min_retweets:5 lang:en`
        const resp = await fetch(
          `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(query)}&type=Latest`,
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
            if (text.startsWith('RT @') || text.startsWith('@') || text.length < 30) return false
            const latinChars = text.match(/[a-zA-Z]/g)?.length ?? 0
            if (latinChars < text.length * 0.3) return false
            const views = (tw as Record<string, number>).views_count ?? 0
            const rts = (tw as Record<string, number>).retweet_count ?? 0
            return views >= 5000 || rts >= 10
          })
          .slice(0, 3)

        const TWITTER_EPOCH = 1288834974657
        for (const tw of tweets) {
          let tweetTime = ''
          const idStr = tw.id_str as string
          if (idStr) tweetTime = new Date((Number(BigInt(idStr) >> BigInt(22))) + TWITTER_EPOCH).toISOString()
          const tweetUrl = `https://x.com/${tw.user?.screen_name ?? 'x'}/status/${idStr}`
          if (seenUrls.has(tweetUrl)) continue
          seenUrls.add(tweetUrl)

          items.push({
            platform: 'x',
            author: tw.user?.name ?? '',
            authorHandle: tw.user?.screen_name ?? '',
            text: ((tw.full_text ?? tw.text ?? '') as string).substring(0, 280),
            url: tweetUrl,
            time: tweetTime,
            engagement: { likes: tw.favorite_count ?? 0, replies: tw.reply_count ?? 0, retweets: tw.retweet_count ?? 0 },
            authorFollowers: tw.user?.followers_count ?? 0,
          })
        }
      } catch { /* skip */ }
    })
    await Promise.all(topicPromises)
  }

  return items
}

// ═══ DRAFT REPLY ═══

async function generateDraftReply(post: FeedItem): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return null

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Write a reply to this ${post.platform === 'x' ? 'tweet' : 'post'} by ${post.author}:

"${post.text.substring(0, 300)}"

Rules:
- 1-2 sentences, under 200 characters
- Use contractions, short sentences
- Reference something specific from the post
- Add value: data point, experience, or question
- NEVER start with "Great insight!", "So true!", "Love this!"
- Sound human, not like a bot
- Output ONLY the reply text`,
        }],
      }),
    })

    if (!resp.ok) return null
    const result = await resp.json()
    return (result.content?.[0]?.text ?? '').trim() || null
  } catch {
    return null
  }
}

// ═══ TELEGRAM PUSH ═══

async function pushToTelegram(
  chatId: string,
  post: FeedItem,
  rec: ReturnType<typeof getRecommendation>,
  relevance: { score: number; matchedTopic: string | null },
  draftReply: string | null
) {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? ''
  if (!token) return

  const platformEmoji = post.platform === 'linkedin' ? '🔵' : '🟠'
  const action = rec.actions[0]
  const eng = (post.engagement?.likes ?? 0) + (post.engagement?.replies ?? 0) + (post.engagement?.retweets ?? 0)
  const topicTag = relevance.matchedTopic ? ` · ICP: ${relevance.matchedTopic}` : ''

  let text = `${platformEmoji} **${post.author}** posted on ${post.platform === 'linkedin' ? 'LinkedIn' : 'X'}\n`
  text += `"${post.text.substring(0, 200)}${post.text.length > 200 ? '...' : ''}"\n`
  text += `${eng} engagers${topicTag}\n`

  if (draftReply) {
    text += `\n💬 Draft reply:\n"${draftReply}"`
  }

  // Inline keyboard buttons — reply-focused
  const urlKey = post.url.substring(0, 50)
  const buttons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = []

  buttons.push([
    { text: '✅ Copy & Reply', callback_data: `act:${urlKey}` },
    { text: '✏️ New draft', callback_data: `edit:${urlKey}` },
  ])
  buttons.push([
    { text: '⏭ Skip', callback_data: `skip:${urlKey}` },
    { text: '🔗 Open post', url: post.url },
  ])

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }),
    })
  } catch (e) { console.error('Telegram push failed:', e) }
}

// ═══ SLACK PUSH ═══

async function pushToSlack(
  webhookUrl: string,
  post: FeedItem,
  rec: ReturnType<typeof getRecommendation>,
  relevance: { score: number; matchedTopic: string | null },
  draftReply: string | null
) {
  const eng = (post.engagement?.likes ?? 0) + (post.engagement?.replies ?? 0) + (post.engagement?.retweets ?? 0)
  const topicTag = relevance.matchedTopic ? ` · ICP: ${relevance.matchedTopic}` : ''
  const action = rec.actions[0]

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${post.author}* posted on ${post.platform === 'linkedin' ? 'LinkedIn' : 'X'}\n"${post.text.substring(0, 200)}${post.text.length > 200 ? '...' : ''}"\n${eng} engagers${topicTag}`,
      },
    },
  ]

  if (draftReply) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `💬 *Draft reply:*\n"${draftReply}"` },
    })
  }

  const actionButtons: Array<{ type: string; text: { type: string; text: string }; action_id?: string; url?: string }> = []

  if (action?.type === 'reply' && draftReply) {
    actionButtons.push({ type: 'button', text: { type: 'plain_text', text: '✅ Reply' }, action_id: 'act' })
  } else if (action?.type === 'scrape') {
    actionButtons.push({ type: 'button', text: { type: 'plain_text', text: '🔍 Scrape' }, action_id: 'act' })
  }
  actionButtons.push({ type: 'button', text: { type: 'plain_text', text: '⏭ Skip' }, action_id: 'skip' })
  actionButtons.push({ type: 'button', text: { type: 'plain_text', text: '🔗 Open' }, url: post.url })

  blocks.push({ type: 'actions', elements: actionButtons })

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    })
  } catch (e) { console.error('Slack push failed:', e) }
}
