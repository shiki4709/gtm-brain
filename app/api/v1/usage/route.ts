// GET /api/v1/usage — Usage history with filtering (cookie auth only)

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const days = Math.min(parseInt(searchParams.get('days') ?? '30', 10), 90)
  const endpoint = searchParams.get('endpoint')
  const keyId = searchParams.get('key_id')

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  let query = auth.sb
    .from('credit_transactions')
    .select('amount, type, api_endpoint, api_key_id, metadata, created_at')
    .eq('user_id', auth.dbUser.id)
    .eq('type', 'usage')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200)

  if (endpoint) {
    query = query.eq('api_endpoint', endpoint)
  }
  if (keyId) {
    query = query.eq('api_key_id', keyId)
  }

  const { data: transactions } = await query

  // Aggregate by day for the chart
  const dailyUsage: Record<string, number> = {}
  for (const tx of transactions ?? []) {
    const day = (tx.created_at as string).substring(0, 10)
    dailyUsage[day] = (dailyUsage[day] ?? 0) + Math.abs(tx.amount as number)
  }

  // Aggregate by endpoint
  const endpointUsage: Record<string, number> = {}
  for (const tx of transactions ?? []) {
    const ep = (tx.api_endpoint as string) ?? 'unknown'
    endpointUsage[ep] = (endpointUsage[ep] ?? 0) + Math.abs(tx.amount as number)
  }

  return NextResponse.json({
    ok: true,
    data: {
      transactions: transactions ?? [],
      daily: dailyUsage,
      by_endpoint: endpointUsage,
      period_days: days,
    },
  })
}
