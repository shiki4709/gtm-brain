import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Ported from Foxxi (foxxi/src/app/api/sources/route.ts)
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchUrlContent(url: string): Promise<{ text: string; author: string }> {
  const isX = url.includes('x.com/') || url.includes('twitter.com/')
  const isSubstack = url.includes('substack.com') || url.includes('.substack.')

  // X/Twitter — use SocialData API
  if (isX) {
    const tweetIdMatch = url.match(/status\/(\d+)/)
    const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''
    if (tweetIdMatch && socialDataKey) {
      const resp = await fetch(
        `https://api.socialdata.tools/twitter/statuses/show?id=${tweetIdMatch[1]}`,
        {
          headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        }
      )
      if (resp.ok) {
        const data = await resp.json()
        return { text: data.full_text ?? data.text ?? '', author: data.user?.screen_name ?? '' }
      }
    }
  }

  // Substack — try their API first for clean content
  if (isSubstack) {
    try {
      const slugMatch = url.match(/\/p\/([^/?#]+)/)
      const domainMatch = url.match(/https?:\/\/([^/]+)/)
      if (slugMatch && domainMatch) {
        const apiUrl = `https://${domainMatch[1]}/api/v1/posts/${slugMatch[1]}`
        const resp = await fetch(apiUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(10000),
        })
        if (resp.ok) {
          const post = await resp.json()
          if (post.body_html) {
            const text = htmlToText(post.body_html)
            if (text.length > 200) return { text: text.slice(0, 15000), author: post.publishedBylines?.[0]?.name ?? '' }
          }
        }
      }
    } catch { /* fall through to HTML fetch */ }
  }

  // Generic — fetch HTML and strip tags (works for most sites)
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const html = await resp.text()
  const text = htmlToText(html)
  return { text: text.slice(0, 15000), author: '' }
}

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

  // If URL provided, try fetching content (supports X, Substack, any website)
  if (url && !sourceText) {
    try {
      const fetched = await fetchUrlContent(url)
      sourceText = fetched.text
      sourceAuthor = fetched.author
    } catch { /* fall through to error */ }
  }

  if (!sourceText || sourceText.length < 50) {
    return NextResponse.json({
      success: false,
      error: 'paste_text',
      message: 'Could not fetch enough content from that URL. Paste the text directly.',
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
    if (!raw) return NextResponse.json({ success: false, error: 'Empty response from AI' }, { status: 502 })
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(cleaned) } catch { return NextResponse.json({ success: false, error: 'Failed to parse AI response' }, { status: 502 }) }

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
