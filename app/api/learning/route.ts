import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { callClaude } from '@/lib/claude'

interface GrowthDay {
  readonly date: string
  readonly followerDelta: number
  readonly actions: number
  readonly topActionType: string
}

interface LearningPatterns {
  readonly mostActiveDay: string
  readonly avgActionsPerDay: number
  readonly notificationActRate: number
  readonly topAction: string
  readonly trend: string
  readonly bestTopics: readonly string[]
  readonly bestHour: string
  readonly bestDay: string
  readonly topGrowthDays: readonly GrowthDay[]
}

interface WeeklyBriefData {
  readonly brief: string
  readonly patterns: LearningPatterns
  readonly generatedAt: string
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const MIN_ACTIONS_THRESHOLD = 5
const CACHE_HOURS = 24

// GET: return cached brief or generate fresh
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { dbUser, sb } = auth
  const userId = dbUser.id

  // Check for cached brief (generated in last 24h)
  const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString()
  const { data: cached } = await sb
    .from('sb_insights')
    .select('insight_data, generated_at')
    .eq('user_id', userId)
    .eq('insight_type', 'weekly_brief')
    .gte('generated_at', cacheThreshold)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  if (cached) {
    return NextResponse.json({
      success: true,
      data: cached.insight_data as WeeklyBriefData,
    })
  }

  // No cache — generate fresh
  return generateBrief(userId, sb)
}

