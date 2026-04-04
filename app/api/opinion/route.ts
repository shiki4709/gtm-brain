import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// GET: Generate a question for a hot topic + optional explainer
// POST: Save user's take on a topic

export async function GET(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const topic = searchParams.get('topic') ?? ''
  const sampleText = searchParams.get('sample') ?? ''
  const explain = searchParams.get('explain') === 'true'
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''

  if (!topic || !apiKey) {
    return NextResponse.json({ success: false, error: 'Missing topic or API key' })
  }

  const prompt = explain
    ? `Explain this topic in exactly 2 sentences so someone unfamiliar can understand it and form an opinion. Be concrete, not abstract.

Topic: "${topic}"
Context: ${sampleText.slice(0, 300)}

Return ONLY a JSON object: {"explainer": "2 sentences explaining what happened and why it matters"}`
    : `Generate a specific, opinionated question about this topic that will elicit a strong opinion (not a yes/no answer). Also extract 3-5 specific keywords for later retrieval.

Topic: "${topic}"
Context: ${sampleText.slice(0, 300)}

Return ONLY a JSON object: {"question": "the specific question", "keywords": ["keyword1", "keyword2", "keyword3"]}`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) throw new Error('AI failed')

    const result = await resp.json()
    const raw = result.content?.[0]?.text ?? ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned)

    return NextResponse.json({ success: true, ...parsed })
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to generate question' })
  }
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { topic, opinion, question, keywords } = body as {
    topic: string
    opinion: string
    question: string
    keywords: string[]
  }

  if (!topic || !opinion) {
    return NextResponse.json({ success: false, error: 'Missing topic or opinion' }, { status: 400 })
  }

  await auth.sb.from('sb_insights').insert({
    user_id: auth.dbUser.id,
    insight_type: 'user_take',
    insight_data: { topic, opinion, question, keywords: keywords ?? [] },
    confidence: 1.0,
  })

  return NextResponse.json({ success: true })
}
