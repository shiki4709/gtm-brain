import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

const LINKEDIN_PROMPT = `Write a LinkedIn post that stops the scroll and drives comments.

HOOK (first 2 lines):
- Line 1: Under 10 words. Bold statement, surprising data point, or vulnerable admission.
- Line 2: Create a curiosity gap that forces the "see more" click.

STRUCTURE:
- Hook (2 lines) → Personal story or observation (3-4 short paragraphs) → Key insight → End with a genuine question
- 800-1300 characters. Line break every 1-2 sentences.
- Use "I" perspective. Conversational tone.

RULES:
- No links in the post body. No corporate jargon.
- End with a question that invites long comments.
- 3-5 hashtags at the very end after a blank line.`

const X_PROMPT = `Write a Twitter/X thread that gets bookmarked and reposted.

FORMAT:
- 5-7 tweets. Separate each tweet with --- on its own line.
- Each tweet max 270 characters. Each tweet must work standalone.

HOOK (Tweet 1):
- Quantified claim, curiosity gap, transformation, or contrarian take.
- End with a colon or "Thread" to signal more.

BODY TWEETS:
- One insight per tweet. Short lines. Specific numbers.
- Use "you" not "people" — direct address.

FINAL TWEET:
- Ask a question or request repost.

RULES:
- No links. 1-2 hashtags in hook only. Max 2 mentions total.
- ASCII punctuation only. No em dashes.`

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { text, author, platform: sourcePlatform, platforms } = body as {
    text: string
    author: string
    platform: string
    platforms: string[]
  }

  if (!text) return NextResponse.json({ success: false, error: 'text required' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 })

  const targetPlatforms = platforms ?? ['linkedin', 'x']

  const userPrompt = `Repurpose this ${sourcePlatform === 'x' ? 'tweet' : 'LinkedIn post'} by ${author} into your own original content. Don't copy — extract the core insight and make it your own.

SOURCE POST:
"${text}"

Generate content for: ${targetPlatforms.join(', ')}

For each platform, output the content preceded by the platform name in brackets like [linkedin] and [x]. Put each platform's content between its bracket tag.`

  const systemPrompts: Record<string, string> = { linkedin: LINKEDIN_PROMPT, x: X_PROMPT }
  const combinedSystem = targetPlatforms.map(p => `[${p}]\n${systemPrompts[p] ?? ''}`).join('\n\n')

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
        max_tokens: 4000,
        system: combinedSystem,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 })
    }

    const result = await resp.json()
    const raw: string = result.content?.[0]?.text ?? ''

    // Parse [linkedin] and [x] sections
    const content: Record<string, string> = {}
    for (const p of targetPlatforms) {
      const regex = new RegExp(`\\[${p}\\]\\s*([\\s\\S]*?)(?=\\[(?:${targetPlatforms.join('|')})\\]|$)`, 'i')
      const match = raw.match(regex)
      content[p] = match ? match[1].trim() : ''
    }

    // Fallback: if parsing failed, just split by platform headers or return raw
    if (targetPlatforms.every(p => !content[p])) {
      if (targetPlatforms.length === 1) {
        content[targetPlatforms[0]] = raw.trim()
      }
    }

    return NextResponse.json({ success: true, content })
  } catch {
    return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 })
  }
}
