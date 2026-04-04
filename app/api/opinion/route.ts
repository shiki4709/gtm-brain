import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { buildUserProfile } from '@/lib/user-profile'

// GET: Generate batch of domain-specific questions from hot topics
// GET ?explain=true&topic=X: Explain a specific topic
// POST: Save user's take

export async function GET(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const explain = searchParams.get('explain') === 'true'
  const topicsParam = searchParams.get('topics') ?? ''
  const singleTopic = searchParams.get('topic') ?? ''
  const sampleText = searchParams.get('sample') ?? ''
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''

  if (!apiKey) return NextResponse.json({ success: false, error: 'API key not configured' })

  // Single topic explainer mode
  if (explain && singleTopic) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: `Explain this topic in exactly 2 sentences so someone unfamiliar can understand it and form an opinion. Be concrete, not abstract.

Topic: "${singleTopic}"
Context: ${sampleText.slice(0, 300)}

Return ONLY a JSON object: {"explainer": "2 sentences"}` }],
        }),
      })
      if (!resp.ok) throw new Error('AI failed')
      const result = await resp.json()
      const raw = result.content?.[0]?.text ?? ''
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      return NextResponse.json({ success: true, ...JSON.parse(cleaned) })
    } catch {
      return NextResponse.json({ success: false, error: 'Failed to explain topic' })
    }
  }

  // Batch question generation mode
  if (!topicsParam) return NextResponse.json({ success: false, error: 'Missing topics' })

  const user = auth.dbUser
  const profile = await buildUserProfile(
    auth.sb, user.id,
    user.icp_config ?? { titles: [], exclude: [] },
    user.mode ?? 'personal_brand',
  )

  // Check which topics user already has takes on
  const { data: existingTakes } = await auth.sb
    .from('sb_insights')
    .select('insight_data')
    .eq('user_id', user.id)
    .eq('insight_type', 'user_take')
    .order('generated_at', { ascending: false })
    .limit(50)

  const answeredTopics = new Set(
    (existingTakes ?? []).map(t => (t.insight_data as { topic?: string })?.topic?.toLowerCase()).filter(Boolean)
  )

  let topics: Array<{ topic: string; sample: string }>
  try {
    topics = JSON.parse(topicsParam)
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid topics JSON' })
  }

  // Filter out already-answered topics
  topics = topics.filter(t => !answeredTopics.has(t.topic.toLowerCase()))

  if (topics.length === 0) {
    return NextResponse.json({ success: true, questions: [] })
  }

  const topicList = topics.slice(0, 8).map((t, i) =>
    `[${i}] "${t.topic}" — context: ${t.sample.slice(0, 150)}`
  ).join('\n')

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: `You're helping a ${profile.interests.slice(0, 5).join(', ') || 'tech'} professional build their opinion bank for social media content. Pick the 4-5 most relevant hot topics from this list and generate specific, opinionated questions that their audience would care about.

USER'S DOMAIN: ${profile.interests.slice(0, 8).join(', ') || 'technology and startups'}
USER'S AUDIENCE: ${user.icp_config?.titles?.join(', ') || 'tech professionals'}

HOT TOPICS RIGHT NOW:
${topicList}

Return ONLY a JSON array of 4-5 questions (pick the most relevant, skip generic ones):
[{"topic": "exact topic name from list", "question": "short punchy question max 15 words", "keywords": ["3-5 retrieval keywords"]}]

Rules:
- MAX 15 WORDS per question. This is a chat, not an essay prompt
- Questions should force a stance. Good: "Is Delve's removal good or bad for YC?" Bad: "What are the implications..."
- Sound casual, like a coworker asking over coffee. No formal language
- No em dashes. No "or does it" clauses. Keep it simple
- Skip topics the user's audience wouldn't care about` }],
      }),
    })

    if (!resp.ok) throw new Error('AI failed')

    const result = await resp.json()
    const raw = result.content?.[0]?.text ?? ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const questions = JSON.parse(cleaned)

    return NextResponse.json({ success: true, questions })
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to generate questions' })
  }
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { takes } = body as {
    takes: Array<{ topic: string; opinion: string; question: string; keywords: string[] }>
  }

  if (!takes || takes.length === 0) {
    return NextResponse.json({ success: false, error: 'No takes provided' }, { status: 400 })
  }

  const rows = takes.map(t => ({
    user_id: auth.dbUser.id,
    insight_type: 'user_take' as const,
    insight_data: { topic: t.topic, opinion: t.opinion, question: t.question, keywords: t.keywords ?? [] },
    confidence: 1.0,
  }))

  await auth.sb.from('sb_insights').insert(rows)

  return NextResponse.json({ success: true, saved: rows.length })
}
