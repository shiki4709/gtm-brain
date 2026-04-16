// API Key management — uses cookie auth (web dashboard, not API key auth)
// GET: list keys, POST: create key, DELETE: revoke key

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { generateApiKey } from '@/lib/api-key'
import { initCredits } from '@/lib/credits'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: keys } = await auth.sb
    .from('api_keys')
    .select('id, key_prefix, name, permissions, created_at, last_used_at, revoked_at')
    .eq('user_id', auth.dbUser.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    ok: true,
    data: { keys: keys ?? [] },
  })
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { name?: string }
  const keyName = (body.name ?? 'Default').substring(0, 50)

  // Limit to 5 active keys per user
  const { count } = await auth.sb
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.dbUser.id)
    .is('revoked_at', null)

  if ((count ?? 0) >= 5) {
    return NextResponse.json({
      ok: false,
      error: 'Maximum 5 active API keys. Revoke one before creating a new one.',
    }, { status: 400 })
  }

  const { fullKey, prefix, hash } = await generateApiKey()

  const { error } = await auth.sb.from('api_keys').insert({
    user_id: auth.dbUser.id,
    key_hash: hash,
    key_prefix: prefix,
    name: keyName,
  })

  if (error) {
    return NextResponse.json({ ok: false, error: 'Failed to create API key' }, { status: 500 })
  }

  // Initialize credits if this is the user's first key
  await initCredits(auth.sb, auth.dbUser.id)

  return NextResponse.json({
    ok: true,
    data: {
      key: fullKey,  // shown ONCE — never returned again
      prefix,
      name: keyName,
      note: 'Save this key now. It will not be shown again.',
    },
  })
}

export async function DELETE(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const keyId = searchParams.get('id')
  if (!keyId) {
    return NextResponse.json({ ok: false, error: 'id query param required' }, { status: 400 })
  }

  const { error } = await auth.sb
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('user_id', auth.dbUser.id)

  if (error) {
    return NextResponse.json({ ok: false, error: 'Failed to revoke key' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data: { revoked: keyId } })
}
