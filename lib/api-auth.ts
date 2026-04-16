// API key authentication — parallel to getAuthUser() but for developer API keys
// Cookie auth stays untouched for the web app; this handles Bearer token auth for /api/v1/*

import { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from './supabase'
import { hashApiKey } from './api-key'

interface ApiKeyRow {
  readonly id: string
  readonly user_id: string
  readonly key_prefix: string
  readonly name: string
  readonly permissions: string[]
  readonly created_at: string
  readonly last_used_at: string | null
  readonly revoked_at: string | null
}

interface DbUser {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly icp_config: { titles?: string[]; exclude?: string[] } | null
  readonly x_handle: string | null
  readonly voice_profile: Record<string, unknown> | null
  readonly [key: string]: unknown
}

export interface ApiAuthResult {
  readonly dbUser: DbUser
  readonly apiKey: ApiKeyRow
  readonly sb: SupabaseClient
}

export async function authenticateApiKey(request: Request): Promise<ApiAuthResult | null> {
  const authHeader = request.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer nvr_live_')) return null

  const fullKey = authHeader.slice(7) // strip "Bearer "
  const prefix = fullKey.substring(0, 12)
  const keyHash = await hashApiKey(fullKey)

  const sb = createServiceClient()

  // Lookup by prefix (indexed), verify hash
  const { data: keys, error } = await sb
    .from('api_keys')
    .select('*')
    .eq('key_prefix', prefix)
    .is('revoked_at', null)

  if (error || !keys || keys.length === 0) return null

  const matchedKey = keys.find((k: Record<string, unknown>) => k.key_hash === keyHash)
  if (!matchedKey) return null

  // Load the user
  const { data: user, error: userError } = await sb
    .from('sb_users')
    .select('*')
    .eq('id', matchedKey.user_id)
    .single()

  if (userError || !user) return null

  // Update last_used_at (fire-and-forget)
  sb.from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', matchedKey.id)
    .then(() => {})

  return { dbUser: user as DbUser, apiKey: matchedKey as ApiKeyRow, sb }
}
