import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'

const ANTI_AI_RULES = `STRICT RULES:
- NEVER use: delve, leverage, utilize, game-changer, unlock, cutting-edge, groundbreaking, remarkable, revolutionary, tapestry, illuminate, unveil, pivotal, intricate, hence, furthermore, moreover, realm, landscape, testament, harness, exciting, ever-evolving, foster, elevate, streamline, robust, seamless, synergy, holistic, paradigm, innovative, optimize, empower, curate, ecosystem, stakeholder, scalable, deep dive, double down, circle back, move the needle, craft, navigate, supercharge, boost, powerful, inquiries, stark, resonate, insightful
- NEVER use em dashes. Use commas or periods.
- NEVER use semicolons.
- DO use contractions (don't, can't, won't, I'd, we're)
- DO use sentence fragments. Vary sentence lengths.
- Sound like a real person typing fast, not a brand account.`

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
- 3-5 hashtags at the very end after a blank line.

${ANTI_AI_RULES}`

const X_QUOTE_PROMPT = `Write a quote tweet that adds your unique perspective.

FORMAT:
- Single tweet, max 270 characters
- This will be posted as a quote of the original tweet, so the reader sees both

PURPOSE:
- Add context the original poster missed
- Share a personal experience that validates or challenges their point
- Surface a non-obvious implication
- Make the reader think "oh I hadn't considered that"

DO NOT:
- Just summarize or agree with the original
- Start with "This." or "So much this." or "Great thread."
- Tag the original author
- Add hashtags

${ANTI_AI_RULES}

Output ONLY the quote tweet text. Nothing else.`

const X_THREAD_PROMPT = `Write an X/Twitter thread that gets bookmarked and reposted.

FORMAT:
- 4-6 tweets. Separate each tweet with --- on its own line.
- Each tweet max 270 characters. Each tweet must work standalone.

HOOK (Tweet 1):
- Quantified claim, curiosity gap, transformation, or contrarian take.
- End with a colon or "↓" to signal more.

BODY TWEETS:
- One insight per tweet. Short lines. Specific numbers.
- Use "you" not "people" — direct address.
- Each tweet should make the reader want to read the next one.

FINAL TWEET:
- Summarize the core takeaway in one sentence.
- End with a question or "Repost if this helped."

RULES:
- No links. Max 1 hashtag in hook only.
- This is YOUR knowledge sharing, not a reaction to someone else.
- Extract the topic/insight from the source post but write entirely in your voice.
- The reader should learn something specific and actionable.

${ANTI_AI_RULES}`

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { text, author, platform: sourcePlatform, platforms, format } = body as {
    text: string
    author: string
    platform: string
    platforms?: string[]
    format?: 'quote' | 'thread' | 'linkedin' | 'all'
  }

  if (!text) return NextResponse.json({ success: false, error: 'text required' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 })

  // Voice profile — full structured profile
  const voiceProfile = await getVoiceProfile(auth.sb, auth.dbUser.id)
  const voiceNote = voiceProfile
    ? `\n${voiceToPrompt(voiceProfile)}`
    : ''

  // Determine what to generate based on format param
  const targetFormats = format === 'all' || !format
    ? (platforms ?? ['linkedin', 'x'])  // legacy: generate for each platform
    : [format]

  const userPrompt = `Repurpose this ${sourcePlatform === 'x' ? 'tweet' : 'LinkedIn post'} by ${author} into your own original content. Don't copy the original, extract the core insight and make it yours.${voiceNote}

SOURCE POST:
"${text}"

Generate content for: ${targetFormats.join(', ')}

For each format, output the content preceded by the format name in brackets. Put each format's content between its bracket tag.`

  const systemPrompts: Record<string, string> = {
    linkedin: LINKEDIN_PROMPT,
    x: X_THREAD_PROMPT,  // legacy: default X = thread
    quote: X_QUOTE_PROMPT,
    thread: X_THREAD_PROMPT,
  }

  const combinedSystem = targetFormats.map(f => `[${f}]\n${systemPrompts[f] ?? ''}`).join('\n\n')

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

    // Parse [format] sections
    const content: Record<string, string> = {}
    for (const f of targetFormats) {
      const regex = new RegExp(`\\[${f}\\]\\s*([\\s\\S]*?)(?=\\[(?:${targetFormats.join('|')})\\]|$)`, 'i')
      const match = raw.match(regex)
      content[f] = match ? match[1].trim() : ''
    }

    // Fallback: if parsing failed, return raw
    if (targetFormats.every(f => !content[f])) {
      if (targetFormats.length === 1) {
        content[targetFormats[0]] = raw.trim()
      }
    }

    return NextResponse.json({ success: true, content })
  } catch {
    return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 })
  }
}
