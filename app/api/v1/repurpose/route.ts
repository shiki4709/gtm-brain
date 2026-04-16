// POST /api/v1/repurpose — Convert content across platforms
// 3 credits

import { withApiAuth, corsOptions } from '@/lib/api-v1-handler'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'
import { SYSTEM_PROMPTS, REPURPOSE_ANTI_AI_RULES } from '@/lib/repurpose-prompts'

interface RepurposeRequest {
  readonly source_text: string
  readonly source_platform?: 'x' | 'linkedin' | 'other'
  readonly target_formats: string[] // 'linkedin' | 'quote' | 'thread'
}

const VALID_FORMATS = new Set(['linkedin', 'quote', 'thread'])

export const OPTIONS = corsOptions

export const POST = withApiAuth('/api/v1/repurpose', 3, 'repurpose', async (request, { dbUser, sb }) => {
  const body = await request.json() as RepurposeRequest

  if (!body.source_text) {
    throw new Error('source_text is required')
  }
  if (!body.target_formats || body.target_formats.length === 0) {
    throw new Error('target_formats is required (e.g. ["linkedin", "quote", "thread"])')
  }

  const targetFormats = body.target_formats.filter(f => VALID_FORMATS.has(f))
  if (targetFormats.length === 0) {
    throw new Error('No valid target_formats. Use: linkedin, quote, thread')
  }

  const voiceProfile = await getVoiceProfile(sb, dbUser.id)
  const voiceNote = voiceProfile ? `\n${voiceToPrompt(voiceProfile)}` : ''

  const sourcePlatform = body.source_platform ?? 'other'
  const userPrompt = `Repurpose this ${sourcePlatform === 'x' ? 'tweet' : sourcePlatform === 'linkedin' ? 'LinkedIn post' : 'content'} into your own original content. Don't copy the original, extract the core insight and make it yours.${voiceNote}

SOURCE POST:
"${body.source_text.substring(0, 2000)}"

Generate content for: ${targetFormats.join(', ')}

For each format, output the content preceded by the format name in brackets. Put each format's content between its bracket tag.`

  const combinedSystem = targetFormats.map(f => `[${f}]\n${SYSTEM_PROMPTS[f] ?? REPURPOSE_ANTI_AI_RULES}`).join('\n\n')

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) throw new Error('AI service not configured')

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      system: combinedSystem,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!resp.ok) throw new Error('Content generation failed')

  const result = await resp.json()
  const raw: string = result.content?.[0]?.text ?? ''

  // Parse [format] sections
  const content: Record<string, string> = {}
  for (const f of targetFormats) {
    const regex = new RegExp(`\\[${f}\\]\\s*([\\s\\S]*?)(?=\\[(?:${targetFormats.join('|')})\\]|$)`, 'i')
    const match = raw.match(regex)
    content[f] = match ? match[1].trim() : ''
  }

  // Fallback: if parsing failed for single format, return raw
  if (targetFormats.every(f => !content[f]) && targetFormats.length === 1) {
    content[targetFormats[0]] = raw.trim()
  }

  return { content, formats_generated: targetFormats }
})
