import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Returns historical averages used for ROI estimation
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { dbUser: user, sb } = auth

  // 1. ICP match rate from scrapes
  const { data: scrapes } = await sb
    .from('sb_scrapes')
    .select('total_engagers, icp_matches')
    .eq('user_id', user.id)

  let avgIcpRate = 0.15 // benchmark
  let scrapeCount = 0
  if (scrapes && scrapes.length > 0) {
    scrapeCount = scrapes.length
    const totalEngagers = scrapes.reduce((sum, s) => sum + ((s.total_engagers as number) ?? 0), 0)
    const totalIcp = scrapes.reduce((sum, s) => sum + ((s.icp_matches as number) ?? 0), 0)
    if (totalEngagers > 0) avgIcpRate = totalIcp / totalEngagers
  }

  // 2. DM reply rate from leads
  const { count: dmsSent } = await sb
    .from('sb_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['dm_sent', 'replied', 'converted'])

  const { count: dmsReplied } = await sb
    .from('sb_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['replied', 'converted'])

  const sent = dmsSent ?? 0
  const replied = dmsReplied ?? 0
  let dmReplyRate = 0.12 // benchmark
  if (sent >= 3) dmReplyRate = replied / sent

  // 3. Meeting conversion rate from leads
  const { count: meetings } = await sb
    .from('sb_leads')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'converted')

  let meetingRate = 0.25 // benchmark
  if (replied >= 3) meetingRate = (meetings ?? 0) / replied

  // 4. Per-topic ICP rates
  const { data: topicScrapes } = await sb
    .from('sb_scrapes')
    .select('post_topic, total_engagers, icp_matches')
    .eq('user_id', user.id)
    .not('post_topic', 'is', null)

  const topicRates: Record<string, number> = {}
  if (topicScrapes) {
    const topicMap = new Map<string, { engagers: number; icp: number }>()
    for (const s of topicScrapes) {
      const topic = (s.post_topic as string).toLowerCase()
      const entry = topicMap.get(topic) ?? { engagers: 0, icp: 0 }
      entry.engagers += (s.total_engagers as number) ?? 0
      entry.icp += (s.icp_matches as number) ?? 0
      topicMap.set(topic, entry)
    }
    for (const [topic, data] of topicMap) {
      if (data.engagers > 0) topicRates[topic] = data.icp / data.engagers
    }
  }

  // 5. Reply engagement from brain log
  const { data: replyLogs } = await sb
    .from('sb_brain_log')
    .select('outcome')
    .eq('user_id', user.id)
    .eq('recommended_action', 'reply')
    .not('outcome', 'eq', '{}')

  let avgReplyLikes = 0
  let replyLogCount = 0
  if (replyLogs && replyLogs.length > 0) {
    replyLogCount = replyLogs.length
    const totalLikes = replyLogs.reduce((sum, l) => {
      const outcome = l.outcome as Record<string, number> | null
      return sum + (outcome?.likes_gained ?? 0)
    }, 0)
    avgReplyLikes = totalLikes / replyLogs.length
  }

  // Confidence level
  const dataPoints = scrapeCount + sent + replyLogCount
  const confidence = dataPoints >= 10 ? 'high' : dataPoints >= 5 ? 'medium' : dataPoints >= 1 ? 'low' : 'benchmark'

  return NextResponse.json({
    success: true,
    data: {
      avg_icp_rate: Math.round(avgIcpRate * 1000) / 1000,
      dm_reply_rate: Math.round(dmReplyRate * 1000) / 1000,
      meeting_rate: Math.round(meetingRate * 1000) / 1000,
      topic_rates: topicRates,
      avg_reply_likes: Math.round(avgReplyLikes * 10) / 10,
      confidence,
      data_points: { scrapes: scrapeCount, dms_sent: sent, dms_replied: replied, meetings: meetings ?? 0, reply_logs: replyLogCount },
    },
  })
}
