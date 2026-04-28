import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { callClaude } from '@/lib/claude'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'
import { X_REPLY_SKILL, LINKEDIN_REPLY_SKILL, ANTI_AI_RULES, SPICY_MODIFIER, enforceCharLimit } from '@/lib/reply-prompts'
import { getProductContext, productContextToPrompt } from '@/lib/product-context'

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

  // Voice profile + product context — fetched in parallel
  const [voiceProfile, productContext] = await Promise.all([
    getVoiceProfile(auth.sb, auth.dbUser.id),
    getProductContext(auth.sb, auth.dbUser.id),
  ])
  const voiceIntro = voiceProfile
    ? `\n${voiceToPrompt(voiceProfile)}`
    : ''
  const productIntro = productContextToPrompt(productContext)
    ? `\n${productContextToPrompt(productContext)}`
    : ''

  // Learn from brain insights — fetch cached reply analysis
  let brainInsightsContext = ''
  try {
    const { data: insight } = await auth.sb
      .from('sb_insights')
      .select('insight_data')
      .eq('user_id', auth.dbUser.id)
      .eq('insight_type', 'reply_analysis')
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (insight?.insight_data) {
      const analysis = insight.insight_data as Record<string, string>
      // Randomly pick which insight to emphasize so replies vary in structure
      const parts: string[] = []
      if (analysis.avoid) parts.push(`AVOID: ${analysis.avoid}`)
      parts.push(`Vary your approach — sometimes agree and extend, sometimes challenge, sometimes ask a sharp question. NEVER prefix your reply with a label like "Reframe:", "Counterpoint:", "The real issue is".`)
      if (parts.length > 0) {
        brainInsightsContext = `\nBRAIN INSIGHTS (learned from your engagement data):\n${parts.join('\n')}`
      }
    }
  } catch { /* no cached analysis yet */ }

  // Fetch user's stated opinions on related topics
  let userTakesContext = ''
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: takes } = await auth.sb
      .from('sb_insights')
      .select('insight_data, generated_at')
      .eq('user_id', auth.dbUser.id)
      .eq('insight_type', 'user_take')
      .gte('generated_at', ninetyDaysAgo)
      .order('generated_at', { ascending: false })
      .limit(20)

    if (takes && takes.length > 0) {
      const tweetWords = new Set(
        tweet_text.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3)
      )
      const relevant = takes
        .filter(t => {
          const data = t.insight_data as { keywords?: string[] }
          return (data.keywords ?? []).some(k => tweetWords.has(k.toLowerCase()))
        })
        .slice(0, 2)

      if (relevant.length > 0) {
        userTakesContext = `\nYOUR REAL OPINIONS (use these — this is what you actually think):\n` +
          relevant.map(t => {
            const d = t.insight_data as { topic: string; opinion: string }
            return `- On "${d.topic}": "${d.opinion}"`
          }).join('\n')
      }
    }
  } catch { /* no takes yet */ }

  // Learn from top-performing replies — fetch user's best replies via SocialData
  let topRepliesContext = ''
  const xHandle = auth.dbUser.x_handle
  const socialDataKey = process.env.SOCIALDATA_API_KEY ?? ''
  if (xHandle && socialDataKey && !isLinkedIn) {
    try {
      const resp = await fetch(
        `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(`from:${xHandle}`)}&type=Latest`,
        {
          headers: { Authorization: `Bearer ${socialDataKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        }
      )
      if (resp.ok) {
        const data = await resp.json()
        const replies = (data.tweets ?? [])
          .filter((tw: Record<string, unknown>) => tw.in_reply_to_status_id_str)
          .map((tw: Record<string, unknown>) => ({
            text: ((tw.full_text ?? tw.text ?? '') as string).replace(/^@\w+\s*/g, '').trim(),
            likes: (tw.favorite_count as number) ?? 0,
          }))
          .filter((r: { text: string; likes: number }) => r.likes >= 3 && r.text.length >= 20)
          .sort((a: { likes: number }, b: { likes: number }) => b.likes - a.likes)
          .slice(0, 3)

        if (replies.length > 0) {
          topRepliesContext = `\nYOUR TOP-PERFORMING REPLIES (match this tone and style):
${replies.map((r: { text: string; likes: number }) => `- "${r.text}" (${r.likes} likes)`).join('\n')}
Write in the same voice, length, and approach as these successful replies.`
        }
      }
    } catch { /* skip — don't block reply generation */ }
  }

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

    // Check user's reply style preference
    const dbRow = auth.dbUser as Record<string, unknown>
    const replyStylePref = (dbRow.reply_style as string) ?? 'balanced'
    const spicyBlock = replyStylePref === 'spicy' ? `\n${SPICY_MODIFIER}\n` : ''

    const { text } = await callClaude(
      `Write a ${isLinkedIn ? 'LinkedIn comment' : 'reply to this tweet'}. ${nicheContext}${voiceIntro}${productIntro}${brainInsightsContext}${topRepliesContext}${userTakesContext}${spicyBlock}

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
