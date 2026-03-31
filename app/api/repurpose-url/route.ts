import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'

// Fetch post text from a URL (X or LinkedIn) then repurpose it
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { url, format } = body as { url: string; format?: 'quote' | 'thread' | 'linkedin' | 'all' }

  if (!url) return NextResponse.json({ success: false, error: 'url required' }, { status: 400 })

  // Detect platform from URL
  const isX = url.includes('x.com/') || url.includes('twitter.com/')
  const isLinkedIn = url.includes('linkedin.com/')
  const platform = isX ? 'x' : isLinkedIn ? 'linkedin' : 'unknown'

  // Fetch post content
  let postText = ''
  let author = ''

  if (isX) {
    // Extract tweet ID and fetch via SocialData
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
          postText = data.full_text ?? data.text ?? ''
          author = data.user?.screen_name ?? ''
        }
      } catch { /* */ }
    }
  }

  // Fallback: ask the user to paste the text if we can't fetch
  if (!postText) {
    return NextResponse.json({
      success: false,
      error: 'paste_text',
      message: 'Could not fetch post content. Paste the text directly.',
    }, { status: 422 })
  }

  // Now repurpose using the existing logic
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 })

  const voiceProfile = await getVoiceProfile(auth.sb, auth.dbUser.id)
  const voiceNote = voiceProfile ? `\n${voiceToPrompt(voiceProfile)}` : ''

  const ANTI_AI_RULES = `STRICT RULES:
- NEVER use: delve, leverage, utilize, game-changer, unlock, cutting-edge, groundbreaking, remarkable, revolutionary, tapestry, illuminate, unveil, pivotal, intricate, hence, furthermore, moreover, realm, landscape, testament, harness, exciting, ever-evolving, foster, elevate, streamline, robust, seamless, synergy, holistic, paradigm, innovative, optimize, empower, curate, ecosystem, stakeholder, scalable, deep dive, double down, circle back, move the needle, craft, navigate, supercharge, boost, powerful, inquiries, stark, resonate, insightful
- NEVER use em dashes. Use commas or periods.
- DO use contractions. Sentence fragments OK. Vary lengths.
- Sound like a real person, not a brand account.`

  const PROMPTS: Record<string, string> = {
    quote: `Write a quote tweet (max 270 chars) that adds your unique perspective. Don't just agree. Add context, challenge, or connect to something non-obvious.\n${ANTI_AI_RULES}`,
    thread: `Write an X thread (4-6 tweets separated by ---). Each tweet max 270 chars, standalone. Hook first, one insight per tweet, end with question.\n${ANTI_AI_RULES}`,
    linkedin: `Write a LinkedIn post (800-1300 chars). Hook in first 2 lines, personal story, key insight, end with question. No links in body.\n${ANTI_AI_RULES}`,
  }

  const targetFormats = format === 'all' || !format ? ['quote', 'thread', 'linkedin'] : [format]
  const combinedSystem = targetFormats.map(f => `[${f}]\n${PROMPTS[f] ?? ''}`).join('\n\n')

  const userPrompt = `Repurpose this ${platform} post by @${author} into your own original content. Extract the core insight and make it yours.${voiceNote}

SOURCE POST:
"${postText}"

Generate content for: ${targetFormats.join(', ')}
For each format, output the content preceded by the format name in brackets.`

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

    if (!resp.ok) return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 })

    const result = await resp.json()
    const raw: string = result.content?.[0]?.text ?? ''

    const content: Record<string, string> = {}
    for (const f of targetFormats) {
      const regex = new RegExp(`\\[${f}\\]\\s*([\\s\\S]*?)(?=\\[(?:${targetFormats.join('|')})\\]|$)`, 'i')
      const match = raw.match(regex)
      content[f] = match ? match[1].trim() : ''
    }

    if (targetFormats.every(f => !content[f]) && targetFormats.length === 1) {
      content[targetFormats[0]] = raw.trim()
    }

    return NextResponse.json({ success: true, content, author, platform, postText: postText.substring(0, 200) })
  } catch {
    return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 })
  }
}
