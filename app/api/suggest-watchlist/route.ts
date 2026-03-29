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

Suggest 6 LinkedIn influencers and 4 X/Twitter accounts that these buyers follow and engage with. These should be real, well-known thought leaders whose audiences contain these buyer personas.

For LinkedIn: provide the profile URL slug (the part after linkedin.com/in/)
For X: provide the handle (without @)

Rules:
- Only suggest REAL people with active accounts
- Pick people whose content attracts the specified buyer titles
- Mix of well-known and niche-but-relevant creators
- Output ONLY a JSON array of objects, nothing else

Format: [{"platform":"linkedin","username":"markroberge","name":"Mark Roberge","reason":"Former HubSpot CRO, posts about sales leadership"},{"platform":"x","username":"GergelyOrosz","name":"Gergely Orosz","reason":"Engineering leadership content"}]`

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
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('Watchlist suggest API error:', resp.status, errText.slice(0, 200))
      return NextResponse.json({ success: true, suggestions: [], debug: `api_error_${resp.status}` })
    }

    const result = await resp.json()
    const rawText: string = result.content?.[0]?.text ?? ''
    const text = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    try {
      const suggestions = JSON.parse(text)
      if (Array.isArray(suggestions)) {
        return NextResponse.json({ success: true, suggestions: suggestions.slice(0, 10) })
      }
      return NextResponse.json({ success: true, suggestions: [], debug: 'not_array' })
    } catch {
      return NextResponse.json({ success: true, suggestions: [], debug: 'parse_failed', raw: text.slice(0, 300) })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ success: true, suggestions: [], debug: 'catch', error: msg })
  }
}
