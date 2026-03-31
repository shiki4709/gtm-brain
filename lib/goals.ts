import { SupabaseClient } from '@supabase/supabase-js'
import type { UserMode, GoalMetric, WeeklyProgress, FollowerDelta, UserGoal } from './types'

// Default goal presets per mode
const DEFAULT_GOALS: Record<'personal_brand' | 'b2b_outbound', Array<{ metric: GoalMetric; target: number }>> = {
  personal_brand: [
    { metric: 'reply', target: 10 },
  ],
  b2b_outbound: [
    { metric: 'dm_send', target: 5 },
    { metric: 'scrape', target: 3 },
  ],
}

// Get start of current week (Monday) in user's timezone
function weekStart(tz: string): string {
  // Get current date parts in the user's timezone
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const d = parts.find(p => p.type === 'day')!.value

  // Build a UTC date from the user's local date (avoids server TZ drift)
  const userToday = new Date(Date.UTC(+y, +m - 1, +d))
  const dow = userToday.getUTCDay()
  const diff = dow === 0 ? 6 : dow - 1 // Monday = 0
  userToday.setUTCDate(userToday.getUTCDate() - diff)
  return userToday.toISOString()
}

// Create default goals for a mode
export async function createDefaultGoals(
  sb: SupabaseClient,
  userId: string,
  mode: UserMode
): Promise<void> {
  const modes: Array<'personal_brand' | 'b2b_outbound'> =
    mode === 'both' ? ['personal_brand', 'b2b_outbound'] : [mode as 'personal_brand' | 'b2b_outbound']

  const rows = modes.flatMap(m =>
    DEFAULT_GOALS[m].map(g => ({
      user_id: userId,
      mode: m,
      metric: g.metric,
      target_value: g.target,
      period: 'weekly',
    }))
  )

  // Delete existing goals first, then insert fresh
  await sb.from('user_goals').delete().eq('user_id', userId)
  if (rows.length > 0) {
    await sb.from('user_goals').insert(rows)
  }
}

// Get user's goals
export async function getUserGoals(
  sb: SupabaseClient,
  userId: string
): Promise<UserGoal[]> {
  const { data } = await sb
    .from('user_goals')
    .select('*')
    .eq('user_id', userId)
    .order('mode')
    .order('metric')

  return data ?? []
}

// Update a single goal's target value
export async function updateGoalTarget(
  sb: SupabaseClient,
  goalId: string,
  targetValue: number
): Promise<void> {
  await sb
    .from('user_goals')
    .update({ target_value: targetValue, updated_at: new Date().toISOString() })
    .eq('id', goalId)
}

// Get weekly progress for all goals
export async function getWeeklyProgress(
  sb: SupabaseClient,
  userId: string,
  tz: string = 'America/Los_Angeles'
): Promise<WeeklyProgress[]> {
  const goals = await getUserGoals(sb, userId)
  if (goals.length === 0) return []

  const start = weekStart(tz)

  // Get action counts for this week
  const { data: actions } = await sb
    .from('action_log')
    .select('action_type')
    .eq('user_id', userId)
    .gte('created_at', start)

  const counts: Record<string, number> = {}
  for (const a of actions ?? []) {
    counts[a.action_type] = (counts[a.action_type] ?? 0) + 1
  }

  return goals.map(g => ({
    metric: g.metric,
    target: g.target_value,
    current: counts[g.metric] ?? 0,
    mode: g.mode as 'personal_brand' | 'b2b_outbound',
  }))
}

// Get follower delta (7-day)
export async function getFollowerDelta(
  sb: SupabaseClient,
  userId: string
): Promise<FollowerDelta> {
  const { data } = await sb
    .from('metrics_snapshots')
    .select('value, snapshot_date')
    .eq('user_id', userId)
    .eq('metric', 'x_followers')
    .order('snapshot_date', { ascending: false })
    .limit(8) // enough for 7 day lookback

  if (!data || data.length === 0) return { current: null, delta7d: null }

  const current = data[0].value
  const weekAgo = data.find(d => {
    const diff = Date.now() - new Date(d.snapshot_date).getTime()
    return diff >= 6 * 24 * 60 * 60 * 1000 // at least 6 days ago
  })

  return {
    current,
    delta7d: weekAgo ? current - weekAgo.value : null,
  }
}

// Log an action
export async function logAction(
  sb: SupabaseClient,
  userId: string,
  actionType: string,
  postId?: string,
  platform?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await sb.from('action_log').insert({
    user_id: userId,
    action_type: actionType,
    post_id: postId ?? null,
    platform: platform ?? null,
    metadata: metadata ?? {},
  })
}

// Get B2B pipeline funnel counts for this week
export async function getPipelineFunnel(
  sb: SupabaseClient,
  userId: string,
  tz: string = 'America/Los_Angeles'
): Promise<{ leads: number; dmsSent: number; replies: number }> {
  const start = weekStart(tz)

  const [leadsRes, dmsRes, repliesRes] = await Promise.all([
    sb.from('sb_leads').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('icp_match', true).gte('created_at', start),
    sb.from('action_log').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('action_type', 'dm_send').gte('created_at', start),
    sb.from('action_log').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('action_type', 'dm_reply_received').gte('created_at', start),
  ])

  return {
    leads: leadsRes.count ?? 0,
    dmsSent: dmsRes.count ?? 0,
    replies: repliesRes.count ?? 0,
  }
}

// Check if user is on pace (for progress bar color)
export function isOnPace(current: number, target: number): boolean {
  const now = new Date()
  const day = now.getDay()
  const daysElapsed = day === 0 ? 7 : day // Monday=1, Sunday=7
  const expectedPace = (daysElapsed / 7) * 0.8
  return target === 0 || (current / target) >= expectedPace
}
