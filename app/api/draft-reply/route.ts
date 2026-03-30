import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { callClaude, parseClaudeJson } from '@/lib/claude'
import { fetchBrainContext, brainContextToPrompt } from '@/lib/brain-context'
import { runPipeline, step } from '@/lib/pipeline'
import { logPipelineRun } from '@/lib/feedback'

interface DraftReplyRequest {
  readonly tweet_text: string
  readonly author_name: string
  readonly author_handle: string
  readonly engage_id?: string
  readonly refine_instruction?: string
  readonly current_draft?: string
}

interface ReplyStrategy {
  readonly style: 'add-value' | 'agree-extend' | 'contrarian' | 'data-point' | 'question' | 'humor'
  readonly reasoning: string
  readonly keyPoint: string
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { tweet_text, author_name, author_handle, engage_id, refine_instruction, current_draft } =
    body as DraftReplyRequest

  if (!tweet_text) {
    return NextResponse.json({ error: 'No tweet text provided' }, { status: 400 })
  }

  // Refine mode — rewrite existing draft with user instruction
  if (refine_instruction && current_draft) {
    try {
      const { text } = await callClaude(
        `Rewrite this reply to a tweet by @${author_handle}.

ORIGINAL TWEET: "${tweet_text.substring(0, 500)}"

CURRENT DRAFT: "${current_draft}"

USER INSTRUCTION: "${refine_instruction}"

Rules:
- Apply the user's instruction to improve the draft
- Keep it 1-2 sentences, under 200 characters
- Don't be sycophantic — no "love this", "so true"
- Sound like a human, not a bot
- Output ONLY the revised reply text, nothing else`,
        { maxTokens: 150 }
      )
      return NextResponse.json({ reply: text.trim() })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Refine failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  try {
    const brainContext = await fetchBrainContext(
      auth.sb,
      auth.dbUser.id,
      'x_reply',
      auth.dbUser.icp_config?.titles ?? []
    )

    const brainPrompt = brainContextToPrompt(brainContext)

    const replyPipeline = [
      // Step 1: Strategize — pick the best reply style for this tweet
      step('strategize', async () => {
        const { text } = await callClaude(
          `You are an X engagement strategist. Pick the best reply approach.

${brainPrompt}

TWEET by @${author_handle} (${author_name}):
"${tweet_text.substring(0, 500)}"

Pick the best reply style and output JSON:
{
  "style": "add-value" | "agree-extend" | "contrarian" | "data-point" | "question" | "humor",
  "reasoning": "why this style for this tweet",
  "keyPoint": "the specific thing to say"
}

Rules:
- add-value is the safest default — share related experience or data
- contrarian only if you have a genuine counter-point
- humor only if the tweet's tone invites it
- If brain data shows which reply styles get engagement, factor that in
- Output ONLY the JSON`,
          { maxTokens: 200 }
        )
        return parseClaudeJson<ReplyStrategy>(text)
      }),

      // Step 2: Draft — write the actual reply
      step('draft', async (input) => {
        const strategy = input.previous.strategize as ReplyStrategy

        const { text } = await callClaude(
          `Write a reply to this tweet by @${author_handle} (${author_name}):

"${tweet_text.substring(0, 500)}"

REPLY STYLE: ${strategy.style}
KEY POINT TO MAKE: ${strategy.keyPoint}

═══ RULES FOR HUMAN-SOUNDING, HIGH-ENGAGEMENT REPLIES ═══

LENGTH & FORMAT:
- 1-2 sentences, under 200 characters
- Use contractions (you're, don't, it's) — never formal language
- Short punchy sentences. Mix lengths. Fragment sentences are fine.
- No emojis unless the original tweet uses them heavily

TONE — mirror the poster:
- Casual tweet → casual reply. Technical tweet → technical reply.
- Write like you're texting a smart friend, not writing a LinkedIn post
- Lowercase is fine. Perfect grammar is NOT required.

WHAT MAKES REPLIES GET ENGAGEMENT:
- Reference something SPECIFIC from their post (not generic praise)
- Add a concrete data point, personal experience, or contrarian angle
- Ask a sharp follow-up question that makes them want to respond
- Share a short "I tried X and found Y" story if relevant
- Disagree respectfully if you have a real counter-point

NEVER DO THESE (instant AI detection):
- Start with "Great insight!", "This is so true!", "Love this!", "Absolutely!"
- Generic agreement without adding anything new
- Overly polished/formal sentences
- Use words: "resonate", "leverage", "insightful", "spot on", "couldn't agree more"
- Long paragraphs — keep it tight
- Pitch yourself or your product

GOOD REPLY PATTERNS:
- "We saw the same thing at [context] — [specific detail]"
- "[Contrarian take]. Here's why: [one line reason]"
- "Curious — [sharp question about their experience]?"
- "[Related data point]. Wonder if that holds for [their context]"
- "[Short personal story that adds to the conversation]"

Output ONLY the reply text, nothing else.`,
          { maxTokens: 150 }
        )
        return text.trim()
      }),

      // Step 3: Classify — tag reply style for brain learning
      step('classify', async (input) => {
        const reply = input.previous.draft as string
        const { text } = await callClaude(
          `Classify this X/Twitter reply. Output ONLY a JSON object.

Reply: "${reply}"

Classify:
- reply_style: "add-value" | "agree-extend" | "contrarian" | "data-point" | "question" | "humor"
- reply_length: "short" (under 100 chars) | "medium" (100-200)

Output format: {"reply_style":"...","reply_length":"..."}`,
          { maxTokens: 80 }
        )
        return parseClaudeJson<Record<string, string>>(text)
      }),
    ]

    const result = await runPipeline(
      'x_reply',
      replyPipeline,
      { tweet_text, author_name, author_handle },
      brainContext
    )

    const strategy = result.steps[0]?.output as ReplyStrategy
    const reply = result.steps[1]?.output as string
    const tags = result.steps[2]?.output as Record<string, string>

    // Save draft to sb_x_engage if engage_id provided
    if (engage_id) {
      await auth.sb
        .from('sb_x_engage')
        .update({ draft_reply: reply, status: 'drafted' })
        .eq('id', engage_id)

      // Save classification tags (fire and forget)
      void auth.sb
        .from('sb_content_tags')
        .insert({
          user_id: auth.dbUser.id,
          platform: 'x',
          content_type: 'reply',
          reference_id: engage_id,
          tags,
        })
    }

    // Log pipeline run (fire and forget)
    logPipelineRun(auth.sb, auth.dbUser.id, result).catch(() => {})

    return NextResponse.json({
      reply,
      strategy: {
        style: strategy.style,
        reasoning: strategy.reasoning,
      },
      tags,
      pipeline: {
        stepsCompleted: result.steps.map((s) => s.stepName),
        totalDurationMs: result.totalDurationMs,
        brainContextUsed: result.brainContextUsed,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Draft reply failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
