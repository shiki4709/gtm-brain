import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  const { tweet_text, author_name, author_handle, engage_id } = body as {
    tweet_text: string
    author_name: string
    author_handle: string
    engage_id?: string
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })
  }

  if (!tweet_text) {
    return NextResponse.json({ error: 'No tweet text provided' }, { status: 400 })
  }

  const prompt = `Write a reply to this tweet by @${author_handle} (${author_name}):

"${tweet_text.substring(0, 500)}"

Rules:
- 1-2 sentences max, under 200 characters
- Add genuine value — share a related experience, data point, or perspective
- Don't just agree ("great point!") — add something new
- Don't be sycophantic — no "love this", "so true", "amazing insight"
- Don't pitch anything
- Sound like a thoughtful practitioner, not a bot
- Match the tone of the original tweet (casual if casual, technical if technical)
- Output ONLY the reply text, nothing else`

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
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json({ error: `Claude API error: ${resp.status}` }, { status: resp.status })
    }

    const result = await resp.json()
    const reply: string = result.content?.[0]?.text ?? ''

    // Save draft to sb_x_engage if engage_id provided
    if (engage_id) {
      const sb = createServiceClient()
      await sb
        .from('sb_x_engage')
        .update({ draft_reply: reply, status: 'drafted' })
        .eq('id', engage_id)
    }

    return NextResponse.json({ reply })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Draft reply failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
