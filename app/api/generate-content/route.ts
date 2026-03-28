import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  const { source, platforms } = body as { source: string; platforms?: string[] }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })
  }

  if (!source) {
    return NextResponse.json({ error: 'No source material provided' }, { status: 400 })
  }

  const requestedPlatforms = platforms ?? ['linkedin', 'x']

  const platformInstructions: string[] = []
  if (requestedPlatforms.includes('linkedin')) {
    platformInstructions.push(`[LINKEDIN]
Write a LinkedIn post. 150-250 words. Start with a hook that stops the scroll.
Use short paragraphs (1-2 sentences each). Add line breaks between paragraphs.
End with a question or call-to-action. Max 3 hashtags at the end.
Tone: confident practitioner sharing a real insight, not a thought leader performing.
[/LINKEDIN]`)
  }
  if (requestedPlatforms.includes('x')) {
    platformInstructions.push(`[X_THREAD]
Write an X thread of 4-6 tweets. Each tweet under 270 characters.
Format: one tweet per line, separated by ---
First tweet is the hook — make it standalone-shareable.
Last tweet is a summary or CTA.
No hashtags. No emojis. No numbering (1/, 2/).
Tone: sharp, opinionated, concise.
[/X_THREAD]`)
  }

  const prompt = `You are a content strategist. Given this source material, create platform-native content.

SOURCE MATERIAL:
${source.substring(0, 3000)}

First, extract the core insight in one sentence. Output it inside [CORE_INSIGHT]...[/CORE_INSIGHT] tags.

Then create content for each platform:
${platformInstructions.join('\n\n')}

Rules:
- Don't invent statistics or quotes not in the source
- Don't use corporate buzzwords (synergy, leverage, disrupt, game-changer)
- Write like a real person who actually does this work, not a content marketer
- Each platform's content should feel native to that platform
- Output ONLY the tagged sections, nothing else`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json({ error: `Claude API error: ${resp.status}` }, { status: resp.status })
    }

    const result = await resp.json()
    const text: string = result.content?.[0]?.text ?? ''

    const coreMatch = text.match(/\[CORE_INSIGHT\]([\s\S]*?)\[\/CORE_INSIGHT\]/)
    const linkedinMatch = text.match(/\[LINKEDIN\]([\s\S]*?)\[\/LINKEDIN\]/)
    const xMatch = text.match(/\[X_THREAD\]([\s\S]*?)\[\/X_THREAD\]/)

    return NextResponse.json({
      coreInsight: coreMatch ? coreMatch[1].trim() : '',
      results: {
        linkedin: linkedinMatch ? linkedinMatch[1].trim() : '',
        x: xMatch ? xMatch[1].trim() : '',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Content generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
