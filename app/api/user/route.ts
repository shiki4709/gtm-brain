import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { DEMO_EMAIL, DEMO_NAME } from '@/lib/config'

export async function GET() {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('sb_users')
    .select('*')
    .eq('email', DEMO_EMAIL)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { icp_titles, icp_exclude } = body as { icp_titles: string[]; icp_exclude: string[] }

  if (!Array.isArray(icp_titles) || icp_titles.length === 0) {
    return NextResponse.json({ success: false, error: 'At least one ICP title is required' }, { status: 400 })
  }

  const sb = createServiceClient()
  const icp_config = {
    titles: icp_titles.map(t => t.trim()).filter(Boolean),
    exclude: (icp_exclude ?? []).map((t: string) => t.trim()).filter(Boolean),
  }

  // Upsert: create user if doesn't exist, update if does
  const { data: existing } = await sb
    .from('sb_users')
    .select('id')
    .eq('email', DEMO_EMAIL)
    .single()

  if (existing) {
    const { data, error } = await sb
      .from('sb_users')
      .update({ icp_config })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, data })
  }

  const { data, error } = await sb
    .from('sb_users')
    .insert({ email: DEMO_EMAIL, name: DEMO_NAME, icp_config })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data })
}
