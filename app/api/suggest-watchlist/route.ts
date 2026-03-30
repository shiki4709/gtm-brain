import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

const SUGGEST_RULES = `CRITICAL RULES:
- ONLY suggest FAMOUS, widely-known people (50K+ followers). Think tier-1 influencers — NOT obscure people.
- You MUST be 100% certain the person exists and is known for what you describe.
- Do NOT hallucinate or guess. Every person must be someone you'd bet money on being real and active.
- For LinkedIn: use their EXACT slug from linkedin.com/in/. If unsure, use their most likely format.
- For X: use their EXACT handle (without @). Must be a real active account.
- Keep reasons SHORT (under 10 words)
- Include their real headline/title (under 15 words)
- Include approximate follower count as a number
- Output ONLY a JSON array, nothing else

Format: [{"platform":"linkedin","username":"kylepoyar","name":"Kyle Poyar","reason":"PLG and pricing strategy content","headline":"Partner at OpenView, growth advisor","followers":80000},{"platform":"x","username":"Patticus","name":"Patrick Campbell","reason":"SaaS pricing and metrics","headline":"Founder of ProfitWell, acquired by Paddle","followers":50000}]`

async function callClaude(prompt: string): Promise<Array<Record<string, unknown>>> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return []

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!resp.ok) return []

  const result = await resp.json()
  const rawText: string = result.content?.[0]?.text ?? ''
  const text = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.slice(0, 10) : []
  } catch {
    return []
  }
}

// POST: chat-style query to find influencers
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const query = (body.query ?? '').trim()
  if (!query) return NextResponse.json({ success: true, suggestions: [] })

  const icpTitles: string[] = auth.dbUser.icp_config?.titles ?? []
  const icpContext = icpTitles.length > 0 ? `\nThe user's ICP targets these titles: ${icpTitles.join(', ')}` : ''

  const prompt = `A user is looking for influencers to follow. They said:

"${query}"
${icpContext}

Suggest 4 LinkedIn influencers and 3 X/Twitter accounts that match what they're looking for.

${SUGGEST_RULES}`

  const suggestions = await callClaude(prompt)
  return NextResponse.json({ success: true, suggestions })
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const icpTitles: string[] = auth.dbUser.icp_config?.titles ?? []
  if (icpTitles.length === 0) {
    return NextResponse.json({ success: true, suggestions: [] })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ success: true, suggestions: [] })
  }

  const prompt = `Given these target buyer titles: ${icpTitles.join(', ')}

Suggest 4 LinkedIn influencers and 3 X/Twitter accounts that these buyers follow.

${SUGGEST_RULES}`

  const suggestions = await callClaude(prompt)
  return NextResponse.json({ success: true, suggestions })
}
