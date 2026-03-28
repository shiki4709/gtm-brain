import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const user = auth.dbUser
  const sb = auth.sb

  const userId = user.id
  const insights: Record<string, unknown> = {}

  // Topic performance — which post topics yield highest ICP match rate
  // Compute topic performance in JS from scrapes
  {
    const { data: scrapes } = await sb
      .from('sb_scrapes')
      .select('post_topic, total_engagers, icp_matches')
      .eq('user_id', userId)
      .not('post_topic', 'is', null)

    if (scrapes && scrapes.length > 0) {
      const topicMap = new Map<string, { count: number; totalIcp: number; rates: number[] }>()
      for (const s of scrapes) {
        const topic = s.post_topic as string
        const entry = topicMap.get(topic) ?? { count: 0, totalIcp: 0, rates: [] }
        entry.count++
        entry.totalIcp += (s.icp_matches as number) ?? 0
        const engagers = (s.total_engagers as number) ?? 0
        if (engagers > 0) {
          entry.rates.push(((s.icp_matches as number) ?? 0) / engagers)
        }
        topicMap.set(topic, entry)
      }

      insights.topic_performance = Array.from(topicMap.entries())
        .map(([topic, data]) => ({
          topic,
          scrape_count: data.count,
          avg_icp_rate: data.rates.length > 0
            ? Math.round((data.rates.reduce((a, b) => a + b, 0) / data.rates.length) * 100) / 100
            : 0,
          total_icp_leads: data.totalIcp,
          confidence: Math.min(data.count / 10, 1.0),
        }))
        .sort((a, b) => b.avg_icp_rate - a.avg_icp_rate)
        .slice(0, 5)
    }
  }

  // DM effectiveness — which angles get best reply rate
  const { data: leads } = await sb
    .from('sb_leads')
    .select('dm_angle, status')
    .eq('user_id', userId)
    .in('status', ['dm_sent', 'replied'])
    .not('dm_angle', 'is', null)

  if (leads && leads.length > 0) {
    const angleMap = new Map<string, { sent: number; replied: number }>()
    for (const l of leads) {
      const angle = l.dm_angle as string
      const entry = angleMap.get(angle) ?? { sent: 0, replied: 0 }
      entry.sent++
      if (l.status === 'replied') entry.replied++
      angleMap.set(angle, entry)
    }

    insights.dm_effectiveness = Array.from(angleMap.entries()).map(([angle, data]) => ({
      angle,
      sent: data.sent,
      replies: data.replied,
      reply_rate: data.sent > 0 ? Math.round((data.replied / data.sent) * 100) / 100 : 0,
    }))
  }

  // ICP pattern — which titles appear most and respond to DMs
  const icpTitles: string[] = user.icp_config?.titles ?? []
  if (icpTitles.length > 0) {
    const { data: icpLeads } = await sb
      .from('sb_leads')
      .select('title, status')
      .eq('user_id', userId)
      .eq('icp_match', true)

    if (icpLeads && icpLeads.length > 0) {
      const titleMap = new Map<string, { appearances: number; dms_sent: number; replied: number }>()
      for (const l of icpLeads) {
        const titleLower = ((l.title as string) ?? '').toLowerCase()
        for (const icpTitle of icpTitles) {
          if (titleLower.includes(icpTitle.toLowerCase())) {
            const entry = titleMap.get(icpTitle) ?? { appearances: 0, dms_sent: 0, replied: 0 }
            entry.appearances++
            if (l.status === 'dm_sent' || l.status === 'replied') entry.dms_sent++
            if (l.status === 'replied') entry.replied++
            titleMap.set(icpTitle, entry)
          }
        }
      }

      insights.icp_pattern = Array.from(titleMap.entries())
        .map(([title, data]) => ({
          title,
          appearances: data.appearances,
          dms_sent: data.dms_sent,
          replies: data.replied,
          reply_rate: data.dms_sent > 0 ? Math.round((data.replied / data.dms_sent) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.appearances - a.appearances)
    }
  }

  // Timing — day of week performance
  const { data: scrapeTimings } = await sb
    .from('sb_scrapes')
    .select('scrape_date, total_engagers, icp_matches')
    .eq('user_id', userId)

  if (scrapeTimings && scrapeTimings.length >= 3) {
    const dayMap = new Map<number, { rates: number[] }>()
    for (const s of scrapeTimings) {
      const day = new Date(s.scrape_date as string).getDay()
      const entry = dayMap.get(day) ?? { rates: [] }
      const engagers = (s.total_engagers as number) ?? 0
      if (engagers > 0) {
        entry.rates.push(((s.icp_matches as number) ?? 0) / engagers)
      }
      dayMap.set(day, entry)
    }

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayStats = Array.from(dayMap.entries())
      .map(([day, data]) => ({
        day: dayNames[day],
        avg_icp_rate: data.rates.length > 0
          ? Math.round((data.rates.reduce((a, b) => a + b, 0) / data.rates.length) * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.avg_icp_rate - a.avg_icp_rate)

    if (dayStats.length > 0) {
      insights.timing = {
        best_day: dayStats[0].day,
        best_rate: dayStats[0].avg_icp_rate,
        worst_day: dayStats[dayStats.length - 1].day,
        worst_rate: dayStats[dayStats.length - 1].avg_icp_rate,
      }
    }
  }

  return NextResponse.json({ success: true, data: insights })
}

// Generate weekly summary using Claude
export async function POST() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const user = auth.dbUser
  const sb = auth.sb

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })
  }

  // Fetch insights directly using the same sb client
  const userId = user.id

  // Fetch basic stats
  const { count: totalScrapes } = await sb
    .from('sb_scrapes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const { count: totalIcp } = await sb
    .from('sb_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('icp_match', true)

  const { count: totalDms } = await sb
    .from('sb_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['dm_sent', 'replied'])

  const { count: totalReplies } = await sb
    .from('sb_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'replied')

  // Fetch topic performance for context
  const { data: scrapes } = await sb
    .from('sb_scrapes')
    .select('post_topic, total_engagers, icp_matches')
    .eq('user_id', userId)
    .not('post_topic', 'is', null)

  let topTopic: Record<string, unknown> | undefined
  if (scrapes && scrapes.length > 0) {
    const topicMap = new Map<string, { count: number; rates: number[] }>()
    for (const s of scrapes) {
      const topic = s.post_topic as string
      const entry = topicMap.get(topic) ?? { count: 0, rates: [] }
      entry.count++
      const engagers = (s.total_engagers as number) ?? 0
      if (engagers > 0) {
        entry.rates.push(((s.icp_matches as number) ?? 0) / engagers)
      }
      topicMap.set(topic, entry)
    }
    const sorted = Array.from(topicMap.entries())
      .map(([topic, data]) => ({
        topic,
        avg_icp_rate: data.rates.length > 0
          ? data.rates.reduce((a, b) => a + b, 0) / data.rates.length
          : 0,
      }))
      .sort((a, b) => b.avg_icp_rate - a.avg_icp_rate)
    if (sorted.length > 0) topTopic = sorted[0]
  }

  // Fetch DM effectiveness for context
  const { data: dmLeads } = await sb
    .from('sb_leads')
    .select('dm_angle, status')
    .eq('user_id', userId)
    .in('status', ['dm_sent', 'replied'])
    .not('dm_angle', 'is', null)

  let topAngle: Record<string, unknown> | undefined
  if (dmLeads && dmLeads.length > 0) {
    const angleMap = new Map<string, { sent: number; replied: number }>()
    for (const l of dmLeads) {
      const angle = l.dm_angle as string
      const entry = angleMap.get(angle) ?? { sent: 0, replied: 0 }
      entry.sent++
      if (l.status === 'replied') entry.replied++
      angleMap.set(angle, entry)
    }
    const sorted = Array.from(angleMap.entries())
      .map(([angle, data]) => ({
        angle,
        reply_rate: data.sent > 0 ? data.replied / data.sent : 0,
      }))
      .sort((a, b) => (b.reply_rate as number) - (a.reply_rate as number))
    if (sorted.length > 0) topAngle = sorted[0]
  }

  // Fetch ICP pattern for context
  const icpTitles: string[] = user.icp_config?.titles ?? []
  let topTitle: Record<string, unknown> | undefined
  if (icpTitles.length > 0) {
    const { data: icpLeads } = await sb
      .from('sb_leads')
      .select('title')
      .eq('user_id', userId)
      .eq('icp_match', true)

    if (icpLeads && icpLeads.length > 0) {
      const titleMap = new Map<string, number>()
      for (const l of icpLeads) {
        const titleLower = ((l.title as string) ?? '').toLowerCase()
        for (const icpTitle of icpTitles) {
          if (titleLower.includes(icpTitle.toLowerCase())) {
            titleMap.set(icpTitle, (titleMap.get(icpTitle) ?? 0) + 1)
          }
        }
      }
      const sorted = Array.from(titleMap.entries())
        .map(([title, appearances]) => ({ title, appearances }))
        .sort((a, b) => b.appearances - a.appearances)
      if (sorted.length > 0) topTitle = sorted[0]
    }
  }

  // Fetch timing for context
  const { data: scrapeTimings } = await sb
    .from('sb_scrapes')
    .select('scrape_date, total_engagers, icp_matches')
    .eq('user_id', userId)

  let bestDay: string | undefined
  if (scrapeTimings && scrapeTimings.length >= 3) {
    const dayMap = new Map<number, number[]>()
    for (const s of scrapeTimings) {
      const day = new Date(s.scrape_date as string).getDay()
      const rates = dayMap.get(day) ?? []
      const engagers = (s.total_engagers as number) ?? 0
      if (engagers > 0) {
        rates.push(((s.icp_matches as number) ?? 0) / engagers)
      }
      dayMap.set(day, rates)
    }
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const sorted = Array.from(dayMap.entries())
      .map(([day, rates]) => ({
        day: dayNames[day],
        avg: rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0,
      }))
      .sort((a, b) => b.avg - a.avg)
    if (sorted.length > 0) bestDay = sorted[0].day
  }

  const prompt = `You are a GTM brain that surfaces actionable insights. Given this data, write a 2-3 sentence weekly summary.

Stats:
- ${totalScrapes ?? 0} scrapes, ${totalIcp ?? 0} ICP leads, ${totalDms ?? 0} DMs sent, ${totalReplies ?? 0} replies
${topTopic ? `- Top topic: ${topTopic.topic} (${Math.round((topTopic.avg_icp_rate as number) * 100)}% ICP rate)` : ''}
${topAngle ? `- Best DM angle: ${topAngle.angle} (${Math.round((topAngle.reply_rate as number) * 100)}% reply rate)` : ''}
${topTitle ? `- Top ICP title: ${topTitle.title} (${topTitle.appearances} appearances)` : ''}
${bestDay ? `- Best day: ${bestDay}` : ''}

Rules:
- Be specific with numbers
- Focus on what's working and what to do next
- 2-3 sentences max
- No corporate speak
- Output ONLY the summary, nothing else`

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
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json({ error: `Claude API error: ${resp.status}` }, { status: resp.status })
    }

    const result = await resp.json()
    const summary: string = result.content?.[0]?.text ?? ''

    // Save to insights table
    await sb.from('sb_insights').insert({
      user_id: userId,
      insight_type: 'weekly_summary',
      insight_data: { summary, generated_at: new Date().toISOString() },
      confidence: 0.7,
    })

    return NextResponse.json({ success: true, summary })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Summary generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
