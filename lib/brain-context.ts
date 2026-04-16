// Brain context — pulls accumulated intelligence from Supabase for any task type
// Every pipeline step can use this to make brain-informed decisions

import { SupabaseClient } from '@supabase/supabase-js'

// What the brain knows, structured for prompt injection
export interface BrainContext {
  readonly taskType: TaskType
  readonly topTopics: ReadonlyArray<TopicInsight>
  readonly dmEffectiveness: ReadonlyArray<DmInsight>
  readonly icpPattern: ReadonlyArray<IcpInsight>
  readonly bestDay: string | null
  readonly recentInsights: ReadonlyArray<string>
  readonly userTakes: ReadonlyArray<UserTake>
}

export interface UserTake {
  readonly topic: string
  readonly opinion: string
  readonly keywords: string[]
}

export type TaskType =
  | 'content_generation'
  | 'dm_drafting'
  | 'x_reply'
  | 'lead_scoring'
  | 'post_finding'

interface TopicInsight {
  readonly topic: string
  readonly avgIcpRate: number
  readonly scrapeCount: number
}

interface DmInsight {
  readonly angle: string
  readonly sent: number
  readonly replyRate: number
}

interface IcpInsight {
  readonly title: string
  readonly appearances: number
  readonly replyRate: number
}

// Fetch brain context for a given user + task type
// Returns everything the brain knows that's relevant to this task
export async function fetchBrainContext(
  sb: SupabaseClient,
  userId: string,
  taskType: TaskType,
  icpTitles: readonly string[] = []
): Promise<BrainContext> {
  // Run all queries in parallel — each is independent
  const [topTopics, dmEffectiveness, icpPattern, bestDay, recentInsights, userTakes] =
    await Promise.all([
      fetchTopTopics(sb, userId),
      fetchDmEffectiveness(sb, userId),
      fetchIcpPattern(sb, userId, icpTitles),
      fetchBestDay(sb, userId),
      fetchRecentInsights(sb, userId),
      fetchUserTakes(sb, userId),
    ])

  return {
    taskType,
    topTopics,
    dmEffectiveness,
    icpPattern,
    bestDay,
    recentInsights,
    userTakes,
  }
}

// Convert brain context to a string that can be injected into any prompt
export function brainContextToPrompt(ctx: BrainContext): string {
  const sections: string[] = []

  if (ctx.topTopics.length > 0) {
    const topicLines = ctx.topTopics
      .map(
        (t) =>
          `- "${t.topic}" → ${Math.round(t.avgIcpRate * 100)}% ICP rate (${t.scrapeCount} scrapes)`
      )
      .join('\n')
    sections.push(`TOPICS THAT ATTRACT ICP LEADS:\n${topicLines}`)
  }

  if (ctx.dmEffectiveness.length > 0) {
    const dmLines = ctx.dmEffectiveness
      .map(
        (d) =>
          `- ${d.angle}: ${Math.round(d.replyRate * 100)}% reply rate (${d.sent} sent)`
      )
      .join('\n')
    sections.push(`DM ANGLES THAT GET REPLIES:\n${dmLines}`)
  }

  if (ctx.icpPattern.length > 0) {
    const icpLines = ctx.icpPattern
      .map((i) => `- ${i.title}: ${i.appearances} leads found`)
      .join('\n')
    sections.push(`ICP TITLES THAT ENGAGE MOST:\n${icpLines}`)
  }

  if (ctx.bestDay) {
    sections.push(`BEST DAY FOR ENGAGEMENT: ${ctx.bestDay}`)
  }

  if (ctx.recentInsights.length > 0) {
    sections.push(
      `RECENT BRAIN INSIGHTS:\n${ctx.recentInsights.map((i) => `- ${i}`).join('\n')}`
    )
  }

  if (ctx.userTakes.length > 0) {
    const takeLines = ctx.userTakes
      .map((t) => `- On "${t.topic}": "${t.opinion}"`)
      .join('\n')
    sections.push(`YOUR REAL OPINIONS (use these — this is what you actually think):\n${takeLines}`)
  }

  if (sections.length === 0) {
    return 'No brain data yet — this is early usage. Use general best practices.'
  }

  return `BRAIN CONTEXT (learned from your GTM data):\n\n${sections.join('\n\n')}`
}

