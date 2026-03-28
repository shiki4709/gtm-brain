import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  const { lead_id, name, headline, comment, post_title, instruction, current_draft } = body as {
    lead_id?: string
    name: string
    headline: string
    comment?: string
    post_title?: string
    instruction?: string
    current_draft?: string
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })
  }

  const firstName = name ? name.split(' ')[0] : ''
  let prompt: string

  if (instruction && current_draft) {
    prompt = `Here is a LinkedIn message draft:\n\n"${current_draft}"\n\nThe user wants you to: ${instruction}\n\nContext about the recipient:\n- Name: ${name}\n- Headline: ${headline}\n${comment ? `- They commented: "${comment}"` : `- They liked a post about: ${post_title}`}\n\nRewrite the message following the user's instruction. Keep it under 300 characters. Output only the message, nothing else.`
  } else {
    prompt = `Write a LinkedIn connection request to ${firstName}. Under 200 characters.

About them:
- Full name: ${name}
- Headline: ${headline}
- Post topic: ${post_title}
${comment ? `- Their comment: "${comment}"` : '- They liked the post (no comment)'}

TONE RULES — this is the most important part:
- Write like a real human texting a coworker, NOT like a sales robot
- Lowercase "i" is fine. Abbreviations are fine. Casual grammar is fine.
- Reference something SPECIFIC — their comment, their company, their role, or the post topic
- If they commented, react to what they actually said. Don't summarize it back to them. Respond like a human would.
- NO filler phrases: "would love to connect", "thought it'd be cool", "great to have you in my network"
- NO corporate speak: resonated, insightful, curious, fascinating, align, synergy, leverage, thrilled
- NO em dashes, NO exclamation marks, NO emojis
- NO questions
- NO pitching

REAL examples that get accepted (notice how casual and specific they are):
"hey ${firstName}, read your comment on that GTM post, you nailed it. similar world here."
"saw your take on the hiring piece, been thinking the same thing at our shop."
"we're both in the revenue ops trenches apparently. figured we should be connected."
"your comment on that post caught my eye, spot on about the process piece."
"noticed you're at ${comment ? 'the same stage' : 'a company doing interesting stuff'}. connecting."

Write ONE message. Make it feel like something a real person would actually type on their phone at 10pm. Short. Specific. No fluff. Output ONLY the message, nothing else.`
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
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json({ error: `Claude API error: ${resp.status}` }, { status: resp.status })
    }

    const result = await resp.json()
    const message: string = result.content?.[0]?.text ?? ''

    // Classify DM angle
    const angle = comment ? 'comment_reference' : 'title_based'

    // Save draft to lead if lead_id provided
    if (lead_id) {
      const sb = createServiceClient()
      await sb
        .from('sb_leads')
        .update({ dm_draft: message, dm_angle: angle, status: 'dm_drafted' })
        .eq('id', lead_id)
    }

    return NextResponse.json({ message, angle })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Draft failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