// POST: force regeneration
export async function POST() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { dbUser, sb } = auth
  return generateBrief(dbUser.id, sb)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateBrief(userId: string, sb: any) {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch all data sources in parallel
  const [actionResult, notifResult, scrapeResult] = await Promise.all([
    // 1. Action log — last 14 days
    sb
      .from('action_log')
      .select('action_type, created_at')
      .eq('user_id', userId)
      .gte('created_at', fourteenDaysAgo)
      .order('created_at', { ascending: false }),

    // 2. Notification act/skip rates
    sb
      .from('sb_notifications')
      .select('status, pushed_at')
      .eq('user_id', userId)
      .gte('pushed_at', fourteenDaysAgo),

    // 3. Scrape ICP match rates by topic
    sb
      .from('sb_scrapes')
      .select('post_topic, total_engagers, icp_matches')
      .eq('user_id', userId)
      .gte('scrape_date', fourteenDaysAgo),
  ])

  const actions: Array<{ action_type: string; created_at: string }> = actionResult.data ?? []

  // Check minimum data threshold
  if (actions.length < MIN_ACTIONS_THRESHOLD) {
    return NextResponse.json({
      success: true,
      data: null,
      message: 'Not enough data yet. Keep using the app for a few more days.',
    })
  }

  const notifications: Array<{ status: string; pushed_at: string }> = notifResult.data ?? []
  const scrapes: Array<{ post_topic: string | null; total_engagers: number; icp_matches: number }> = scrapeResult.data ?? []

  // Compute patterns

  // Most active day of week
  const dayCountMap: Record<number, number> = {}
  for (const a of actions) {
    const day = new Date(a.created_at).getDay()
    dayCountMap[day] = (dayCountMap[day] ?? 0) + 1
  }
  const mostActiveDayNum = Object.entries(dayCountMap)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? '1'
  const mostActiveDay = DAY_NAMES[parseInt(mostActiveDayNum)] ?? 'Monday'

  // Most common action type
  const actionTypeMap: Record<string, number> = {}
  for (const a of actions) {
    actionTypeMap[a.action_type] = (actionTypeMap[a.action_type] ?? 0) + 1
  }
  const topAction = Object.entries(actionTypeMap)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'reply'

  // Average actions per day
  const uniqueDays = new Set(actions.map(a => a.created_at.slice(0, 10)))
  const avgActionsPerDay = uniqueDays.size > 0
    ? Math.round((actions.length / uniqueDays.size) * 10) / 10
    : 0

  // Notification act rate
  const acted = notifications.filter(n => n.status === 'acted').length
  const skipped = notifications.filter(n => n.status === 'skipped').length
  const notificationActRate = (acted + skipped) > 0
    ? Math.round((acted / (acted + skipped)) * 100)
    : 0

  // Best topics from scrapes
  const topicRates: Record<string, { total: number; matches: number }> = {}
  for (const s of scrapes) {
    const topic = (s.post_topic as string) ?? 'unknown'
    const existing = topicRates[topic] ?? { total: 0, matches: 0 }
    topicRates[topic] = {
      total: existing.total + (s.total_engagers ?? 0),
      matches: existing.matches + (s.icp_matches ?? 0),
    }
  }
  const bestTopics = Object.entries(topicRates)
    .map(([topic, { total, matches }]) => ({
      topic,
      rate: total > 0 ? matches / total : 0,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3)
    .map(t => t.topic)

  // Best hour of day
  const hourCounts = new Map<number, number>()
  for (const action of actions) {
    const hour = new Date(action.created_at).getHours()
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1)
  }
  const bestHourNum = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const bestHourLabel = bestHourNum != null
    ? `${bestHourNum === 0 ? 12 : bestHourNum > 12 ? bestHourNum - 12 : bestHourNum}${bestHourNum >= 12 ? 'pm' : 'am'}`
    : 'not enough data'

  // Best day of week (reuse dayCountMap computed above)
  const bestDay = mostActiveDay

  // Attribution: follower growth correlation
  const { data: snapshots } = await sb
    .from('metrics_snapshots')
    .select('value, snapshot_date')
    .eq('user_id', userId)
    .eq('metric', 'x_followers')
    .order('snapshot_date', { ascending: true })
    .limit(14)

  const topGrowthDays: GrowthDay[] = []
  if (snapshots && snapshots.length > 1) {
    for (let i = 1; i < snapshots.length; i++) {
      const delta = (snapshots[i].value as number) - (snapshots[i - 1].value as number)
      if (delta > 0) {
        const dayActions = actions.filter(a => a.created_at.slice(0, 10) === snapshots[i].snapshot_date)
        const dayActionTypes: Record<string, number> = {}
        for (const da of dayActions) {
          dayActionTypes[da.action_type] = (dayActionTypes[da.action_type] ?? 0) + 1
        }
        const topActionType = Object.entries(dayActionTypes)
          .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'none'
        topGrowthDays.push({
          date: snapshots[i].snapshot_date as string,
          followerDelta: delta,
          actions: dayActions.length,
          topActionType,
        })
      }
    }
    topGrowthDays.sort((a, b) => b.followerDelta - a.followerDelta)
  }

  // Reply frequency trend (compare first 7 days vs last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const replyTypes = new Set(['reply', 'reply_copy', 'li_comment'])
  const recentReplies = actions.filter(
    a => a.created_at >= sevenDaysAgo && replyTypes.has(a.action_type),
  ).length
  const olderReplies = actions.filter(
    a => a.created_at < sevenDaysAgo && replyTypes.has(a.action_type),
  ).length
  const trend = recentReplies > olderReplies * 1.2
    ? 'increasing'
    : recentReplies < olderReplies * 0.8
      ? 'decreasing'
      : 'stable'

  const patterns: LearningPatterns = {
    mostActiveDay,
    avgActionsPerDay,
    notificationActRate,
    topAction,
    trend,
    bestTopics,
    bestHour: bestHourLabel,
    bestDay,
    topGrowthDays,
  }

  // Generate brief with Claude Haiku
  const prompt = `You are a GTM strategist analyzing a user's activity patterns from the last 14 days.

Data:
- Total actions: ${actions.length}
- Most active day: ${mostActiveDay}
- Top action type: ${topAction}
- Avg actions/day: ${avgActionsPerDay}
- Notification act rate: ${notificationActRate}%
- Reply trend: ${trend}
- Best performing scrape topics: ${bestTopics.length > 0 ? bestTopics.join(', ') : 'no scrape data yet'}
- Action breakdown: ${Object.entries(actionTypeMap).map(([k, v]) => `${k}: ${v}`).join(', ')}

Write EXACTLY 3 lines, each max 10 words. Dashboard labels, not sentences. No markdown, no asterisks, no periods.

- What worked: [max 10 words, e.g. "Replies driving momentum, 67% activation rate"]
- Try next week: [max 10 words, e.g. "Increase scrape actions to 8-10 per week"]
- Focus: [max 10 words, e.g. "Saturday reply sessions during peak engagement"]

Rules: No markdown. No asterisks. No headers. Max 10 words per line. Think dashboard label, not paragraph.`

  let briefText = ''
  try {
    const result = await callClaude(prompt, { maxTokens: 300 })
    briefText = result.text.trim()
  } catch {
    briefText = 'Unable to generate brief at this time. Check back later.'
  }

  const briefData: WeeklyBriefData = {
    brief: briefText,
    patterns,
    generatedAt: new Date().toISOString(),
  }

  // Save to sb_insights
  await sb.from('sb_insights').insert({
    user_id: userId,
    insight_type: 'weekly_brief',
    insight_data: briefData as unknown as Record<string, unknown>,
    confidence: Math.min(1, actions.length / 50), // confidence grows with more data
  })

  return NextResponse.json({ success: true, data: briefData })
}
