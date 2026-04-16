// Rate limiting via Supabase RPC — no Redis needed at MVP scale

import { SupabaseClient } from '@supabase/supabase-js'

interface RateLimitResult {
  readonly allowed: boolean
  readonly retryAfter: number // seconds until window resets
}

export async function checkRateLimit(
  sb: SupabaseClient,
  apiKeyId: string
): Promise<RateLimitResult> {
  const { data, error } = await sb.rpc('check_rate_limit', {
    p_key_id: apiKeyId,
    p_minute_limit: 60,
    p_day_limit: 1000,
  })

  if (error) {
    console.error('Rate limit check failed:', error.message)
    // Fail open — don't block requests if rate limit check fails
    return { allowed: true, retryAfter: 0 }
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: row?.allowed ?? true,
    retryAfter: row?.retry_after ?? 0,
  }
}
