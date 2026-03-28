import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  const { scrape_id, post_url } = body as { scrape_id: string; post_url: string }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })
  }

  if (!scrape_id || !post_url) {
    return NextResponse.json({ error: 'scrape_id and post_url required' }, { status: 400 })
  }

  // Extract a rough title from the URL
  const urlTitle = extractTitleFromUrl(post_url)

  const prompt = `Given this LinkedIn post URL and title, extract a 1-3 word topic tag.
Examples: 'engineering hiring', 'product launches', 'sales playbook', 'remote work', 'GTM strategy', 'startup fundraising'.
URL: ${post_url}
Title hint: ${urlTitle}
Output only the topic tag, nothing else.`

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
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json({ error: `Claude API error: ${resp.status}` }, { status: resp.status })
    }

    const result = await resp.json()
    const topic: string = (result.content?.[0]?.text ?? '').trim().toLowerCase()

    // Save topic to scrape record
    const sb = createServiceClient()
    await sb
      .from('sb_scrapes')
      .update({ post_topic: topic })
      .eq('id', scrape_id)

    return NextResponse.json({ topic })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Topic extraction failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function extractTitleFromUrl(url: string): string {
  // LinkedIn post URLs: /posts/username_some-title-here-activity-123/
  const match = url.match(/\/posts\/[^_]+[_-](.+?)(?:-activity|-\d|$)/)
  if (match) {
    return match[1].replace(/-/g, ' ').substring(0, 100)
  }
  return ''
}
