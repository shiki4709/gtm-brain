import { SupabaseClient } from '@supabase/supabase-js'
import type { UserMode, GoalMetric, WeeklyProgress, FollowerDelta, UserGoal } from './types'

// Default goal presets per mode
// Full goal set matching growth advisor recommendations
// period: 'daily' goals are stored as daily targets, 'weekly' as weekly
const DEFAULT_GOALS: Record<'personal_brand' | 'b2b_outbound', Array<{ metric: GoalMetric; target: number; period: string }>> = {
  personal_brand: [
    { metric: 'reply', target: 10, period: 'daily' },        // X replies to big accounts
    { metric: 'x_thread', target: 2, period: 'weekly' },     // X threads
    { metric: 'x_quote', target: 3, period: 'weekly' },      // Quote tweets
    { metric: 'li_comment', target: 10, period: 'daily' },   // LinkedIn comments
    { metric: 'li_post', target: 3, period: 'weekly' },      // LinkedIn posts
    { metric: 'li_carousel', target: 1, period: 'weekly' },  // LinkedIn carousels
  ],
  b2b_outbound: [
    { metric: 'dm_send', target: 5, period: 'weekly' },
    { metric: 'scrape', target: 3, period: 'weekly' },
    { metric: 'reply', target: 5, period: 'daily' },         // Replies for visibility
    { metric: 'li_comment', target: 10, period: 'daily' },   // LinkedIn comments for reach
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
  // Always create goals for both modes — mode just determines which is primary
  const modes: Array<'personal_brand' | 'b2b_outbound'> = ['personal_brand', 'b2b_outbound']

  const rows = modes.flatMap(m =>
    DEFAULT_GOALS[m].map(g => ({
      user_id: userId,
      mode: m,
      metric: g.metric,
      target_value: g.target,
      period: g.period,
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

  const weekStartDate = weekStart(tz)

  // Get today's start for daily goals
  const now = new Date()
  const todayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now)
  const todayStr = `${todayParts.find(p => p.type === 'year')!.value}-${todayParts.find(p => p.type === 'month')!.value}-${todayParts.find(p => p.type === 'day')!.value}T00:00:00Z`

  // Get action counts for this week (covers both daily and weekly)
  const { data: actions } = await sb
    .from('action_log')
    .select('action_type, created_at')
    .eq('user_id', userId)
    .gte('created_at', weekStartDate)

  // Count weekly and daily separately
  const weeklyCounts: Record<string, number> = {}
  const dailyCounts: Record<string, number> = {}
  for (const a of actions ?? []) {
    weeklyCounts[a.action_type] = (weeklyCounts[a.action_type] ?? 0) + 1
    if (a.created_at >= todayStr) {
      dailyCounts[a.action_type] = (dailyCounts[a.action_type] ?? 0) + 1
    }
  }

  return goals.map(g => ({
    metric: g.metric,
    target: g.target_value,
    current: g.period === 'daily' ? (dailyCounts[g.metric] ?? 0) : (weeklyCounts[g.metric] ?? 0),
    mode: g.mode as 'personal_brand' | 'b2b_outbound',
    period: g.period as 'daily' | 'weekly',
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
