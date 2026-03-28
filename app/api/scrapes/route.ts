import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const user = auth.dbUser
  const sb = auth.sb

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
