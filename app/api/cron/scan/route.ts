import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { scorePost, getIcpRelevanceWithHaiku, getIcpRelevanceWithProfile, getRecommendation, hasReplyContext, getReplyability } from '@/lib/scoring'
import type { ScoredPost, UserScoringConfig } from '@/lib/scoring'
import { buildUserProfile } from '@/lib/user-profile'
import { fetchRelevantTakes, takesToPrompt } from '@/lib/brain-context'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'
import { X_REPLY_SKILL, LINKEDIN_REPLY_SKILL, ANTI_AI_RULES, SPICY_MODIFIER, enforceCharLimit } from '@/lib/reply-prompts'
import type { NotificationMode, ReplyStyle } from '@/lib/types'

// Cron scanner — runs every 30 min via GitHub Actions
// Fetches posts from watched accounts + topic keywords
// Scores them with Haiku for ICP relevance
// Pushes top posts to connected notification channels

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const MAX_PUSHES_PER_SCAN = 5
const DEDUP_WINDOW_DAYS = 7
const WAKING_HOUR_START = 7
const WAKING_HOUR_END = 22
const MAX_PUSHES_PER_3H = 10

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
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''

  // Auto-track follower counts for all users with x_handle
  const { data: allUsers } = await sb
    .from('sb_users')
    .select('id, x_handle')
    .not('x_handle', 'is', null)

  if (socialDataKey && allUsers) {
    const today = new Date().toISOString().slice(0, 10)
    await Promise.all(allUsers.map(async (u) => {
      if (!u.x_handle) return
      try {
        const resp = await fetch(
          `https://api.socialdata.tools/twitter/user/${encodeURIComponent(u.x_handle)}`,
          {
            headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        )
        if (!resp.ok) return
        const data = await resp.json()
        const followers = data.followers_count ?? data.public_metrics?.followers_count
        if (typeof followers === 'number') {
          await sb.from('metrics_snapshots').upsert(
            { user_id: u.id, metric: 'x_followers', value: followers, snapshot_date: today },
            { onConflict: 'user_id,metric,snapshot_date' }
          )
        }
      } catch { /* skip */ }
    }))
  }

  // Auto-track LinkedIn connections for users with linkedin_url saved
  const apifyToken = process.env.APIFY_TOKEN ?? ''
  if (apifyToken) {
    const { data: liUsers } = await sb
      .from('sb_users')
      .select('id, linkedin_url')
      .not('linkedin_url', 'is', null)

    if (liUsers) {
      const today = new Date().toISOString().slice(0, 10)
      for (const u of liUsers) {
        const profileUrl = (u as Record<string, unknown>).linkedin_url as string
        if (!profileUrl) continue
        try {
          // Skip if already tracked today
          const { data: existing } = await sb
            .from('metrics_snapshots')
            .select('id')
            .eq('user_id', u.id)
            .eq('metric', 'li_connections')
            .eq('snapshot_date', today)
            .single()
          if (existing) continue

          const resp = await fetch(
            `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ urls: [profileUrl], maxProfiles: 1 }),
              signal: AbortSignal.timeout(30000),
            }
          )
          if (!resp.ok) continue
          const profiles = await resp.json() as Array<Record<string, unknown>>
          const connections = (profiles[0]?.followerCount as number) ?? (profiles[0]?.connectionsCount as number)
          if (typeof connections === 'number' && connections > 0) {
            await sb.from('metrics_snapshots').upsert(
              { user_id: u.id, metric: 'li_connections', value: connections, snapshot_date: today },
              { onConflict: 'user_id,metric,snapshot_date' }
            )
          }
        } catch { /* skip */ }
      }
    }
  }

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

    const notifMode: NotificationMode = user.notification_mode ?? 'realtime'
    const digestHour: number = user.digest_hour ?? 9
    const replyStyle: ReplyStyle = user.reply_style ?? 'balanced'
    const maxDaily: number = user.max_daily_posts ?? (notifMode === 'digest' ? 5 : 10)

    // Check timezone — only push during waking hours (realtime) or at digest hour (digest)
    const tz = user.timezone ?? 'America/New_York'
    try {
      const now = new Date()
      const localHour = parseInt(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }))

      if (notifMode === 'digest') {
        // Digest mode: only send during the digest hour window (e.g. 9:00-9:29)
        if (localHour !== digestHour) {
          results.push({ userId: user.id, pushed: 0, skipped: 0 })
          continue
        }
      } else {
        // Realtime mode: respect waking hours
        if (localHour < WAKING_HOUR_START || localHour >= WAKING_HOUR_END) {
          results.push({ userId: user.id, pushed: 0, skipped: 0 })
          continue
        }
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

    // Check daily push count for digest mode cap
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count: dailyPushCount } = await sb
      .from('sb_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('pushed_at', todayStart.toISOString())

    if ((dailyPushCount ?? 0) >= maxDaily) {
      results.push({ userId: user.id, pushed: 0, skipped: 0 })
      continue
    }

    if ((recentPushCount ?? 0) >= MAX_PUSHES_PER_3H) {
      results.push({ userId: user.id, pushed: 0, skipped: 0 })
      continue
    }

    const remainingSlots = Math.min(
      notifMode === 'digest' ? maxDaily : MAX_PUSHES_PER_SCAN,
      MAX_PUSHES_PER_3H - (recentPushCount ?? 0),
      maxDaily - (dailyPushCount ?? 0),
    )

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

      // Skip posts with no real context to reply to
      if (!hasReplyContext(post.text)) return null

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

      const replyability = getReplyability(post.text)
      const finalScore = ((haikuRelevance.score > 0 ? 200 * haikuRelevance.score : 0) +
        replyability * 80 + // boost easy-to-reply posts
        (rec.actions[0]?.priority === 'high' ? 100 : rec.actions[0]?.priority === 'medium' ? 30 : 1) +
        opportunityScore * 10) * topicBoost

      return { post, haikuRelevance, rec, finalScore }
    }))

    // Filter nulls, sort by score, take top N
    const topPosts = scored
      .filter((s): s is NonNullable<typeof s> => s !== null && s.haikuRelevance.score >= 0.15)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, remainingSlots)

    // Fetch voice profile + top replies ONCE per user (not per post)
    const voiceProfile = await getVoiceProfile(sb, user.id)
    const voicePrompt = voiceProfile ? voiceToPrompt(voiceProfile) : ''

    // Fetch user's best-performing replies for tone matching
    let topRepliesContext = ''
    const xHandle = user.x_handle
    const socialDataKeyLocal = process.env.SOCIALDATA_API_KEY ?? ''
    if (xHandle && socialDataKeyLocal) {
      try {
        const resp = await fetch(
          `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(`from:${xHandle}`)}&type=Latest`,
          {
            headers: { Authorization: `Bearer ${socialDataKeyLocal}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
          }
        )
        if (resp.ok) {
          const data = await resp.json()
          const replies = (data.tweets ?? [])
            .filter((tw: Record<string, unknown>) => tw.in_reply_to_status_id_str)
            .map((tw: Record<string, unknown>) => ({
              text: ((tw.full_text ?? tw.text ?? '') as string).replace(/^@\w+\s*/g, '').trim(),
              likes: (tw.favorite_count as number) ?? 0,
            }))
            .filter((r: { text: string; likes: number }) => r.likes >= 3 && r.text.length >= 20)
            .sort((a: { likes: number }, b: { likes: number }) => b.likes - a.likes)
            .slice(0, 3)

          if (replies.length > 0) {
            topRepliesContext = `\nYOUR TOP-PERFORMING REPLIES (match this tone and style):\n${replies.map((r: { text: string; likes: number }) => `- "${r.text}" (${r.likes} likes)`).join('\n')}\nWrite in the same voice, length, and approach as these successful replies.`
          }
        }
      } catch { /* skip */ }
    }

    const draftCtx: DraftReplyContext = { voicePrompt, topReplies: topRepliesContext, replyStyle }

    // Generate drafts for all top posts
    const postsWithDrafts: Array<{ post: FeedItem; haikuRelevance: { score: number; matchedTopic: string | null }; rec: ReturnType<typeof getRecommendation>; draftReply: string | null }> = []
    for (const { post, haikuRelevance, rec } of topPosts) {
      const relevantTakes = await fetchRelevantTakes(sb, user.id, post.text, 2)
      const draftReply = await generateDraftReply(post, takesToPrompt(relevantTakes), draftCtx)
      postsWithDrafts.push({ post, haikuRelevance, rec, draftReply })

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
    }

    // Push to channels — digest mode batches into one message, realtime sends individually
    let pushed = 0
    if (notifMode === 'digest' && postsWithDrafts.length > 0) {
      // Send one batched digest message
      for (const channel of channels) {
        if (channel.type === 'telegram' && channel.chat_id) {
          await pushDigestToTelegram(channel.chat_id, postsWithDrafts)
        }
        if (channel.type === 'slack' && channel.webhook_url) {
          await pushDigestToSlack(channel.webhook_url, postsWithDrafts)
        }
      }
      pushed = postsWithDrafts.length
    } else {
      // Realtime: send each post individually
      for (const { post, haikuRelevance, rec, draftReply } of postsWithDrafts) {
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

interface DraftReplyContext {
  readonly voicePrompt: string
  readonly topReplies: string
  readonly replyStyle: ReplyStyle
}

async function fetchTopReplies(tweetId: string, apiKey: string): Promise<string> {
  try {
    const resp = await fetch(
      `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(`conversation_id:${tweetId}`)}&type=Latest`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!resp.ok) return ''
    const data = await resp.json()
    const replies = (data.tweets ?? [])
      .filter((tw: Record<string, unknown>) => tw.in_reply_to_status_id_str === tweetId)
      .map((tw: Record<string, unknown>) => ({
        text: ((tw.full_text ?? tw.text ?? '') as string).replace(/^@\w+\s*/g, '').trim(),
        likes: (tw.favorite_count as number) ?? 0,
      }))
      .filter((r: { text: string; likes: number }) => r.text.length >= 15)
      .sort((a: { likes: number }, b: { likes: number }) => b.likes - a.likes)

    if (replies.length === 0) return ''

    const top = replies[0]
    const rest = replies.slice(1, 8)

    let ctx = `\nMOST LIKED REPLY (${top.likes} likes) — this is the winning angle, study its vibe:\n"${top.text}"`
    if (rest.length > 0) {
      ctx += `\n\nOTHER POPULAR REPLIES:\n${rest.map((r: { text: string; likes: number }) => `- "${r.text}" (${r.likes} likes)`).join('\n')}`
    }
    return ctx
  } catch {
    return ''
  }
}

async function generateDraftReply(
  post: FeedItem,
  userTakesContext = '',
  ctx: DraftReplyContext = { voicePrompt: '', topReplies: '', replyStyle: 'balanced' },
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return null

  const isLinkedIn = post.platform === 'linkedin'
  const replySkill = isLinkedIn ? LINKEDIN_REPLY_SKILL : X_REPLY_SKILL
  const charLimit = isLinkedIn ? 600 : 280
  const spicyBlock = ctx.replyStyle === 'spicy' ? `\n${SPICY_MODIFIER}\n` : ''

  // Fetch reply consensus for X posts
  let replyConsensusContext = ''
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''
  if (!isLinkedIn && socialDataKey && post.url) {
    const tweetIdMatch = post.url.match(/status\/(\d+)/)
    if (tweetIdMatch) {
      replyConsensusContext = await fetchTopReplies(tweetIdMatch[1], socialDataKey)
    }
  }

  // Pick a random structure to vary replies
  const structures = ['REFRAME', 'STACK', 'PROOF', 'QUESTION', 'ONE-LINER']
  const picked = structures[Math.floor(Math.random() * structures.length)]

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
        max_tokens: isLinkedIn ? 300 : 200,
        messages: [{
          role: 'user',
          content: `Write a ${isLinkedIn ? 'LinkedIn comment' : 'reply to this tweet'} by ${post.author}:

"${post.text.substring(0, 400)}"
${ctx.voicePrompt ? `\n${ctx.voicePrompt}` : ''}${ctx.topReplies ? `\n${ctx.topReplies}` : ''}${replyConsensusContext}${userTakesContext ? `\n${userTakesContext}` : ''}${spicyBlock}

NEVER prefix your reply with a label like "Reframe:", "Counterpoint:", "The real issue is". Just say it directly.

${replySkill}

${ANTI_AI_RULES}
${isLinkedIn ? '- Keep it 20-60 words (2-4 sentences). Must be over 15 words.' : '- Keep it under 280 characters.'}

Output ONLY the ${isLinkedIn ? 'comment' : 'reply'} text. Nothing else.`,
        }],
      }),
    })

    if (!resp.ok) return null
    const result = await resp.json()
    const raw = (result.content?.[0]?.text ?? '').trim()
    return raw ? enforceCharLimit(raw, charLimit) : null
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

