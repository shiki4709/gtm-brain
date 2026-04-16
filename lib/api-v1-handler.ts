// Wrapper for all /api/v1/* endpoints — handles auth, rate limiting, credits, CORS
// Each v1 route just defines the business logic and wraps it with withApiAuth()

import { NextResponse } from 'next/server'
import { authenticateApiKey, ApiAuthResult } from './api-auth'
import { checkRateLimit } from './rate-limit'
import { deductCredits, getBalance } from './credits'

type ApiV1Handler = (
  request: Request,
  context: ApiAuthResult
) => Promise<Record<string, unknown>>

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
}

// Shared OPTIONS handler for CORS preflight
export function corsOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export function withApiAuth(
  endpoint: string,
  creditCost: number,
  requiredPermission: string,
  handler: ApiV1Handler
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const startTime = Date.now()

    // 1. Authenticate API key
    const auth = await authenticateApiKey(request)
    if (!auth) {
      return jsonResponse({
        ok: false,
        error: { code: 'unauthorized', message: 'Invalid or missing API key. Use Authorization: Bearer nvr_live_xxx' },
      }, 401)
    }

    // 2. Check permission
    if (!auth.apiKey.permissions.includes(requiredPermission)) {
      return jsonResponse({
        ok: false,
        error: { code: 'forbidden', message: `This API key does not have the "${requiredPermission}" permission.` },
      }, 403)
    }

    // 3. Check rate limit
    const rateLimit = await checkRateLimit(auth.sb, auth.apiKey.id)
    if (!rateLimit.allowed) {
      return jsonResponse({
        ok: false,
        error: { code: 'rate_limited', message: 'Rate limit exceeded. Try again later.' },
      }, 429)
    }

    // 4. Deduct credits
    const deducted = await deductCredits(
      auth.sb, auth.dbUser.id, creditCost, endpoint, auth.apiKey.id
    )
    if (!deducted) {
      const balance = await getBalance(auth.sb, auth.dbUser.id)
      return jsonResponse({
        ok: false,
        error: {
          code: 'insufficient_credits',
          message: `This call costs ${creditCost} credits but you have ${balance}. Purchase more credits to continue.`,
        },
      }, 402)
    }

    // 5. Execute handler
    try {
      const data = await handler(request, auth)
      const remaining = await getBalance(auth.sb, auth.dbUser.id)

      // Log response time (fire-and-forget)
      const elapsed = Date.now() - startTime
      auth.sb.from('credit_transactions')
        .update({ metadata: { response_ms: elapsed, status: 200 } })
        .eq('user_id', auth.dbUser.id)
        .eq('api_endpoint', endpoint)
        .order('created_at', { ascending: false })
        .limit(1)
        .then(() => {})

      return jsonResponse({
        ok: true,
        data,
        credits: { used: creditCost, remaining },
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Internal error'
      return jsonResponse({
        ok: false,
        error: { code: 'internal_error', message },
      }, 500)
    }
  }
}
