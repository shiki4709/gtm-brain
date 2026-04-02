import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { callClaude, parseClaudeJson } from '@/lib/claude'
import { fetchBrainContext, brainContextToPrompt } from '@/lib/brain-context'
import { runPipeline, step } from '@/lib/pipeline'
import { logPipelineRun } from '@/lib/feedback'

interface DraftRequest {
  readonly lead_id?: string
  readonly name: string
  readonly headline: string
  readonly comment?: string
  readonly post_title?: string
  readonly instruction?: string
  readonly current_draft?: string
}

interface AngleChoice {
  readonly angle: 'comment_reference' | 'title_based' | 'generic'
  readonly reasoning: string
  readonly personalizationHook: string
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    lead_id,
    name,
    headline,
    comment,
    post_title,
    instruction,
    current_draft,
  } = body as DraftRequest

  // If user is refining an existing draft, skip the pipeline — just refine
  if (instruction && current_draft) {
    return handleRefinement({ name, headline, comment, post_title, instruction, current_draft })
  }

  const firstName = name ? name.split(' ')[0] : ''

  try {
    const brainContext = await fetchBrainContext(
      auth.sb,
      auth.dbUser.id,
      'dm_drafting',
      auth.dbUser.icp_config?.titles ?? []
    )

    const brainPrompt = brainContextToPrompt(brainContext)

    const dmPipeline = [
      // Step 1: Analyze — pick the best angle based on brain data + lead context
      step('analyze', async () => {
        const { text } = await callClaude(
          `You are a DM strategist. Pick the best approach for this LinkedIn message.

${brainPrompt}

LEAD CONTEXT:
- Name: ${name}
- Headline: ${headline}
- Post topic: ${post_title ?? 'unknown'}
${comment ? `- Their comment: "${comment}"` : '- They liked the post (no comment)'}

Pick the best DM angle and output JSON:
{
  "angle": "comment_reference" | "title_based" | "generic",
  "reasoning": "why this angle for this lead",
  "personalizationHook": "the specific thing to reference"
}

Rules:
- If they commented, almost always use comment_reference
- If brain data shows a particular angle has higher reply rate, factor that in
- personalizationHook should be a specific detail, not generic
- Output ONLY the JSON`,
          { maxTokens: 200 }
        )
        return parseClaudeJson<AngleChoice>(text)
      }),

      // Step 2: Draft — write the actual DM using chosen angle
      step('draft', async (input) => {
        const analysis = input.previous.analyze as AngleChoice

        const { text } = await callClaude(
          `Write a LinkedIn connection request to ${firstName}. Under 200 characters.

ANGLE: ${analysis.angle}
PERSONALIZATION HOOK: ${analysis.personalizationHook}

About them:
- Full name: ${name}
- Headline: ${headline}
- Post topic: ${post_title}
${comment ? `- Their comment: "${comment}"` : '- They liked the post (no comment)'}

TONE RULES — this is the most important part:
- Write like a real human texting a coworker, NOT like a sales robot
- Lowercase "i" is fine. Abbreviations are fine. Casual grammar is fine.
- Reference the personalization hook — don't just mention it, REACT to it
- If they commented, respond like a human would. Don't summarize it back to them.
- NO filler phrases: "would love to connect", "thought it'd be cool", "great to have you in my network"
- NO corporate speak: resonated, insightful, curious, fascinating, align, synergy, leverage, thrilled
- NO em dashes, NO exclamation marks, NO emojis
- NO questions
- NO pitching

REAL examples (notice how casual and specific):
"hey ${firstName}, read your comment on that GTM post, you nailed it. similar world here."
"saw your take on the hiring piece, been thinking the same thing at our shop."
"we're both in the revenue ops trenches apparently. figured we should be connected."

Write ONE message. Short. Specific. No fluff. Output ONLY the message.`,
          { maxTokens: 150 }
        )
        return text.trim()
      }),

      // Step 3: Classify — tag the DM for brain learning (runs in parallel conceptually)
      step('classify', async (input) => {
        const message = input.previous.draft as string
        const { text } = await callClaude(
          `Classify this LinkedIn DM. Output ONLY a JSON object.

DM: "${message}"

Classify:
- dm_tone: "casual" | "professional" | "direct"
- dm_length: "short" (under 100 chars) | "medium" (100-200) | "long" (200+)
- dm_personalization: "high" (references specific comment, role, or company) | "medium" (references post topic) | "low" (generic)

Output format: {"dm_tone":"...","dm_length":"...","dm_personalization":"..."}`,
          { maxTokens: 100 }
        )
        return parseClaudeJson<Record<string, string>>(text)
      }),
    ]

    const result = await runPipeline(
      'dm_drafting',
      dmPipeline,
      { name, headline, comment, post_title },
      brainContext
    )

    const analysis = result.steps[0]?.output as AngleChoice
    const message = result.steps[1]?.output as string
    const tags = result.steps[2]?.output as Record<string, string>

    // Save draft to lead if lead_id provided
    if (lead_id) {
      await auth.sb
        .from('sb_leads')
        .update({
          dm_draft: message,
          dm_angle: analysis.angle,
          status: 'dm_drafted',
        })
        .eq('id', lead_id)

      // Save classification tags (fire and forget)
      void auth.sb
        .from('sb_content_tags')
        .insert({
          user_id: auth.dbUser.id,
          platform: 'linkedin',
          content_type: 'dm',
          reference_id: lead_id,
          tags,
        })
    }

    // Log pipeline run (fire and forget)
    logPipelineRun(auth.sb, auth.dbUser.id, result).catch(() => {})

    return NextResponse.json({
      message,
      angle: analysis.angle,
      reasoning: analysis.reasoning,
      tags,
      pipeline: {
        stepsCompleted: result.steps.map((s) => s.stepName),
        totalDurationMs: result.totalDurationMs,
        brainContextUsed: result.brainContextUsed,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Draft failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Simple refinement — no pipeline needed, just one Claude call
async function handleRefinement(params: {
  readonly name: string
  readonly headline: string
  readonly comment?: string
  readonly post_title?: string
  readonly instruction: string
  readonly current_draft: string
}) {
  try {
    const { text } = await callClaude(
      `Here is a LinkedIn message draft:\n\n"${params.current_draft}"\n\nThe user wants you to: ${params.instruction}\n\nContext about the recipient:\n- Name: ${params.name}\n- Headline: ${params.headline}\n${params.comment ? `- They commented: "${params.comment}"` : `- They liked a post about: ${params.post_title}`}\n\nRewrite the message following the user's instruction. Keep it under 300 characters. Output only the message, nothing else.`,
      { maxTokens: 200 }
    )

    const angle = params.comment ? 'comment_reference' : 'title_based'
    return NextResponse.json({ message: text.trim(), angle })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Refinement failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
