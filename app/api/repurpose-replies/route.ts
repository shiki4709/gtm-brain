import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Find user's recent replies that got engagement and suggest expanding them into posts/threads

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const user = auth.dbUser
  const xHandle = user.x_handle
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''

  if (!xHandle || !socialDataKey) {
    return NextResponse.json({ success: true, replies: [] })
  }

  // Fetch user's recent replies from X via SocialData
  try {
    const query = `from:${xHandle}`
    const resp = await fetch(
      `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(query)}&type=Latest`,
      {
        headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!resp.ok) {
      return NextResponse.json({ success: true, replies: [] })
    }

    const data = await resp.json()
    const TWITTER_EPOCH = 1288834974657

    // Filter to replies only (starts with @), then rank by engagement
    const replies = (data.tweets ?? [])
      .filter((tw: Record<string, unknown>) => {
        const text = (tw.full_text as string) ?? (tw.text as string) ?? ''
        // Must be a reply (starts with @ or has in_reply_to)
        return tw.in_reply_to_status_id_str || text.startsWith('@')
      })
      .map((tw: Record<string, unknown>) => {
        const text = (tw.full_text as string) ?? (tw.text as string) ?? ''
        const likes = (tw.favorite_count as number) ?? 0
        const rts = (tw.retweet_count as number) ?? 0
        const replies = (tw.reply_count as number) ?? 0
        const idStr = tw.id_str as string
        let time = ''
        if (idStr) {
          time = new Date((Number(BigInt(idStr) >> BigInt(22))) + TWITTER_EPOCH).toISOString()
        }

        // Strip leading @mention to get the actual reply content
        const cleanText = text.replace(/^@\w+\s*/g, '').trim()

        return {
          text: cleanText,
          fullText: text,
          url: `https://x.com/${xHandle}/status/${idStr}`,
          replyTo: tw.in_reply_to_screen_name ?? null,
          engagement: likes + rts + replies,
          likes,
          retweets: rts,
          replies,
          time,
        }
      })
      // Only replies with some engagement AND substantive text
      .filter((r: { engagement: number; text: string }) => r.engagement >= 3 && r.text.length >= 40)
      .sort((a: { engagement: number }, b: { engagement: number }) => b.engagement - a.engagement)
      .slice(0, 10)

    return NextResponse.json({ success: true, replies })
  } catch {
    return NextResponse.json({ success: true, replies: [] })
  }
}

// POST — expand a reply into a full post/thread
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { replyText: string; format: 'thread' | 'post' | 'quote' }
  const { replyText, format } = body

  if (!replyText) {
    return NextResponse.json({ success: false, error: 'Reply text required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return NextResponse.json({ success: false, error: 'API not configured' }, { status: 500 })

  const formatInstructions: Record<string, string> = {
    thread: `Expand into an X thread (4-6 tweets separated by ---).
Each tweet max 270 chars. Hook must grab attention. Each tweet earns its spot.
Use the reply's core insight as the backbone. Add examples, data, or steps.`,
    post: `Expand into a LinkedIn post (800-1300 chars).
Hook in first 2 lines (under 210 chars). Body: 3-4 short paragraphs.
Line break every 1-2 sentences. End with a question.`,
    quote: `Write a standalone X post (max 270 chars) that captures the essence of this reply as an original thought. No @ mentions.`,
  }

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
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: `This reply got good engagement. Expand it into original content.

ORIGINAL REPLY: "${replyText}"

${formatInstructions[format] ?? formatInstructions.thread}

RULES:
- Keep the original voice and insight
- Add depth: examples, numbers, or steps the reply hinted at
- Never use: delve, leverage, utilize, game-changer, groundbreaking
- Use contractions. Short sentences. Sound human.
- Output ONLY the content, nothing else.`,
        }],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 })
    }

    const result = await resp.json()
    const content = result.content?.[0]?.text?.trim() ?? ''

    return NextResponse.json({ success: true, content })
  } catch {
    return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 })
  }
}
