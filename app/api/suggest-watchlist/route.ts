import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

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

Suggest 4 LinkedIn influencers and 3 X/Twitter accounts that these buyers follow. Real, well-known thought leaders whose audiences contain these buyer personas.

For LinkedIn: profile URL slug (after linkedin.com/in/)
For X: handle (without @)

Rules:
- Only REAL people with active accounts
- Content attracts the specified buyer titles
- Keep reasons SHORT (under 10 words)
- Include their headline (one-liner about them, under 15 words)
- Include approximate follower/connection count as a number
- Output ONLY a JSON array, nothing else

Format: [{"platform":"linkedin","username":"markroberge","name":"Mark Roberge","reason":"Sales leadership content","headline":"Former HubSpot CRO, Managing Director at Stage 2 Capital","followers":45000},{"platform":"x","username":"GergelyOrosz","name":"Gergely Orosz","reason":"Engineering leadership","headline":"Author of The Pragmatic Engineer newsletter","followers":120000}]`

  try {
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

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('Watchlist suggest API error:', resp.status, errText.slice(0, 200))
      return NextResponse.json({ success: true, suggestions: [] })
    }

    const result = await resp.json()
    const rawText: string = result.content?.[0]?.text ?? ''
    const text = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    try {
      const suggestions = JSON.parse(text)
      if (Array.isArray(suggestions)) {
        return NextResponse.json({ success: true, suggestions: suggestions.slice(0, 10) })
      }
      return NextResponse.json({ success: true, suggestions: [] })
    } catch {
      return NextResponse.json({ success: true, suggestions: [] })
    }
  } catch {
    return NextResponse.json({ success: true, suggestions: [] })
  }
}
