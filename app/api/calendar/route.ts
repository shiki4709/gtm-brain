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
  thread: `Write an X thread (7-10 tweets separated by ---). Each max 270 chars. 8-12 tweets perform 47% better than shorter threads.

HOOK (Tweet 1) — must do 3 things: pattern interrupt, qualify reader, promise value.
Use one of these hook formulas:
- Specific number: "I analyzed 500 [things]. Here's what the top 1% do:"
- Transformation: "6 months ago I had [bad state]. Today: [good state]. The playbook:"
- Contrarian: "Unpopular opinion: [common belief] is wrong. The math:"
- Steal-my-system: "My exact system for [outcome] (2 years to build, 5 min to read):"
- Mistake thread: "$50K in mistakes so you don't have to. 7 things I'd change:"

BODY TWEETS — each tweet must have:
1. One specific insight (number, named tool, concrete "do this not that")
2. A reason to read the next tweet (open loop, "but here's the catch", pivot)
Use "you" voice. Short punchy lines. Alternate insight tweets with story/data tweets.

FINAL TWEET — either:
- Question: "Which one hit hardest? Drop it below."
- Repost ask: "Bookmark this. Repost if your timeline needs it."

CURIOSITY LOOPS: Each tweet must close the previous hook and open a NEW one. Use: "But here's the catch...", "Most people stop here. Don't.", "The third one changed everything." The reader should never feel they can stop.

RHYTHM: Alternate short punchy tweets (1-2 lines) with longer explanatory ones (3-4 lines). Monotonous structure loses readers.

FORMAT: Use HYBRID — open with personal story/experience hook, transition to tactical insights, close with reflection + CTA. This captures both emotional engagement AND bookmarks.

NEVER write a generic opinion thread. Every body tweet needs a specific number, named example, or concrete instruction. If a tweet could be written by anyone, rewrite it with YOUR specific experience from the source posts.`,

  quote: `Write a quote tweet (max 270 chars). Add your unique perspective. Don't just agree.
Must do one of: add a specific data point, share a personal "when I tried this" result,
offer a contrarian nuance, or ask a question the OP can't ignore.
NEVER: "Great thread!", "So true!", generic agreement, or just summarizing what they said.`,

  post: `Write a LinkedIn post (800-1300 chars).
HOOK (first 2 lines before "see more" — under 210 chars combined):
Use: bold number, vulnerable admission, contrarian claim, or curiosity gap.
BODY: Personal story or observation (3-4 short paragraphs). Line break every 1-2 sentences.
Use "I" perspective. Include one specific number or data point.
END: Question that invites long comments, not one-word replies.
No links in body. 3-5 hashtags at very end after blank line.`,

  carousel: `Write a LinkedIn carousel outline (8-12 slides).
Slide 1: Bold hook (pattern interrupt + value promise). Same rules as post hook.
Slides 2-10: One actionable insight per slide. Specific, concrete, "do this not that."
Last slide: CTA (follow, comment, repost).
Format as numbered list with one line per slide.`,
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
          system: `You are a content creator with real experience in: ${topic.topic}. ${voiceNote}

CRITICAL RULES:
- NEVER write generic hot takes that anyone could post. Every tweet/paragraph must contain a specific number, named example, or concrete personal experience.
- NEVER use: delve, leverage, utilize, game-changer, groundbreaking, tapestry, realm, landscape, innovative, robust, seamless.
- Use contractions. Sound human. No em dashes. Short punchy sentences.
- The goal is BOOKMARKS and REPOSTS, not likes. Make it save-worthy and share-worthy.
- Reference specific details from the source posts below to make the content grounded in real observations.`,
          messages: [{
            role: 'user',
            content: `Write content about "${topic.topic}" for ${slot.platform === 'linkedin' ? 'LinkedIn' : 'X/Twitter'}.

Here are real posts from your feed on this topic (use these as context, not to copy):
${sampleContext}

Your angle: ${topic.suggestedAngle}
${topic.userEngaged ? 'NOTE: You already replied to posts on this topic — write from that engaged perspective.' : ''}

${formatPrompt}

Output ONLY the content. Nothing else.`,
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
