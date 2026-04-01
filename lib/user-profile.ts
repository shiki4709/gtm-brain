// User Profile Graph — builds a rich text profile from accumulated signals
// Used by Haiku to semantically score post relevance instead of keyword matching

import { SupabaseClient } from '@supabase/supabase-js'

export interface UserProfile {
  readonly text: string           // The full profile text for Haiku
  readonly interests: readonly string[]  // Extracted interest areas (for display)
  readonly generatedAt: number    // Timestamp when profile was built
}

interface ActionLogRow {
  action_type: string
  metadata: Record<string, unknown>
  created_at: string
}

interface WatchlistRow {
  platform: string
  username: string
  display_name: string | null
  headline: string | null
}

interface InsightRow {
  insight_type: string
  insight_data: Record<string, unknown>
}

interface ScrapeRow {
  post_topic: string | null
  total_engagers: number
  icp_matches: number
}

// Build a rich text profile from all available user signals
export async function buildUserProfile(
  sb: SupabaseClient,
  userId: string,
  icpConfig: { titles: string[]; exclude: string[]; track_keywords?: string[] },
  mode: string,
  voiceProfile?: Record<string, unknown> | null,
): Promise<UserProfile> {
  // Fetch all signal sources in parallel
  const [actions, watchlist, insights, scrapes] = await Promise.all([
    fetchRecentActions(sb, userId),
    fetchWatchlist(sb, userId),
    fetchInsights(sb, userId),
    fetchTopicPerformance(sb, userId),
  ])

  const sections: string[] = []
  const interests: string[] = []

  // 1. Core identity from ICP config
  const titles = icpConfig.titles ?? []
  const keywords = icpConfig.track_keywords ?? []
  if (titles.length > 0 || keywords.length > 0) {
    sections.push(
      `USER'S TARGET AUDIENCE & INTERESTS:\n` +
      (titles.length > 0 ? `- Targets buyers with titles: ${titles.join(', ')}\n` : '') +
      (keywords.length > 0 ? `- Tracks topics: ${keywords.join(', ')}\n` : '') +
      `- Mode: ${mode === 'personal_brand' ? 'Personal brand building' : mode === 'b2b_outbound' ? 'B2B outbound sales' : 'Both personal brand and B2B'}`
    )
    interests.push(...keywords)
  }

  // 2. Watchlist — who they follow reveals what they care about
  if (watchlist.length > 0) {
    const watchLines = watchlist
      .map(w => {
        const headline = w.headline ? ` (${w.headline})` : ''
        return `- ${w.display_name ?? w.username}${headline} on ${w.platform}`
      })
      .join('\n')
    sections.push(`PEOPLE THEY WATCH (reveals industry focus):\n${watchLines}`)
  }

  // 3. Action patterns — what they actually engage with
  if (actions.length > 0) {
    const actionTypes = new Map<string, number>()
    const engagedTopics = new Map<string, number>()

    for (const a of actions) {
      actionTypes.set(a.action_type, (actionTypes.get(a.action_type) ?? 0) + 1)
      const topic = a.metadata?.topic as string | undefined
      if (topic) {
        engagedTopics.set(topic, (engagedTopics.get(topic) ?? 0) + 1)
      }
    }

    const actionSummary = Array.from(actionTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ')

    sections.push(`RECENT ACTIONS (last 2 weeks):\n- ${actionSummary}`)

    if (engagedTopics.size > 0) {
      const topTopics = Array.from(engagedTopics.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic, count]) => `${topic} (${count}x)`)
      sections.push(`TOPICS THEY ACTIVELY ENGAGE WITH:\n- ${topTopics.join(', ')}`)
      interests.push(...topTopics.map(t => t.replace(/ \(\d+x\)/, '')))
    }
  }

  // 4. Topic performance from scrapes — what converted
  if (scrapes.length > 0) {
    const topicMap = new Map<string, { count: number; totalRate: number }>()
    for (const s of scrapes) {
      if (!s.post_topic) continue
      const entry = topicMap.get(s.post_topic) ?? { count: 0, totalRate: 0 }
      const rate = s.total_engagers > 0 ? s.icp_matches / s.total_engagers : 0
      topicMap.set(s.post_topic, {
        count: entry.count + 1,
        totalRate: entry.totalRate + rate,
      })
    }

    const topPerformers = Array.from(topicMap.entries())
      .map(([topic, data]) => ({
        topic,
        avgRate: data.totalRate / data.count,
        count: data.count,
      }))
      .filter(t => t.count >= 2)
      .sort((a, b) => b.avgRate - a.avgRate)
      .slice(0, 5)

    if (topPerformers.length > 0) {
      const lines = topPerformers
        .map(t => `- "${t.topic}" → ${Math.round(t.avgRate * 100)}% ICP match rate (${t.count} scrapes)`)
        .join('\n')
      sections.push(`TOPICS THAT HISTORICALLY CONVERT TO LEADS:\n${lines}`)
    }
  }

  // 5. Weekly insights — AI-generated summaries of what worked
  if (insights.length > 0) {
    const summaries = insights
      .filter(i => i.insight_type === 'weekly_summary')
      .map(i => (i.insight_data as Record<string, unknown>)?.summary as string)
      .filter(Boolean)
      .slice(0, 2)

    if (summaries.length > 0) {
      sections.push(`RECENT AI INSIGHTS:\n${summaries.map(s => `- ${s}`).join('\n')}`)
    }
  }

  // 6. Voice/persona — how they want to present themselves
  if (voiceProfile) {
    const desc = voiceProfile.description as string | undefined
    const persona = voiceProfile.persona as string | undefined
    if (desc || persona) {
      sections.push(`BRAND VOICE:\n- ${desc ?? persona ?? ''}`)
    }
  }

  const text = sections.length > 0
    ? sections.join('\n\n')
    : `Tracking topics: ${keywords.join(', ') || 'none configured'}. Targeting: ${titles.join(', ') || 'none configured'}.`

  // Dedupe interests
  const uniqueInterests = [...new Set(interests.map(i => i.toLowerCase()))]

  return { text, interests: uniqueInterests, generatedAt: Date.now() }
}

// --- Private fetchers ---

async function fetchRecentActions(
  sb: SupabaseClient,
  userId: string,
): Promise<readonly ActionLogRow[]> {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await sb
    .from('action_log')
    .select('action_type, metadata, created_at')
    .eq('user_id', userId)
    .gte('created_at', twoWeeksAgo)
    .order('created_at', { ascending: false })
    .limit(200)

  return (data ?? []) as ActionLogRow[]
}

async function fetchWatchlist(
  sb: SupabaseClient,
  userId: string,
): Promise<readonly WatchlistRow[]> {
  const { data } = await sb
    .from('sb_watchlist')
    .select('platform, username, display_name, headline')
    .eq('user_id', userId)

  return (data ?? []) as WatchlistRow[]
}

async function fetchInsights(
  sb: SupabaseClient,
  userId: string,
): Promise<readonly InsightRow[]> {
  const { data } = await sb
    .from('sb_insights')
    .select('insight_type, insight_data')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(5)

  return (data ?? []) as InsightRow[]
}

async function fetchTopicPerformance(
  sb: SupabaseClient,
  userId: string,
): Promise<readonly ScrapeRow[]> {
  const { data } = await sb
    .from('sb_scrapes')
    .select('post_topic, total_engagers, icp_matches')
    .eq('user_id', userId)
    .not('post_topic', 'is', null)

  return (data ?? []) as ScrapeRow[]
}
