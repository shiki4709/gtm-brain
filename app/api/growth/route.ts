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

  return NextResponse.json({
    success: true,
    data: { followers, actions: actionCounts },
  })
}
