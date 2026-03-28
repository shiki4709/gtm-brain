import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await auth.sb
    .from('sb_watchlist')
    .select('*')
    .eq('user_id', auth.dbUser.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { platform, username, display_name, profile_url } = body as {
    platform: string
    username: string
    display_name?: string
    profile_url?: string
  }

  if (!platform || !username) {
    return NextResponse.json({ success: false, error: 'platform and username required' }, { status: 400 })
  }

  const clean = username.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, '')

  const { data, error } = await auth.sb
    .from('sb_watchlist')
    .upsert({
      user_id: auth.dbUser.id,
      platform,
      username: clean,
      display_name: display_name ?? clean,
      profile_url: profile_url ?? (platform === 'linkedin' ? `https://www.linkedin.com/in/${clean}` : `https://x.com/${clean}`),
    }, { onConflict: 'user_id,platform,username' })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

  await auth.sb.from('sb_watchlist').delete().eq('id', id).eq('user_id', auth.dbUser.id)
  return NextResponse.json({ success: true })
}
