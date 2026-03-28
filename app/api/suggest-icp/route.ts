import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  const problem = (body.problem ?? '').trim()

  if (!problem) {
    return NextResponse.json({ error: 'Problem description required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 400 })
  }

  const prompt = `Given this problem a company solves, suggest 8 job titles of the people who would buy this solution. These are the decision-makers or end-users who would be most interested.

Problem: "${problem}"

Rules:
- Return exactly 8 job titles
- Be specific (not "Manager" but "Head of L&D" or "VP Engineering")
- Think about who has the budget AND the pain
- Include a mix of decision-makers (VP, Director, Head of) and practitioners
- Output ONLY a JSON array of strings, nothing else

Example output: ["Head of L&D","VP People Operations","Chief Learning Officer","Director of Training","HR Business Partner","VP Talent Development","Head of People","Director of Organizational Development"]`

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
      return NextResponse.json({ titles: [] })
    }

    const result = await resp.json()
    const text: string = result.content?.[0]?.text ?? ''

    try {
      const titles = JSON.parse(text)
      if (Array.isArray(titles)) {
        return NextResponse.json({ titles: titles.slice(0, 8) })
      }
    } catch {
      // JSON parse failed
    }

    return NextResponse.json({ titles: [] })
  } catch {
    return NextResponse.json({ titles: [] })
  }
}
