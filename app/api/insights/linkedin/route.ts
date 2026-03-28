import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { dbUser: user, sb } = auth

  const insights: Record<string, unknown> = {}

  // 1. Topic performance (from scrapes)
  const { data: scrapes } = await sb
    .from('sb_scrapes')
    .select('post_topic, total_engagers, icp_matches')
    .eq('user_id', user.id)
    .not('post_topic', 'is', null)

  if (scrapes && scrapes.length > 0) {
    const topicMap = new Map<string, { count: number; totalIcp: number; rates: number[] }>()
    for (const s of scrapes) {
      const topic = s.post_topic as string
      const entry = topicMap.get(topic) ?? { count: 0, totalIcp: 0, rates: [] }
      entry.count++
      entry.totalIcp += (s.icp_matches as number) ?? 0
      const engagers = (s.total_engagers as number) ?? 0
      if (engagers > 0) entry.rates.push(((s.icp_matches as number) ?? 0) / engagers)
      topicMap.set(topic, entry)
    }

    insights.topics = Array.from(topicMap.entries())
      .map(([topic, data]) => ({
        topic,
        scrapes: data.count,
        avg_icp_rate: data.rates.length > 0
          ? Math.round((data.rates.reduce((a, b) => a + b, 0) / data.rates.length) * 100) / 100
          : 0,
        total_leads: data.totalIcp,
        confidence: Math.min(data.count / 10, 1.0),
      }))
      .sort((a, b) => b.avg_icp_rate - a.avg_icp_rate)
      .slice(0, 5)
  }

  // 2. DM effectiveness by style (from content_tags + leads)
  const { data: dmTags } = await sb
    .from('sb_content_tags')
    .select('reference_id, tags')
    .eq('user_id', user.id)
    .eq('platform', 'linkedin')
    .eq('content_type', 'dm')

  if (dmTags && dmTags.length > 0) {
    // Get lead statuses for these DMs
    const leadIds = dmTags.map(t => t.reference_id).filter(Boolean)
    const { data: leads } = await sb
      .from('sb_leads')
      .select('id, status')
      .in('id', leadIds)

    const leadStatus = new Map((leads ?? []).map(l => [l.id, l.status]))

    // Group by tone
    const toneMap = new Map<string, { sent: number; replied: number }>()
    const lengthMap = new Map<string, { sent: number; replied: number }>()
    const persMap = new Map<string, { sent: number; replied: number }>()

    for (const tag of dmTags) {
      const tags = tag.tags as Record<string, string>
      const status = leadStatus.get(tag.reference_id) ?? 'dm_drafted'
      const isSent = ['dm_sent', 'replied', 'converted'].includes(status)
      const isReplied = ['replied', 'converted'].includes(status)

      if (!isSent) continue

      for (const [map, key] of [[toneMap, tags.dm_tone], [lengthMap, tags.dm_length], [persMap, tags.dm_personalization]] as [Map<string, { sent: number; replied: number }>, string][]) {
        if (!key) continue
        const entry = map.get(key) ?? { sent: 0, replied: 0 }
        entry.sent++
        if (isReplied) entry.replied++
        map.set(key, entry)
      }
    }

    const mapToInsight = (map: Map<string, { sent: number; replied: number }>) =>
      Array.from(map.entries())
        .map(([value, data]) => ({
          value,
          sent: data.sent,
          replied: data.replied,
          reply_rate: data.sent > 0 ? Math.round((data.replied / data.sent) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.reply_rate - a.reply_rate)

    insights.dm_by_tone = mapToInsight(toneMap)
    insights.dm_by_length = mapToInsight(lengthMap)
    insights.dm_by_personalization = mapToInsight(persMap)
    insights.total_dms_classified = dmTags.length
  }

  // 3. Timing (from scrapes)
  const { data: timings } = await sb
    .from('sb_scrapes')
    .select('scrape_date, total_engagers, icp_matches')
    .eq('user_id', user.id)

  if (timings && timings.length >= 3) {
    const dayMap = new Map<number, { rates: number[] }>()
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    for (const s of timings) {
      const day = new Date(s.scrape_date as string).getDay()
      const entry = dayMap.get(day) ?? { rates: [] }
      const engagers = (s.total_engagers as number) ?? 0
      if (engagers > 0) entry.rates.push(((s.icp_matches as number) ?? 0) / engagers)
      dayMap.set(day, entry)
    }

    const dayStats = Array.from(dayMap.entries())
      .map(([day, data]) => ({
        day: dayNames[day],
        avg_icp_rate: data.rates.length > 0
          ? Math.round((data.rates.reduce((a, b) => a + b, 0) / data.rates.length) * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.avg_icp_rate - a.avg_icp_rate)

    if (dayStats.length > 0) {
      insights.timing = { best_day: dayStats[0].day, best_rate: dayStats[0].avg_icp_rate }
    }
  }

  return NextResponse.json({ success: true, data: insights })
}
