import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { DEMO_EMAIL } from '@/lib/config'

export async function GET() {
  const sb = createServiceClient()

  const { data: user } = await sb
    .from('sb_users')
    .select('id, icp_config')
    .eq('email', DEMO_EMAIL)
    .single()

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

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
  const sb = createServiceClient()

  const { data: user } = await sb
    .from('sb_users')
    .select('id')
    .eq('email', DEMO_EMAIL)
    .single()

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })
  }

  // Fetch insights for context
  const insightsRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : 'http://localhost:3000'}/api/insights`)
  const insightsJson = await insightsRes.json()

  // Fetch basic stats
  const { count: totalScrapes } = await sb
    .from('sb_scrapes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: totalIcp } = await sb
    .from('sb_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('icp_match', true)

  const { count: totalDms } = await sb
    .from('sb_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['dm_sent', 'replied'])

  const { count: totalReplies } = await sb
    .from('sb_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'replied')

  const insights = insightsJson.data ?? {}
  const topTopic = (insights.topic_performance as Array<Record<string, unknown>>)?.[0]
  const topAngle = (insights.dm_effectiveness as Array<Record<string, unknown>>)?.[0]
  const topTitle = (insights.icp_pattern as Array<Record<string, unknown>>)?.[0]

  const prompt = `You are a GTM brain that surfaces actionable insights. Given this data, write a 2-3 sentence weekly summary.

Stats:
- ${totalScrapes ?? 0} scrapes, ${totalIcp ?? 0} ICP leads, ${totalDms ?? 0} DMs sent, ${totalReplies ?? 0} replies
${topTopic ? `- Top topic: ${topTopic.topic} (${Math.round((topTopic.avg_icp_rate as number) * 100)}% ICP rate)` : ''}
${topAngle ? `- Best DM angle: ${topAngle.angle} (${Math.round((topAngle.reply_rate as number) * 100)}% reply rate)` : ''}
${topTitle ? `- Top ICP title: ${topTitle.title} (${topTitle.appearances} appearances)` : ''}
${insights.timing ? `- Best day: ${(insights.timing as Record<string, string>).best_day}` : ''}

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
      user_id: user.id,
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
