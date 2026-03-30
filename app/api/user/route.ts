import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const user = auth.dbUser

  return NextResponse.json({ success: true, data: user })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { icp_titles, icp_exclude, track_keywords } = body as { icp_titles: string[]; icp_exclude: string[]; track_keywords?: string[] }

  if (!Array.isArray(icp_titles) || icp_titles.length === 0) {
    return NextResponse.json({ success: false, error: 'At least one ICP title is required' }, { status: 400 })
  }

  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const user = auth.dbUser
  const sb = auth.sb

  const icp_config = {
    titles: icp_titles.map(t => t.trim()).filter(Boolean),
    exclude: (icp_exclude ?? []).map((t: string) => t.trim()).filter(Boolean),
    track_keywords: (track_keywords ?? user.icp_config?.track_keywords ?? []).map((t: string) => t.trim().toLowerCase()).filter(Boolean),
  }

  const { data, error } = await sb
    .from('sb_users')
    .update({ icp_config })
    .eq('id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data })
}
