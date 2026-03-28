import { createServiceClient } from '@/lib/supabase'
import { DEMO_EMAIL } from '@/lib/config'
import { NextResponse } from 'next/server'

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

  // Fetch all scrapes with their leads
  const { data: scrapes, error } = await sb
    .from('sb_scrapes')
    .select('*, sb_leads(*)')
    .eq('user_id', user.id)
    .order('scrape_date', { ascending: false })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: scrapes })
}