// --- Private fetchers ---

async function fetchTopTopics(
  sb: SupabaseClient,
  userId: string
): Promise<ReadonlyArray<TopicInsight>> {
  const { data: scrapes } = await sb
    .from('sb_scrapes')
    .select('post_topic, total_engagers, icp_matches')
    .eq('user_id', userId)
    .not('post_topic', 'is', null)

  if (!scrapes || scrapes.length === 0) return []

  const topicMap = new Map<
    string,
    { count: number; rates: number[] }
  >()
  for (const s of scrapes) {
    const topic = s.post_topic as string
    const entry = topicMap.get(topic) ?? { count: 0, rates: [] }
    const updated = { count: entry.count + 1, rates: [...entry.rates] }
    const engagers = (s.total_engagers as number) ?? 0
    if (engagers > 0) {
      updated.rates.push(((s.icp_matches as number) ?? 0) / engagers)
    }
    topicMap.set(topic, updated)
  }

  return Array.from(topicMap.entries())
    .map(([topic, data]) => ({
      topic,
      scrapeCount: data.count,
      avgIcpRate:
        data.rates.length > 0
          ? data.rates.reduce((a, b) => a + b, 0) / data.rates.length
          : 0,
    }))
    .sort((a, b) => b.avgIcpRate - a.avgIcpRate)
    .slice(0, 5)
}

async function fetchDmEffectiveness(
  sb: SupabaseClient,
  userId: string
): Promise<ReadonlyArray<DmInsight>> {
  const { data: leads } = await sb
    .from('sb_leads')
    .select('dm_angle, status')
    .eq('user_id', userId)
    .in('status', ['dm_sent', 'replied'])
    .not('dm_angle', 'is', null)

  if (!leads || leads.length === 0) return []

  const angleMap = new Map<string, { sent: number; replied: number }>()
  for (const l of leads) {
    const angle = l.dm_angle as string
    const entry = angleMap.get(angle) ?? { sent: 0, replied: 0 }
    angleMap.set(angle, {
      sent: entry.sent + 1,
      replied: entry.replied + (l.status === 'replied' ? 1 : 0),
    })
  }

  return Array.from(angleMap.entries())
    .map(([angle, data]) => ({
      angle,
      sent: data.sent,
      replyRate: data.sent > 0 ? data.replied / data.sent : 0,
    }))
    .sort((a, b) => b.replyRate - a.replyRate)
}

async function fetchIcpPattern(
  sb: SupabaseClient,
  userId: string,
  icpTitles: readonly string[]
): Promise<ReadonlyArray<IcpInsight>> {
  if (icpTitles.length === 0) return []

  const { data: icpLeads } = await sb
    .from('sb_leads')
    .select('title, status')
    .eq('user_id', userId)
    .eq('icp_match', true)

  if (!icpLeads || icpLeads.length === 0) return []

  const titleMap = new Map<
    string,
    { appearances: number; dmsSent: number; replied: number }
  >()

  for (const l of icpLeads) {
    const titleLower = ((l.title as string) ?? '').toLowerCase()
    for (const icpTitle of icpTitles) {
      if (titleLower.includes(icpTitle.toLowerCase())) {
        const entry = titleMap.get(icpTitle) ?? {
          appearances: 0,
          dmsSent: 0,
          replied: 0,
        }
        titleMap.set(icpTitle, {
          appearances: entry.appearances + 1,
          dmsSent:
            entry.dmsSent +
            (l.status === 'dm_sent' || l.status === 'replied' ? 1 : 0),
          replied: entry.replied + (l.status === 'replied' ? 1 : 0),
        })
      }
    }
  }

  return Array.from(titleMap.entries())
    .map(([title, data]) => ({
      title,
      appearances: data.appearances,
      replyRate: data.dmsSent > 0 ? data.replied / data.dmsSent : 0,
    }))
    .sort((a, b) => b.appearances - a.appearances)
}

