import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// POST: Snapshot the user's X follower count via SocialData API
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { x_handle, linkedin_url } = body as { x_handle?: string; linkedin_url?: string }

  // Handle LinkedIn profile tracking
  if (linkedin_url) {
    const url = linkedin_url.trim()
    const apifyToken = process.env.APIFY_TOKEN ?? ''
    if (!apifyToken) return NextResponse.json({ success: false, error: 'Apify not configured' }, { status: 500 })

    try {
      const profileUrl = url.startsWith('http') ? url : `https://www.linkedin.com/in/${url}`
      const resp = await fetch(
        `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: [profileUrl], maxProfiles: 1 }),
          signal: AbortSignal.timeout(30000),
        }
      )
      if (!resp.ok) return NextResponse.json({ success: false, error: 'Failed to fetch LinkedIn profile' }, { status: 502 })

      const profiles = await resp.json() as Array<Record<string, unknown>>
      const profile = profiles[0]
      if (!profile) return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 })

      const connections = (profile.connectionsCount as number) ?? (profile.followerCount as number) ?? 0
      const today = new Date().toISOString().slice(0, 10)

      await auth.sb.from('metrics_snapshots').upsert(
        { user_id: auth.dbUser.id, metric: 'li_connections', value: connections, snapshot_date: today },
        { onConflict: 'user_id,metric,snapshot_date' }
      )

      // Save LinkedIn URL to user profile
      try {
        await auth.sb.from('sb_users').update({ linkedin_url: profileUrl } as Record<string, unknown>).eq('id', auth.dbUser.id)
      } catch { /* column may not exist */ }

      return NextResponse.json({ success: true, data: { connections, snapshot_date: today } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }

  const handle = x_handle?.replace(/^@/, '').trim()
  if (!handle) {
    return NextResponse.json({ success: false, error: 'x_handle or linkedin_url is required' }, { status: 400 })
  }

  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''
  if (!socialDataKey) {
    return NextResponse.json({ success: false, error: 'SocialData API key not configured' }, { status: 500 })
  }

  try {
    const resp = await fetch(
      `https://api.socialdata.tools/twitter/user/${encodeURIComponent(handle)}`,
      {
        headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!resp.ok) {
      return NextResponse.json({ success: false, error: `SocialData returned ${resp.status}` }, { status: 502 })
    }

    const data = await resp.json()
    const followers = data.followers_count ?? data.public_metrics?.followers_count

    if (typeof followers !== 'number') {
      return NextResponse.json({ success: false, error: 'Could not parse follower count' }, { status: 502 })
    }

    // Save to metrics_snapshots
    const today = new Date().toISOString().slice(0, 10)
    await auth.sb
      .from('metrics_snapshots')
      .upsert(
        {
          user_id: auth.dbUser.id,
          metric: 'x_followers',
          value: followers,
          snapshot_date: today,
        },
        { onConflict: 'user_id,metric,snapshot_date' }
      )

    // Also save handle to user profile if not already there (ignore if column doesn't exist yet)
    try {
      await auth.sb
        .from('sb_users')
        .update({ x_handle: handle } as Record<string, unknown>)
        .eq('id', auth.dbUser.id)
    } catch { /* column may not exist yet */ }

    return NextResponse.json({
      success: true,
      data: { handle, followers, snapshot_date: today },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// GET: Fetch latest follower snapshot
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data } = await auth.sb
    .from('metrics_snapshots')
    .select('value, snapshot_date')
    .eq('user_id', auth.dbUser.id)
    .eq('metric', 'x_followers')
    .order('snapshot_date', { ascending: false })
    .limit(8)

  return NextResponse.json({ success: true, data: data ?? [] })
}
