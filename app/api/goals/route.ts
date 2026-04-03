import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getUserGoals, updateGoalTarget, getWeeklyProgress, getFollowerDelta, getPipelineFunnel, createDefaultGoals } from '@/lib/goals'

// Expected goal counts per mode (from DEFAULT_GOALS)
const EXPECTED_GOAL_COUNTS: Record<string, number> = {
  personal_brand: 6,
  b2b_outbound: 4,
  both: 10,
}

// GET: Fetch goals + weekly progress
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const user = auth.dbUser
  const mode = user.mode ?? 'personal_brand'
  const tz = user.timezone ?? 'America/Los_Angeles'

  // Auto-migrate: if goals are stale (fewer than expected), regenerate
  let goals = await getUserGoals(auth.sb, user.id)
  const expectedCount = EXPECTED_GOAL_COUNTS[mode] ?? 6
  if (goals.length < expectedCount && user.mode_set) {
    await createDefaultGoals(auth.sb, user.id, mode)
    goals = await getUserGoals(auth.sb, user.id)
  }

  const [progress, followerDelta, pipeline] = await Promise.all([
    getWeeklyProgress(auth.sb, user.id, tz),
    getFollowerDelta(auth.sb, user.id),
    getPipelineFunnel(auth.sb, user.id, tz),
  ])

  return NextResponse.json({
    success: true,
    data: {
      goals,
      progress,
      followerDelta,
      pipeline,
      mode: user.mode ?? 'personal_brand',
    },
  })
}

// POST: Update a goal's target value
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Handle metric snapshot (LinkedIn connections etc.)
  if (body.metric_snapshot) {
    const { metric, value, snapshot_date } = body.metric_snapshot as { metric: string; value: number; snapshot_date: string }
    if (!metric || typeof value !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid metric snapshot' }, { status: 400 })
    }
    await auth.sb.from('metrics_snapshots').upsert(
      { user_id: auth.dbUser.id, metric, value, snapshot_date: snapshot_date || new Date().toISOString().slice(0, 10) },
      { onConflict: 'user_id,metric,snapshot_date' }
    )
    return NextResponse.json({ success: true })
  }

  const { goal_id, target_value } = body as { goal_id: string; target_value: number }

  if (!goal_id || typeof target_value !== 'number' || target_value < 0) {
    return NextResponse.json({ success: false, error: 'Invalid goal_id or target_value' }, { status: 400 })
  }

  await updateGoalTarget(auth.sb, goal_id, target_value)
  return NextResponse.json({ success: true })
}
