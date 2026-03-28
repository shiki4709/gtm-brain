import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { DEMO_EMAIL } from '@/lib/config'

export async function GET() {
  const sb = createServiceClient()

  const { data: user } = await sb
    .from('sb_users')
    .select('id')
    .eq('email', DEMO_EMAIL)
    .single()

  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  // Get counts per status for outbound leads
  const statuses = ['scraped', 'icp_filtered', 'dm_drafted', 'dm_sent', 'replied', 'converted']
  const counts: Record<string, number> = {}

  for (const status of statuses) {
    const { count } = await sb
      .from('sb_leads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source_type', 'outbound')
      .eq('status', status)

    counts[status] = count ?? 0
  }

  // Total scraped = sum of all statuses (everyone was scraped at some point)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  // ICP = everything except 'scraped' status (icp_filtered and beyond)
  const icp = total - counts.scraped

  return NextResponse.json({
    success: true,
    data: {
      scraped: total,
      icp,
      dm_drafted: counts.dm_drafted + counts.dm_sent + counts.replied + counts.converted,
      dm_sent: counts.dm_sent + counts.replied + counts.converted,
      replied: counts.replied + counts.converted,
      converted: counts.converted,
    },
  })
}