// ═══ DIGEST PUSH — batched daily summary ═══

interface DigestItem {
  readonly post: FeedItem
  readonly haikuRelevance: { score: number; matchedTopic: string | null }
  readonly rec: ReturnType<typeof getRecommendation>
  readonly draftReply: string | null
}

async function pushDigestToTelegram(chatId: string, items: readonly DigestItem[]) {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? ''
  if (!token) return

  let text = `📋 *Your daily GTM digest* — ${items.length} post${items.length === 1 ? '' : 's'} worth replying to:\n\n`

  for (let i = 0; i < items.length; i++) {
    const { post, haikuRelevance, draftReply } = items[i]
    const platformEmoji = post.platform === 'linkedin' ? '🔵' : '🟠'
    const eng = (post.engagement?.likes ?? 0) + (post.engagement?.replies ?? 0) + (post.engagement?.retweets ?? 0)
    const topicTag = haikuRelevance.matchedTopic ? ` · ${haikuRelevance.matchedTopic}` : ''

    text += `${i + 1}. ${platformEmoji} *${post.author}*${topicTag}\n`
    text += `"${post.text.substring(0, 120)}${post.text.length > 120 ? '...' : ''}"\n`
    text += `${eng} engagers`
    if (draftReply) text += `\n💬 _${draftReply}_`
    text += `\n[Open](${post.url})\n\n`
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    })
  } catch (e) { console.error('Telegram digest push failed:', e) }
}

async function pushDigestToSlack(webhookUrl: string, items: readonly DigestItem[]) {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📋 Your daily GTM digest — ${items.length} posts` },
    },
  ]

  for (const { post, haikuRelevance, draftReply } of items) {
    const eng = (post.engagement?.likes ?? 0) + (post.engagement?.replies ?? 0) + (post.engagement?.retweets ?? 0)
    const topicTag = haikuRelevance.matchedTopic ? ` · ${haikuRelevance.matchedTopic}` : ''
    let postText = `*${post.author}* on ${post.platform === 'linkedin' ? 'LinkedIn' : 'X'}${topicTag}\n"${post.text.substring(0, 150)}${post.text.length > 150 ? '...' : ''}"\n${eng} engagers`
    if (draftReply) postText += `\n💬 _${draftReply}_`

    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: postText }, accessory: { type: 'button', text: { type: 'plain_text', text: '🔗 Open' }, url: post.url } },
    )
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    })
  } catch (e) { console.error('Slack digest push failed:', e) }
}
