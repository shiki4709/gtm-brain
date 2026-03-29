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

Suggest 4 LinkedIn influencers and 3 X/Twitter accounts that these buyers follow.

CRITICAL RULES:
- ONLY suggest FAMOUS, widely-known people (50K+ followers). Think tier-1 influencers like Mark Roberge, Chris Walker, Kyle Poyar — NOT obscure people.
- You MUST be 100% certain the person exists and is known for what you describe. If you're not sure, pick someone more famous instead.
- Do NOT hallucinate or guess. Every person must be someone you'd bet money on being real and active.
- For LinkedIn: use their EXACT slug from linkedin.com/in/ (e.g. "kylepoyar" or "chris-walker-"). If unsure of the exact slug, use their most likely format.
- For X: use their EXACT handle (without @). Must be a real active account.
- Keep reasons SHORT (under 10 words)
- Include their real headline/title (under 15 words)
- Include approximate follower count as a number
- Output ONLY a JSON array, nothing else

Format: [{"platform":"linkedin","username":"kylepoyar","name":"Kyle Poyar","reason":"PLG and pricing strategy content","headline":"Partner at OpenView, growth advisor","followers":80000},{"platform":"x","username":"Patticus","name":"Patrick Campbell","reason":"SaaS pricing and metrics","headline":"Founder of ProfitWell, acquired by Paddle","followers":50000}]`

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
