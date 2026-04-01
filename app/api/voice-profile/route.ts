import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { extractVoice, saveVoiceProfile, getVoiceProfile } from '@/lib/brand-voice'

// GET — fetch existing voice profile
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getVoiceProfile(auth.sb, auth.dbUser.id)
  return NextResponse.json({ success: true, profile })
}

// POST — save voice profile (description-based or sample-based)
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { description, avoid, persona, samples } = body as {
    description?: string
    avoid?: string
    persona?: string
    samples?: string[]
  }

  // Mode 1: Direct description (preferred, no AI call needed)
  if (description) {
    const profile = {
      tone: description,
      formality: '',
      sentenceStyle: '',
      vocabulary: '',
      hooks: '',
      avoid: avoid ?? '',
      description,
      persona: persona ?? '', // WHO the user is (e.g., "AI startup COO building GTM tools")
      samplePhrases: [] as string[],
      analyzedAt: new Date().toISOString(),
    }

    await saveVoiceProfile(auth.sb, auth.dbUser.id, profile)

    return NextResponse.json({
      success: true,
      profile,
      message: 'Voice profile saved. All content will match this style.',
    })
  }

  // Mode 2: Extract from samples (legacy, still supported)
  if (!samples || samples.length < 3) {
    return NextResponse.json(
      { error: 'Provide a description or at least 3 content samples' },
      { status: 400 }
    )
  }

  try {
    const profile = await extractVoice(samples)
    await saveVoiceProfile(auth.sb, auth.dbUser.id, profile)

    return NextResponse.json({
      success: true,
      profile,
      message: `Voice profile extracted from ${samples.length} samples.`,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Voice extraction failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
