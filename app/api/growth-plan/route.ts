import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { generateGrowthPlan } from '@/lib/growth-advisor'
import { getFollowerDelta } from '@/lib/goals'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const user = auth.dbUser
  const mode = user.mode ?? 'personal_brand'

  // Get current follower counts
  const followerDelta = await getFollowerDelta(auth.sb, user.id)
  const xFollowers = followerDelta.current

  // LinkedIn connections not tracked yet — use null
  const liConnections = null

  const plan = generateGrowthPlan(xFollowers, liConnections, mode as 'personal_brand' | 'b2b_outbound' | 'both')

  return NextResponse.json({ success: true, data: plan })
}
