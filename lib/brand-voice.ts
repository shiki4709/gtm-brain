// Brand Voice — extracts and stores the user's writing voice from their content
// Used by all content pipelines to match the user's authentic tone
//
// Two modes:
// 1. extractVoice() — analyze URLs/text to build a voice profile (one-time or periodic)
// 2. getVoicePrompt() — fetch stored voice profile and format for prompt injection

import { SupabaseClient } from '@supabase/supabase-js'
import { callClaude } from './claude'

export interface VoiceProfile {
  readonly tone: string // e.g. "casual-direct, confident, no-BS"
  readonly formality: string // e.g. "professional-casual"
  readonly sentenceStyle: string // e.g. "short punchy sentences, lots of line breaks"
  readonly vocabulary: string // e.g. "plain language, no jargon, occasional profanity"
  readonly hooks: string // e.g. "starts with bold claims or numbers"
  readonly avoid: string // e.g. "corporate buzzwords, emojis, exclamation marks"
  readonly samplePhrases: readonly string[] // 3-5 representative phrases
  readonly analyzedAt: string
}

// Extract voice profile from content samples
export async function extractVoice(
  contentSamples: readonly string[]
): Promise<VoiceProfile> {
  const combined = contentSamples
    .map((s, i) => `[SAMPLE ${i + 1}]\n${s.substring(0, 1500)}`)
    .join('\n\n')

  const { text } = await callClaude(
    `You are a brand voice analyst. Analyze these content samples and extract the author's writing voice.

${combined}

Output a JSON object with these fields:
{
  "tone": "2-5 word description (e.g. 'casual-direct, confident, practitioner')",
  "formality": "where on the spectrum: casual / professional-casual / professional / formal",
  "sentenceStyle": "sentence length, paragraph style, structure patterns",
  "vocabulary": "reading level, jargon usage, distinctive word choices",
  "hooks": "how they typically open posts/messages",
  "avoid": "patterns, words, or styles they clearly avoid",
  "samplePhrases": ["3-5 representative phrases that capture their voice exactly"]
}

Rules:
- Be specific and actionable — another writer should be able to match this voice
- Look for consistency across samples, not outliers
- Note if the voice shifts between platforms (casual on X, more polished on LinkedIn)
- Output ONLY the JSON`,
    { model: 'claude-sonnet-4-6', maxTokens: 600 }
  )

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const parsed = JSON.parse(cleaned) as Omit<VoiceProfile, 'analyzedAt'>

  return {
    ...parsed,
    analyzedAt: new Date().toISOString(),
  }
}

// Save voice profile to user record
export async function saveVoiceProfile(
  sb: SupabaseClient,
  userId: string,
  profile: VoiceProfile
): Promise<void> {
  await sb
    .from('sb_users')
    .update({ voice_profile: profile as unknown as Record<string, unknown> })
    .eq('id', userId)
}

// Fetch stored voice profile for a user
export async function getVoiceProfile(
  sb: SupabaseClient,
  userId: string
): Promise<VoiceProfile | null> {
  const { data } = await sb
    .from('sb_users')
    .select('voice_profile')
    .eq('id', userId)
    .single()

  if (!data?.voice_profile) return null
  return data.voice_profile as unknown as VoiceProfile
}

// Convert voice profile to a prompt string for injection into any pipeline
export function voiceToPrompt(profile: VoiceProfile | null): string {
  if (!profile) {
    return 'No brand voice profile yet. Use general best practices: casual, direct, no corporate speak.'
  }

  // Description-based profile (new, simpler)
  const profileData = profile as unknown as Record<string, unknown>
  const desc = profileData.description as string | undefined
  const persona = profileData.persona as string | undefined
  if (desc || persona) {
    const parts: string[] = []
    if (persona) parts.push(`WHO YOU ARE: ${persona}`)
    if (desc) parts.push(`YOUR VOICE: ${desc}`)
    if (profile.avoid) parts.push(`NEVER: ${profile.avoid}`)
    parts.push('IMPORTANT: Write as this specific person. The reader should be able to tell WHO wrote this from the perspective and expertise shown.')
    return parts.join('\n')
  }

  // Legacy sample-based profile
  return `AUTHOR'S VOICE PROFILE:
- Tone: ${profile.tone}
- Formality: ${profile.formality}
- Sentence style: ${profile.sentenceStyle}
- Vocabulary: ${profile.vocabulary}
- How they open: ${profile.hooks}
- What to AVOID: ${profile.avoid}
- Sample phrases that capture their voice:
${profile.samplePhrases.map((p) => `  "${p}"`).join('\n')}

IMPORTANT: Match this voice exactly. The output should sound like the same person wrote it.`
}
