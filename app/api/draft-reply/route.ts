import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { callClaude } from '@/lib/claude'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'

interface DraftReplyRequest {
  readonly tweet_text: string
  readonly author_name: string
  readonly author_handle: string
  readonly engage_id?: string
  readonly refine_instruction?: string
  readonly current_draft?: string
  readonly likes?: number
  readonly retweets?: number
  readonly platform?: 'x' | 'linkedin'
  readonly author_followers?: number
}

// Platform-specific tone skills
const X_REPLY_SKILL = `REPLY STYLE FOR X:
- Tone: smart casual with an edge. The sharpest person at a dinner party.
- Length: 3-5 lines (50-120 words) is the sweet spot. Shortest version that delivers the insight.
- Structure options (pick the best one for this post):
  * REFRAME: flip the OP's frame to create a new angle
  * STACK: add 2-3 points the OP missed
  * PROOF: share a personal data point or result
  * QUESTION: ask something the OP can't ignore (triggers 150x algorithm boost)
  * ONE-LINER: under 15 words, devastatingly accurate
- Open with: "Underrated point:" / "Tested this." / "Genuine question:" / "The real issue is" / "Counterpoint:"
- NEVER open with: "Great post!" / "Love this!" / "So true!" / "Couldn't agree more!"
- Contrarian formula: Acknowledge + Pivot + Evidence. Use "and" not "but".
- Humor: dry observations, self-deprecating expertise. Never forced, never sarcastic.
- Mix: 30% agree+extend, 30% respectful disagree, 25% tangent to your expertise, 15% wit.
- NEVER question whether a widely-reported event actually happened. If the post describes news or a real event, treat it as fact and add your angle.
- NEVER reply with "did this actually happen?" or "is this verified?" when the post is clearly sharing news. Add insight, not skepticism.
- The test: does this make the reader think "I want to see what else this person posts"?`

const LINKEDIN_REPLY_SKILL = `COMMENT STYLE FOR LINKEDIN:
- Tone: professional-casual peer. A sharp colleague at a conference who knows something relevant.
- Length: 30-80 words is the sweet spot (2.5x+ algorithmic impact). Must be >15 words (algorithm threshold).
  First 140-150 characters are visible before truncation. Front-load the insight.
- Use the THREE-PART FORMULA:
  1. SPECIFIC ANCHOR: reference a specific thing from their post (proves you read it)
  2. VALUE ADD: personal experience/result, data point, reframe, or new angle
  3. OPEN LOOP: genuine question or mild tension that invites a reply
- Structure options:
  * AGREE + ADD: validate with personal data, then ask a follow-up
  * RESPECTFUL CHALLENGE: "I've seen something different—" with evidence (not "you're wrong")
  * FRAMEWORK EXTENSION: add a mental model that builds on their point
  * SPECIFIC QUESTION: about their process or data (highest OP reply rate)
  * BRIDGE: connect their topic to something adjacent and insightful
- Open with: "Your point about X is the part most miss—" / "We tested this." / "This, and—"
- NEVER open with: "Great post!" / "Love this!" / "As a [title], I believe..."
- AI-generated comments get 5x less engagement from OPs and 7x less from audiences. Sound human.
- The test: does this make the reader think "this person knows what they're talking about"?`

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
- NEVER question whether a news event or widely-shared story actually happened. Treat the post's claims as true and add your angle.
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
  const { tweet_text, author_name, author_handle, engage_id, refine_instruction, current_draft, likes, retweets, platform, author_followers } =
    body as DraftReplyRequest

  const isLinkedIn = platform === 'linkedin'
  const replySkill = isLinkedIn ? LINKEDIN_REPLY_SKILL : X_REPLY_SKILL
  const charLimit = isLinkedIn ? 600 : 280
  const authorSizeContext = author_followers
    ? (author_followers >= 100000 ? 'Large account (100K+) — be concise, standalone quality matters.'
      : author_followers >= 50000 ? 'Medium account (50K+) — be a peer, they often reply back.'
      : author_followers >= 10000 ? 'Growing account (10K+) — genuine engagement compounds.'
      : 'Smaller account — generous engagement builds relationships.')
    : ''

  if (!tweet_text) {
    return NextResponse.json({ error: 'No tweet text provided' }, { status: 400 })
  }

  // Build niche context from user's tracked topics
  const topics = auth.dbUser.icp_config?.track_keywords ?? []
  const nicheContext = topics.length > 0
    ? `You are engaging as someone knowledgeable about: ${topics.join(', ')}. Your replies should reflect this expertise.`
    : 'You are engaging authentically as a knowledgeable person in this space.'

  // Voice profile — full structured profile for accurate voice matching
  const voiceProfile = await getVoiceProfile(auth.sb, auth.dbUser.id)
  const voiceIntro = voiceProfile
    ? `\n${voiceToPrompt(voiceProfile)}`
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
      `Write a ${isLinkedIn ? 'LinkedIn comment' : 'reply to this tweet'}. ${nicheContext}${voiceIntro}

${isLinkedIn ? 'POST' : 'TWEET'} by @${author_handle} (${author_name}):
"${tweet_text.substring(0, 500)}"

${stats ? `Stats: ${stats}` : ''}${authorSizeContext ? `\n${authorSizeContext}` : ''}

${replySkill}

${ANTI_AI_RULES}
${isLinkedIn ? '- Keep it 20-60 words (2-4 sentences). Must be over 15 words.' : '- Keep it under 280 characters.'}

Output ONLY the ${isLinkedIn ? 'comment' : 'reply'} text. Nothing else.`,
      { maxTokens: isLinkedIn ? 300 : 200 }
    )

    const reply = enforceCharLimit(text.trim(), charLimit)

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
