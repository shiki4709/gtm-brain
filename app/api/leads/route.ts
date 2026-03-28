import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') ?? 'icp' // icp | all | status
  const status = searchParams.get('status') ?? ''
  const source = searchParams.get('source') ?? 'outbound'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const user = auth.dbUser
  const sb = auth.sb

  let query = sb
    .from('sb_leads')
    .select('*, sb_scrapes(post_url, post_topic)', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('source_type', source)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filter === 'icp') {
    query = query.eq('icp_match', true)
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data, total: count })
}

// Update lead status (mark as sent, etc.)
export async function PATCH(request: Request) {
  const body = await request.json()
  const { lead_id, status, dm_sent_at } = body as {
    lead_id: string
    status: string
    dm_sent_at?: string
  }

  if (!lead_id || !status) {
    return NextResponse.json({ success: false, error: 'lead_id and status required' }, { status: 400 })
  }

  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const sb = auth.sb

  const updates: Record<string, unknown> = { status }
  if (dm_sent_at) updates.dm_sent_at = dm_sent_at

  const { data, error } = await sb
    .from('sb_leads')
    .update(updates)
    .eq('id', lead_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
