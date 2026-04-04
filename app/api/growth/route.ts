import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sinceDate = thirtyDaysAgo.toISOString().slice(0, 10)

  // Fetch follower snapshots (last 30 days)
  const { data: snapshots } = await auth.sb
    .from('metrics_snapshots')
    .select('value, snapshot_date')
    .eq('user_id', auth.dbUser.id)
    .eq('metric', 'x_followers')
    .gte('snapshot_date', sinceDate)
    .order('snapshot_date', { ascending: true })

  // Fetch LinkedIn connection snapshots (last 30 days)
  // Auto-refresh: if today's snapshot is missing and user has a LinkedIn URL, scrape now
  const today = new Date().toISOString().slice(0, 10)
  const linkedinUrl = auth.dbUser.linkedin_url as string | undefined
  const apifyToken = process.env.APIFY_TOKEN ?? ''

  if (linkedinUrl && apifyToken) {
    const { data: todayLi } = await auth.sb
      .from('metrics_snapshots')
      .select('id')
      .eq('user_id', auth.dbUser.id)
      .eq('metric', 'li_connections')
      .eq('snapshot_date', today)
      .single()

    if (!todayLi) {
      try {
        const resp = await fetch(
          `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [linkedinUrl], maxProfiles: 1 }),
            signal: AbortSignal.timeout(30000),
          }
        )
        if (resp.ok) {
          const profiles = await resp.json() as Array<Record<string, unknown>>
          const connections = (profiles[0]?.followerCount as number) ?? (profiles[0]?.connectionsCount as number)
          if (typeof connections === 'number' && connections > 0) {
            await auth.sb.from('metrics_snapshots').upsert(
              { user_id: auth.dbUser.id, metric: 'li_connections', value: connections, snapshot_date: today },
              { onConflict: 'user_id,metric,snapshot_date' }
            )
          }
        }
      } catch { /* scrape failed, use cached data */ }
    }
  }

  const { data: liData } = await auth.sb
    .from('metrics_snapshots')
    .select('value, snapshot_date')
    .eq('user_id', auth.dbUser.id)
    .eq('metric', 'li_connections')
    .gte('snapshot_date', sinceDate)
    .order('snapshot_date', { ascending: true })

  // Fetch daily action counts (last 30 days)
  const { data: actions } = await auth.sb
    .from('action_log')
    .select('created_at')
    .eq('user_id', auth.dbUser.id)
    .gte('created_at', thirtyDaysAgo.toISOString())

  // Aggregate actions by date
  const actionsByDate: Record<string, number> = {}
  for (const row of actions ?? []) {
    const dateStr = (row.created_at as string).slice(0, 10)
    actionsByDate[dateStr] = (actionsByDate[dateStr] ?? 0) + 1
  }

  const actionCounts = Object.entries(actionsByDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const followers = (snapshots ?? []).map((s) => ({
    date: s.snapshot_date as string,
    value: s.value as number,
  }))

  const connections = (liData ?? []).map((s) => ({
    date: s.snapshot_date as string,
    value: s.value as number,
  }))

  return NextResponse.json({
    success: true,
    data: { followers, connections, actions: actionCounts },
  })
}
