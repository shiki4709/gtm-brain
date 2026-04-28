import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'
import { SYSTEM_PROMPTS } from '@/lib/repurpose-prompts'
import { fetchRelevantTakes, takesToPrompt } from '@/lib/brain-context'
import { getProductContext, productContextToPrompt } from '@/lib/product-context'

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

  // Voice profile + relevant takes + product context
  const [voiceProfile, relevantTakes, productContext] = await Promise.all([
    getVoiceProfile(auth.sb, auth.dbUser.id),
    fetchRelevantTakes(auth.sb, auth.dbUser.id, text),
    getProductContext(auth.sb, auth.dbUser.id),
  ])
  const voiceNote = voiceProfile ? `\n${voiceToPrompt(voiceProfile)}` : ''
  const takesNote = takesToPrompt(relevantTakes)
  const productNote = productContextToPrompt(productContext)
    ? `\n${productContextToPrompt(productContext)}`
    : ''

  // Determine what to generate based on format param
  const targetFormats = format === 'all' || !format
    ? (platforms ?? ['linkedin', 'x'])  // legacy: generate for each platform
    : [format]

  const userPrompt = `Repurpose this ${sourcePlatform === 'x' ? 'tweet' : 'LinkedIn post'} by ${author} into your own original content. Don't copy the original, extract the core insight and make it yours.${voiceNote}${productNote}${takesNote}

SOURCE POST:
"${text}"

Generate content for: ${targetFormats.join(', ')}

For each format, output the content preceded by the format name in brackets. Put each format's content between its bracket tag.`

  const combinedSystem = targetFormats.map(f => `[${f}]\n${SYSTEM_PROMPTS[f] ?? ''}`).join('\n\n')

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
