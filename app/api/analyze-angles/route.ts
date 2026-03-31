import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Ported from Foxxi (foxxi/src/lib/content-engine.ts)
// Detects 4-8 content angles from any source text, each tagged with best platforms
const ANALYSIS_PROMPT = `You are a content strategist who breaks down articles into multiple repurposable content angles.

Types of angles:
- key_insight: A core takeaway or lesson (works on LinkedIn + X)
- story: A narrative or personal experience angle (works best on LinkedIn)
- data_point: Built around a specific number, stat, or metric (works on X + LinkedIn)
- framework: A mental model, system, or process (works on X threads)
- contrarian_take: Challenges a common belief (works on X + LinkedIn)
- how_to: Actionable advice or steps (works on X threads)
- quote: A single memorable insight as standalone post (works on X)

Find at least 3 angles, ideally 5-7. Each should be DIFFERENT ENOUGH to be its own standalone post.

Respond in this exact JSON format (no markdown, no code fences):
{
  "summary": "1-2 sentence summary",
  "angles": [
    {
      "id": "1",
      "type": "key_insight",
      "title": "Short title (max 10 words)",
      "summary": "2-3 sentences describing what this content piece would cover",
      "platforms": ["linkedin", "x"],
      "mentions": ["@PersonName"]
    }
  ]
}`

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { text, url } = body as { text?: string; url?: string }

  let sourceText = text ?? ''
  let sourceAuthor = ''

  // If URL provided, try fetching content
  if (url && !sourceText) {
    const isX = url.includes('x.com/') || url.includes('twitter.com/')
    if (isX) {
      const tweetIdMatch = url.match(/status\/(\d+)/)
      const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''
      if (tweetIdMatch && socialDataKey) {
        try {
          const resp = await fetch(
            `https://api.socialdata.tools/twitter/statuses/show?id=${tweetIdMatch[1]}`,
            {
              headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
              signal: AbortSignal.timeout(10000),
            }
          )
          if (resp.ok) {
            const data = await resp.json()
            sourceText = data.full_text ?? data.text ?? ''
            sourceAuthor = data.user?.screen_name ?? ''
          }
        } catch { /* */ }
      }
    }
  }

  if (!sourceText) {
    return NextResponse.json({
      success: false,
      error: 'paste_text',
      message: 'Could not fetch content from URL. Paste the text directly.',
    }, { status: 422 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 })

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        system: ANALYSIS_PROMPT,
        messages: [{
          role: 'user',
          content: `Analyze this content and find all repurposable angles:\n\n"${sourceText.substring(0, 5000)}"`,
        }],
      }),
    })

    if (!resp.ok) return NextResponse.json({ success: false, error: 'Analysis failed' }, { status: 500 })

    const result = await resp.json()
    const raw: string = result.content?.[0]?.text ?? ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned)

    return NextResponse.json({
      success: true,
      data: {
        ...parsed,
        sourceText: sourceText.substring(0, 500),
        sourceAuthor,
      },
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Analysis failed' }, { status: 500 })
  }
}
