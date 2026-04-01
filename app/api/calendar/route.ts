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
  samplePosts: Array<{ author: string; text: string; engagement: number; url: string }>
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
  sourcePosts: Array<{ author: string; text: string; engagement: number; url: string }>
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
  thread: `Write an X thread (4-6 tweets separated by ---). Each max 270 chars. Keep it TIGHT. Every tweet must earn its spot.

Pick the BEST format for this topic:

FORMAT A — REACTIVE TAKE (if topic is breaking news):
3-4 tweets. Tweet 1: your spicy take on the news. Tweet 2-3: why this matters that nobody is saying. Tweet 4: question. Fast, opinionated, timely.

FORMAT B — SKILL SHARE (if topic is how-to):
5-6 tweets. Tweet 1: "Here's exactly how I [do thing]:" Tweet 2-5: one concrete step per tweet with specific details. Tweet 6: "Bookmark this." Actionable and save-worthy.

FORMAT C — RESOURCE LIST (if topic has tools/links):
4-5 tweets. Tweet 1: "[N] tools/resources that [solve problem]:" Tweet 2-4: one per tweet with what it does and why. Tweet 5: "Which ones are you using?" High bookmark rate.

FORMAT D — OPINION ON NEWS (if topic is industry event):
3-4 tweets. Tweet 1: the event + your contrarian angle. Tweet 2: what everyone is missing. Tweet 3: what this actually means for [your audience]. Tweet 4: question.

RULES:
- 4-6 tweets MAX. Shorter is better. If you can say it in 4, don't use 6.
- Every tweet under 240 chars for readability
- Hook must pattern-interrupt in under 15 words
- Use "you" voice, contractions, sentence fragments
- End with question or bookmark ask
- Reference specific details from the source posts
- NEVER write a 10-tweet generic insight dump. Be sharp, be specific, be short.`,

  quote: `Write a quote tweet (max 270 chars). Pick the best style:

STYLE A — SPICY TAKE: One sentence that reframes the whole conversation. Contrarian, specific, makes people stop scrolling.
STYLE B — "THE REAL STORY IS...": Point out what everyone is missing about this topic. Short, sharp.
STYLE C — MEME ENERGY: Funny observation about the topic. Dry humor, relatable, slightly unhinged. NOT a joke — an observation that's funny because it's true.
STYLE D — PERSONAL RECEIPT: "We tried this. Here's what actually happened: [specific result]." 1-2 sentences.

Pick whichever style fits the source posts best. Under 200 chars is ideal. 270 max.
NEVER: agree generically, summarize, use "Great thread!", or be boring.`,

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
          system: `You are writing as this specific person: ${voiceNote || 'A knowledgeable practitioner who builds and ships real things.'}

The current year is ${new Date().getFullYear()}. NEVER reference past years as if they are current.

Your expertise in "${topic.topic}" comes from DOING, not observing. Write from the perspective of someone who has built things, shipped products, or run experiments — not someone commenting from the sidelines.

CRITICAL RULES:
- NEVER write generic hot takes that anyone could post. Every tweet/paragraph must contain a specific number, named example, or concrete personal experience.
- NEVER reference years before ${new Date().getFullYear()} as "this year" or "recently." If you mention a year, use ${new Date().getFullYear()}.
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
        sourcePosts: topic.samplePosts.slice(0, 3),
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
