import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getUserGoals, updateGoalTarget, getWeeklyProgress, getFollowerDelta, getPipelineFunnel } from '@/lib/goals'

// GET: Fetch goals + weekly progress
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const user = auth.dbUser
  const tz = user.timezone ?? 'America/Los_Angeles'

  const [goals, progress, followerDelta, pipeline] = await Promise.all([
    getUserGoals(auth.sb, user.id),
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
  const { goal_id, target_value } = body as { goal_id: string; target_value: number }

  if (!goal_id || typeof target_value !== 'number' || target_value < 0) {
    return NextResponse.json({ success: false, error: 'Invalid goal_id or target_value' }, { status: 400 })
  }

  await updateGoalTarget(auth.sb, goal_id, target_value)
  return NextResponse.json({ success: true })
}
