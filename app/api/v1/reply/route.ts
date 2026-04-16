// POST /api/v1/reply — Generate smart, human-sounding replies
// 2 credits

import { withApiAuth, corsOptions } from '@/lib/api-v1-handler'
import { callClaude } from '@/lib/claude'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'
import { X_REPLY_SKILL, LINKEDIN_REPLY_SKILL, ANTI_AI_RULES, enforceCharLimit } from '@/lib/reply-prompts'

interface ReplyRequest {
  readonly post_text: string
  readonly author_name: string
  readonly author_handle?: string
  readonly platform?: 'x' | 'linkedin'
  readonly tone?: 'casual' | 'professional' | 'witty'
  readonly niche_topics?: string[]
}

export const OPTIONS = corsOptions

export const POST = withApiAuth('/api/v1/reply', 2, 'reply', async (request, { dbUser, sb }) => {
  const body = await request.json() as ReplyRequest

  if (!body.post_text) {
    throw new Error('post_text is required')
  }

  const isLinkedIn = body.platform === 'linkedin'
  const replySkill = isLinkedIn ? LINKEDIN_REPLY_SKILL : X_REPLY_SKILL
  const charLimit = isLinkedIn ? 600 : 280

  // Use caller's niche topics, or fall back to their stored ICP config
  const topics = body.niche_topics
    ?? (dbUser.icp_config as { track_keywords?: string[] } | null)?.track_keywords
    ?? []
  const nicheContext = topics.length > 0
    ? `You are engaging as someone knowledgeable about: ${topics.join(', ')}. Your replies should reflect this expertise.`
    : 'You are engaging authentically as a knowledgeable person in this space.'

  // Voice profile from the user's stored profile
  const voiceProfile = await getVoiceProfile(sb, dbUser.id)
  const voiceIntro = voiceProfile ? `\n${voiceToPrompt(voiceProfile)}` : ''

  const { text } = await callClaude(
    `Write a ${isLinkedIn ? 'LinkedIn comment' : 'reply to this tweet'}. ${nicheContext}${voiceIntro}

${isLinkedIn ? 'POST' : 'TWEET'} by @${body.author_handle ?? 'unknown'} (${body.author_name}):
"${body.post_text.substring(0, 500)}"

${replySkill}

${ANTI_AI_RULES}
${isLinkedIn ? '- Keep it 20-60 words (2-4 sentences). Must be over 15 words.' : '- Keep it under 280 characters.'}

Output ONLY the ${isLinkedIn ? 'comment' : 'reply'} text. Nothing else.`,
    { maxTokens: isLinkedIn ? 300 : 200 }
  )

  return {
    reply: enforceCharLimit(text.trim(), charLimit),
    platform: body.platform ?? 'x',
  }
})
