import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  const problem = (body.problem ?? '').trim()
  const mode = body.mode ?? 'suggest'
  const answers: string[] = body.answers ?? []

  if (!problem) {
    return NextResponse.json({ error: 'Problem description required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured', questions: [], titles: [] }, { status: 400 })
  }

  console.log('suggest-icp called:', { mode, problem: problem.slice(0, 50), hasKey: !!apiKey })

  // MODE 1: Generate clarifying questions
  if (mode === 'clarify') {
    const prompt = `A founder is setting up a GTM tool. They described their product as:

"${problem}"

Ask 3 short clarifying questions to understand WHO their buyer is. The goal is to figure out the right job titles to target.

Good questions help distinguish between different buyer personas. For example:
- "Are you selling to the person who uses the product, or the person who buys it?"
- "What size company is your ideal customer? (startup, mid-market, enterprise)"
- "Is your buyer in a technical role or a business role?"

Rules:
- Exactly 3 questions
- Each question should be one sentence, under 15 words
- Questions should help narrow down job titles, seniority, and department
- Don't ask about the product — ask about the BUYER
- Output ONLY a JSON array of 3 strings, nothing else`

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
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        console.error('Clarify API error:', resp.status, errText.slice(0, 200))
        return NextResponse.json({ questions: [] })
      }

      const result = await resp.json()
      const rawText: string = result.content?.[0]?.text ?? ''
      // Strip markdown code fences if present
      const text = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

      try {
        const questions = JSON.parse(text)
        if (Array.isArray(questions)) {
          return NextResponse.json({ questions: questions.slice(0, 3) })
        }
      } catch { /* parse failed */ }

      return NextResponse.json({ questions: [] })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown'
      return NextResponse.json({ questions: [], debug: 'catch', error: msg })
    }
  }

  // MODE 2: Generate ICP title suggestions based on problem + answers
  const answersContext = answers.length > 0
    ? `\n\nAdditional context from the founder:\n${answers.map((a, i) => `- ${a}`).join('\n')}`
    : ''

  const prompt = `A founder described their product as:

"${problem}"${answersContext}

Based on this, suggest 8 specific job titles of the people who would BUY this solution. These are decision-makers or budget-holders, not end-users (unless the end-user also buys).

Rules:
- Return exactly 8 job titles
- Be specific: "Head of L&D" not "Manager", "VP Revenue Operations" not "VP"
- Think about who has the BUDGET and the PAIN — not just who uses it
- Consider the company size and industry implied by the description
- Mix seniority levels: 3-4 senior (VP, Head of, Director), 3-4 mid-level
- Output ONLY a JSON array of 8 strings, nothing else`

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
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) return NextResponse.json({ titles: [] })

    const result = await resp.json()
    const rawText: string = result.content?.[0]?.text ?? ''
    const text = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    try {
      const titles = JSON.parse(text)
      if (Array.isArray(titles)) {
        return NextResponse.json({ titles: titles.slice(0, 8) })
      }
    } catch { /* parse failed */ }

    return NextResponse.json({ titles: [] })
  } catch {
    return NextResponse.json({ titles: [] })
  }
}