async function fetchBestDay(
  sb: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: scrapeTimings } = await sb
    .from('sb_scrapes')
    .select('scrape_date, total_engagers, icp_matches')
    .eq('user_id', userId)

  if (!scrapeTimings || scrapeTimings.length < 3) return null

  const dayMap = new Map<number, readonly number[]>()
  for (const s of scrapeTimings) {
    const day = new Date(s.scrape_date as string).getDay()
    const existing = dayMap.get(day) ?? []
    const engagers = (s.total_engagers as number) ?? 0
    if (engagers > 0) {
      dayMap.set(day, [
        ...existing,
        ((s.icp_matches as number) ?? 0) / engagers,
      ])
    }
  }

  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ]

  const sorted = Array.from(dayMap.entries())
    .map(([day, rates]) => ({
      day: dayNames[day],
      avg:
        rates.length > 0
          ? rates.reduce((a, b) => a + b, 0) / rates.length
          : 0,
    }))
    .sort((a, b) => b.avg - a.avg)

  return sorted.length > 0 ? sorted[0].day : null
}

async function fetchUserTakes(
  sb: SupabaseClient,
  userId: string
): Promise<ReadonlyArray<UserTake>> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: takes } = await sb
    .from('sb_insights')
    .select('insight_data')
    .eq('user_id', userId)
    .eq('insight_type', 'user_take')
    .gte('generated_at', ninetyDaysAgo)
    .order('generated_at', { ascending: false })
    .limit(20)

  if (!takes || takes.length === 0) return []

  return takes.map((t) => {
    const data = t.insight_data as { topic?: string; opinion?: string; keywords?: string[] }
    return {
      topic: data.topic ?? '',
      opinion: data.opinion ?? '',
      keywords: data.keywords ?? [],
    }
  }).filter((t) => t.topic && t.opinion)
}

// Fetch user takes filtered by relevance to specific text — for targeted injection
export async function fetchRelevantTakes(
  sb: SupabaseClient,
  userId: string,
  sourceText: string,
  limit = 3
): Promise<ReadonlyArray<UserTake>> {
  const allTakes = await fetchUserTakes(sb, userId)
  if (allTakes.length === 0) return []

  const sourceWords = new Set(
    sourceText.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
  )

  // Score each take by keyword overlap with the source text
  const scored = allTakes.map((take) => {
    const matches = take.keywords.filter((k) => sourceWords.has(k.toLowerCase())).length
    return { take, matches }
  })

  return scored
    .filter((s) => s.matches > 0)
    .sort((a, b) => b.matches - a.matches)
    .slice(0, limit)
    .map((s) => s.take)
}

// Format takes into a prompt string for direct injection
export function takesToPrompt(takes: ReadonlyArray<UserTake>): string {
  if (takes.length === 0) return ''
  const lines = takes.map((t) => `- On "${t.topic}": "${t.opinion}"`).join('\n')
  return `\nYOUR REAL OPINIONS (use these — this is what you actually think):\n${lines}`
}

async function fetchRecentInsights(
  sb: SupabaseClient,
  userId: string
): Promise<ReadonlyArray<string>> {
  const { data: insights } = await sb
    .from('sb_insights')
    .select('insight_type, insight_data')
    .eq('user_id', userId)
    .eq('insight_type', 'weekly_summary')
    .order('generated_at', { ascending: false })
    .limit(2)

  if (!insights || insights.length === 0) return []

  return insights
    .map((i) => {
      const data = i.insight_data as Record<string, unknown>
      return (data?.summary as string) ?? ''
    })
    .filter((s) => s.length > 0)
}
