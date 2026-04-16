import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { buildFeedUrl, PLATFORM_CAPABILITIES } from '@/lib/content-ingest'

// GET: List all content sources for the user
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data: sources } = await auth.sb
    .from('sb_content_sources')
    .select('*, sb_content_items(count)')
    .eq('user_id', auth.dbUser.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    success: true,
    sources: sources ?? [],
    platforms: PLATFORM_CAPABILITIES,
  })
}

// POST: Add a new content source
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { platform, name, identifier, profileUrl, isOwnContent, autoRepurpose, targetPlatforms } = body as {
    platform: string
    name: string
    identifier: string   // subdomain, handle, or feed URL
    profileUrl?: string
    isOwnContent?: boolean
    autoRepurpose?: boolean
    targetPlatforms?: string[]
  }

  if (!platform || !name || !identifier) {
    return NextResponse.json({ success: false, error: 'platform, name, and identifier required' }, { status: 400 })
  }

  const capabilities = PLATFORM_CAPABILITIES[platform]
  if (!capabilities) {
    return NextResponse.json({ success: false, error: `Unsupported platform: ${platform}` }, { status: 400 })
  }

  // Build feed URL for RSS-capable platforms
  const feedUrl = capabilities.supportsRss
    ? (identifier.startsWith('http') && identifier.includes('/feed') ? identifier : buildFeedUrl(platform, identifier))
    : null

  const { data: source, error } = await auth.sb
    .from('sb_content_sources')
    .insert({
      user_id: auth.dbUser.id,
      platform,
      source_type: feedUrl ? 'rss' : 'manual',
      name,
      feed_url: feedUrl,
      profile_url: profileUrl ?? null,
      is_own_content: isOwnContent ?? true,
      auto_repurpose: autoRepurpose ?? false,
      target_platforms: targetPlatforms ?? capabilities.repurposeTo,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, source })
}

// DELETE: Remove a content source
export async function DELETE(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sourceId = searchParams.get('id')
  if (!sourceId) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

  // Cascade deletes content_items via FK
  await auth.sb
    .from('sb_content_sources')
    .delete()
    .eq('id', sourceId)
    .eq('user_id', auth.dbUser.id)

  return NextResponse.json({ success: true })
}
