import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Cross-platform content repurposing
// Takes existing content and converts it to a different platform format

const FORMAT_PROMPTS: Record<string, string> = {
  x_thread: `Convert this into an X thread (4-6 tweets separated by ---).
Each tweet max 270 chars. Hook must grab attention in first tweet.
Use "you" voice, contractions, short sentences.
End with a question or bookmark ask.`,

  x_post: `Convert this into a single X post (max 270 chars).
Capture the core insight in one punchy statement.
Use contractions, sentence fragments. Sound human.`,

  x_quote: `Convert this into a quote tweet (max 270 chars).
One sharp take that reframes the idea. Contrarian or additive.
Under 200 chars is ideal.`,

  li_post: `Convert this into a LinkedIn post (800-1300 chars).
HOOK (first 2 lines, under 210 chars combined): bold number, vulnerable admission, or curiosity gap.
BODY: 3-4 short paragraphs. Line break every 1-2 sentences. "I" perspective.
END: Question that invites discussion.
3-5 hashtags at the very end after a blank line.`,

  li_carousel: `Convert this into a LinkedIn carousel outline (8-12 slides).
Slide 1: Bold hook (pattern interrupt + value promise).
Slides 2-10: One actionable insight per slide. Specific, concrete.
Last slide: CTA (follow, comment, repost).
Format as numbered list, one line per slide.`,
}

const FORMAT_LABELS: Record<string, string> = {
  x_thread: 'X Thread',
  x_post: 'X Post',
  x_quote: 'Quote Tweet',
  li_post: 'LinkedIn Post',
  li_carousel: 'LinkedIn Carousel',
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    content: string
    sourceFormat: string
    targetFormat: string
  }

  const { content, sourceFormat, targetFormat } = body

  if (!content || !targetFormat) {
    return NextResponse.json({ success: false, error: 'Content and target format required' }, { status: 400 })
  }

  if (!FORMAT_PROMPTS[targetFormat]) {
    return NextResponse.json({ success: false, error: `Invalid target format. Must be one of: ${Object.keys(FORMAT_PROMPTS).join(', ')}` }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return NextResponse.json({ success: false, error: 'API not configured' }, { status: 500 })

  const sourceLabel = FORMAT_LABELS[sourceFormat] ?? 'content'
  const targetLabel = FORMAT_LABELS[targetFormat] ?? targetFormat

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
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `You are repurposing content from ${sourceLabel} format to ${targetLabel} format.

ORIGINAL CONTENT:
"${content.substring(0, 2000)}"

${FORMAT_PROMPTS[targetFormat]}

RULES:
- Keep the core insight and voice
- Adapt structure and length for the target platform
- Never use: delve, leverage, utilize, game-changer, groundbreaking
- Use contractions. Sound human. Short punchy sentences.
- Output ONLY the repurposed content, nothing else.`,
        }],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 })
    }

    const result = await resp.json()
    const repurposed = result.content?.[0]?.text?.trim() ?? ''

    return NextResponse.json({ success: true, content: repurposed, format: targetFormat })
  } catch {
    return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 })
  }
}
