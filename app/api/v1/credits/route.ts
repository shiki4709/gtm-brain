// GET /api/v1/credits — Check balance and recent transactions
// Dual auth: cookie (dashboard) or API key (developer)

import { NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'
import { authenticateApiKey } from '@/lib/api-auth'
import { getBalance } from '@/lib/credits'
import { corsOptions } from '@/lib/api-v1-handler'

export const OPTIONS = corsOptions

export async function GET(request: Request) {
  // Try API key auth first, then cookie auth
  let userId: string
  let sb: SupabaseClient

  const apiAuth = await authenticateApiKey(request)
  if (apiAuth) {
    userId = apiAuth.dbUser.id
    sb = apiAuth.sb
  } else {
    const cookieAuth = await getAuthUser()
    if (!cookieAuth) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    userId = cookieAuth.dbUser.id
    sb = cookieAuth.sb
  }

  const balance = await getBalance(sb, userId)

  const { data: transactions } = await sb
    .from('credit_transactions')
    .select('amount, type, api_endpoint, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    ok: true,
    data: {
      balance,
      transactions: transactions ?? [],
    },
  }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}
