import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { callClaude } from '@/lib/claude'

interface DraftReplyRequest {
  readonly tweet_text: string
  readonly author_name: string
  readonly author_handle: string
  readonly engage_id?: string
  readonly refine_instruction?: string
  readonly current_draft?: string
  readonly likes?: number
  readonly retweets?: number
}

// Ported from Pingi (pingi-ai/bot/src/x-engage/drafter.ts)
// Battle-tested anti-AI rules that produce human-sounding replies
const ANTI_AI_RULES = `STRICT RULES:
- NEVER use: delve, embark, leverage, utilize, game-changer, unlock, cutting-edge, groundbreaking, remarkable, revolutionary, tapestry, illuminate, unveil, pivotal, intricate, hence, furthermore, moreover, realm, landscape, testament, harness, exciting, ever-evolving, foster, elevate, streamline, robust, seamless, synergy, holistic, paradigm, innovative, optimize, empower, curate, ecosystem, stakeholder, scalable, deep dive, double down, circle back, move the needle, craft, navigate, supercharge, boost, powerful, inquiries, stark, resonate, insightful, spot on
- NEVER use em dashes. Use commas or periods.
- NEVER use semicolons.
- NEVER start with "Great point!", "So true!", "This!", "Thanks for sharing!", "Love this!", "100%", "Couldn't agree more", "I'm excited to...", "Absolutely!", "Not just X, but also Y"
- NEVER just agree or praise. Add something the author didn't say.
- NEVER use "I'd love to...", "Let me know if you have any questions", "Happy to help", "Feel free to reach out"
- NEVER use lists or bullet points in a conversational reply
- NEVER use passive voice
- Maximum ONE exclamation mark total.
- No hashtags. No @mentions. No markdown.
- DO use contractions (don't, can't, won't, I'd, we're)
- DO use sentence fragments ("Works both ways though." "Totally.")
- DO vary sentence lengths. Short punchy sentences mixed with longer ones.
- DO be specific. Reference actual details from the tweet.
- Keep it under 280 characters.`

// Intelligent truncation at sentence boundaries (from Pingi)
function enforceCharLimit(draft: string, limit = 280): string {
  if (draft.length <= limit) return draft
  const cut = draft.slice(0, limit - 3)
  const lastPeriod = cut.lastIndexOf('.')
  if (lastPeriod > limit * 0.7) return cut.slice(0, lastPeriod + 1)
  return cut + '...'
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { tweet_text, author_name, author_handle, engage_id, refine_instruction, current_draft, likes, retweets } =
    body as DraftReplyRequest

  if (!tweet_text) {
    return NextResponse.json({ error: 'No tweet text provided' }, { status: 400 })
  }

  // Build niche context from user's tracked topics
  const topics = auth.dbUser.icp_config?.track_keywords ?? []
  const nicheContext = topics.length > 0
    ? `You are engaging as someone knowledgeable about: ${topics.join(', ')}. Your replies should reflect this expertise.`
    : 'You are engaging authentically as a knowledgeable person in this space.'

  // Voice profile support
  const voiceProfile = (auth.dbUser as Record<string, unknown>).voice_profile as { description?: string } | null
  const voiceIntro = voiceProfile?.description
    ? `\nIMPORTANT, match this writing voice: ${voiceProfile.description}`
    : ''

  // Refine mode — rewrite existing draft with user instruction
  if (refine_instruction && current_draft) {
    try {
      const { text } = await callClaude(
        `Rewrite this X/Twitter reply based on the user's instruction.

ORIGINAL TWEET:
"${tweet_text.substring(0, 500)}"

CURRENT DRAFT REPLY:
"${current_draft}"

USER'S EDIT INSTRUCTION:
"${refine_instruction}"

${ANTI_AI_RULES}

Return ONLY the rewritten reply. Nothing else. Keep under 280 characters.`,
        { maxTokens: 200 }
      )
      return NextResponse.json({ reply: enforceCharLimit(text.trim()) })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Refine failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // Draft mode — single clean prompt (ported from Pingi)
  try {
    const stats = [
      likes != null ? `${likes} likes` : null,
      retweets != null ? `${retweets} RTs` : null,
    ].filter(Boolean).join(', ')

    const { text } = await callClaude(
      `Write a reply to this tweet. ${nicheContext}${voiceIntro}

TWEET by @${author_handle} (${author_name}):
"${tweet_text.substring(0, 500)}"

${stats ? `Stats: ${stats}\n` : ''}Your reply MUST do one of these:
- Share a specific insight, data point, or experience related to the topic
- Ask a sharp follow-up question that deepens the discussion
- Offer a nuanced take the author didn't consider
- Connect their point to something adjacent and interesting

${ANTI_AI_RULES}

Output ONLY the reply text. Nothing else.`,
      { maxTokens: 200 }
    )

    const reply = enforceCharLimit(text.trim())

    // Save draft to sb_x_engage if engage_id provided
    if (engage_id) {
      await auth.sb
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
