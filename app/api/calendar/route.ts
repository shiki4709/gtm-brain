import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'

interface TrendingTopic {
  topic: string
  postCount: number
  totalEngagement: number
  authors: string[]
  userEngaged: boolean
  signalScore: number
  suggestedAngle: string
  samplePosts: Array<{ author: string; text: string; engagement: number }>
}

interface CalendarSlot {
  time: string
  platform: 'x' | 'linkedin'
  format: 'thread' | 'quote' | 'post' | 'carousel'
  topic: string
  angle: string
  draft: string
  signalEvidence: string
  authors: string[]
}

// Platform + time assignments from growth playbooks
const SCHEDULE_TEMPLATES: Record<string, Array<{ time: string; platform: 'x' | 'linkedin'; format: string }>> = {
  personal_brand: [
    { time: '8:00 AM', platform: 'x', format: 'thread' },
    { time: '12:00 PM', platform: 'x', format: 'quote' },
    { time: '5:00 PM', platform: 'linkedin', format: 'post' },
  ],
  b2b_outbound: [
    { time: '9:00 AM', platform: 'linkedin', format: 'post' },
    { time: '1:00 PM', platform: 'x', format: 'quote' },
  ],
  both: [
    { time: '8:00 AM', platform: 'x', format: 'thread' },
    { time: '12:00 PM', platform: 'linkedin', format: 'post' },
    { time: '7:00 PM', platform: 'x', format: 'quote' },
  ],
}

const FORMAT_PROMPTS: Record<string, string> = {
  thread: `Write an X thread (4-6 tweets separated by ---). Each max 270 chars. Hook first with curiosity gap. One insight per tweet. End with question or CTA.`,
  quote: `Write a quote tweet (max 270 chars). Add your unique perspective. Don't just agree. Add context, challenge, or connect to something non-obvious.`,
  post: `Write a LinkedIn post (800-1300 chars). Hook in first 2 lines (bold statement or data point). Personal story or observation. End with question. No links in body.`,
  carousel: `Write a LinkedIn carousel outline (8-12 slides). Slide 1: hook. Each slide: one insight. Last slide: CTA. Format as numbered list.`,
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { topics } = body as { topics: TrendingTopic[] }

  if (!topics || topics.length === 0) {
    return NextResponse.json({ success: false, error: 'No topics provided' }, { status: 400 })
  }

  const user = auth.dbUser
  const mode = (user.mode ?? 'personal_brand') as string
  const schedule = SCHEDULE_TEMPLATES[mode] ?? SCHEDULE_TEMPLATES.personal_brand

  // Voice profile
  const voiceProfile = await getVoiceProfile(auth.sb, user.id)
  const voiceNote = voiceProfile ? voiceToPrompt(voiceProfile) : ''

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 })

  // Generate a draft for each slot
  const slots: CalendarSlot[] = []

  for (let i = 0; i < schedule.length && i < topics.length; i++) {
    const slot = schedule[i]
    const topic = topics[i]

    const sampleContext = topic.samplePosts
      .map(p => `@${p.author}: "${p.text}"`)
      .join('\n')

    const formatPrompt = FORMAT_PROMPTS[slot.format] ?? FORMAT_PROMPTS.post

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 1500,
          system: `You are a content creator writing about: ${topic.topic}. ${voiceNote}\n\nNEVER use: delve, leverage, utilize, game-changer, groundbreaking, tapestry, realm, landscape. Use contractions. Sound human. No em dashes.`,
          messages: [{
            role: 'user',
            content: `Write content about "${topic.topic}" for ${slot.platform === 'linkedin' ? 'LinkedIn' : 'X/Twitter'}.\n\nContext from your feed (trending posts on this topic):\n${sampleContext}\n\nAngle: ${topic.suggestedAngle}\n\n${formatPrompt}\n\nOutput ONLY the content. Nothing else.`,
          }],
        }),
      })

      if (!resp.ok) continue

      const result = await resp.json()
      const draft = result.content?.[0]?.text?.trim() ?? ''

      const evidence = [
        `${topic.postCount} posts in your feed`,
        `${topic.totalEngagement.toLocaleString()} total engagement`,
        topic.userEngaged ? 'You replied to posts about this' : null,
      ].filter(Boolean).join(' · ')

      slots.push({
        time: slot.time,
        platform: slot.platform,
        format: slot.format as CalendarSlot['format'],
        topic: topic.topic,
        angle: topic.suggestedAngle,
        draft,
        signalEvidence: evidence,
        authors: topic.authors,
      })
    } catch { /* skip this slot */ }
  }

  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  return NextResponse.json({
    success: true,
    data: {
      date: new Date().toISOString().slice(0, 10),
      dayName,
      slots,
    },
  })
}
