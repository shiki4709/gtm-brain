import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { callClaude, parseClaudeJson } from '@/lib/claude'
import { fetchBrainContext, brainContextToPrompt } from '@/lib/brain-context'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'
import { runPipeline, step } from '@/lib/pipeline'
import { logPipelineRun } from '@/lib/feedback'

interface RepurposeRequest {
  readonly source: string
  readonly channels?: readonly string[] // linkedin, x, email — default all
}

interface SourceIntelligence {
  readonly coreThesis: string
  readonly supportingPoints: readonly string[]
  readonly bestStats: readonly string[]
  readonly bestQuotes: readonly string[]
  readonly contrarianAngle: string
  readonly emotionalHook: string
}

interface RepurposedContent {
  readonly linkedin: readonly LinkedInVariant[]
  readonly x: readonly XThread[]
  readonly email: readonly EmailSnippet[]
  readonly hooks: readonly string[]
  readonly pullQuotes: readonly string[]
}

interface LinkedInVariant {
  readonly type: 'insight' | 'listicle' | 'contrarian' | 'story' | 'data'
  readonly content: string
}

interface XThread {
  readonly tweets: readonly string[]
}

interface EmailSnippet {
  readonly type: 'newsletter_blurb' | 'ps_line'
  readonly content: string
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { source, channels } = body as RepurposeRequest

  if (!source) {
    return NextResponse.json({ error: 'No source content provided' }, { status: 400 })
  }

  const requestedChannels = channels ?? ['linkedin', 'x', 'email']

  try {
    const [brainContext, voiceProfile] = await Promise.all([
      fetchBrainContext(
        auth.sb,
        auth.dbUser.id,
        'content_generation',
        auth.dbUser.icp_config?.titles ?? []
      ),
      getVoiceProfile(auth.sb, auth.dbUser.id),
    ])

    const brainPrompt = brainContextToPrompt(brainContext)
    const voicePrompt = voiceToPrompt(voiceProfile)

    const repurposePipeline = [
      // Step 1: Extract source intelligence
      step('extract', async () => {
        const { text } = await callClaude(
          `You are a content strategist. Extract the key elements from this source content.

SOURCE:
${source.substring(0, 5000)}

Output JSON:
{
  "coreThesis": "the single most important claim or insight",
  "supportingPoints": ["top 3 supporting points with evidence"],
  "bestStats": ["any numbers, percentages, benchmarks mentioned"],
  "bestQuotes": ["2-3 pull-quote candidates that stand alone"],
  "contrarianAngle": "what conventional wisdom does this challenge?",
  "emotionalHook": "the frustration, aspiration, or fear this speaks to"
}

Rules:
- coreThesis should be one sentence a busy exec would remember
- bestQuotes must make sense without surrounding context
- contrarianAngle should be genuinely provocative, not watered down
- Output ONLY the JSON`,
          { maxTokens: 600 }
        )
        return parseClaudeJson<SourceIntelligence>(text)
      }),

      // Step 2: Generate LinkedIn variants (if requested)
      step('linkedin', async (input) => {
        if (!requestedChannels.includes('linkedin')) return []

        const intel = input.previous.extract as SourceIntelligence

        const { text } = await callClaude(
          `You are a LinkedIn content writer. Generate 4 post variants from this source intelligence.

${voicePrompt}

${brainPrompt}

SOURCE INTELLIGENCE:
- Core thesis: ${intel.coreThesis}
- Supporting points: ${intel.supportingPoints.join(' | ')}
- Best stats: ${intel.bestStats.join(' | ')}
- Contrarian angle: ${intel.contrarianAngle}
- Emotional hook: ${intel.emotionalHook}

Generate 4 LinkedIn posts as a JSON array:
[
  {"type": "insight", "content": "150-300 word insight post"},
  {"type": "listicle", "content": "200-350 word numbered list"},
  {"type": "contrarian", "content": "100-200 word hot take"},
  {"type": "data", "content": "80-150 word stat-led post"}
]

LinkedIn formatting rules:
- First line must hook without finishing (forces "see more")
- Use line breaks liberally — one idea per line
- No bullet points in first 3 lines
- End with a question or call to reflect — NOT a CTA to buy
- Max 3 hashtags at the very end
- Match the author's voice profile exactly
- Output ONLY the JSON array`,
          { model: 'claude-sonnet-4-6', maxTokens: 3000 }
        )
        return parseClaudeJson<LinkedInVariant[]>(text)
      }),

      // Step 3: Generate X threads (if requested)
      step('x_threads', async (input) => {
        if (!requestedChannels.includes('x')) return []

        const intel = input.previous.extract as SourceIntelligence

        const { text } = await callClaude(
          `You are an X/Twitter thread writer. Generate 2 threads from this source.

${voicePrompt}

SOURCE INTELLIGENCE:
- Core thesis: ${intel.coreThesis}
- Supporting points: ${intel.supportingPoints.join(' | ')}
- Best stats: ${intel.bestStats.join(' | ')}
- Contrarian angle: ${intel.contrarianAngle}

Generate 2 threads as JSON:
[
  {"tweets": ["tweet 1 (the hook — state the insight directly)", "tweet 2", "tweet 3", "tweet 4", "tweet 5", "tweet 6 (callback + soft CTA)"]},
  {"tweets": ["alt hook", "tweet 2", "tweet 3", "tweet 4", "tweet 5"]}
]

Rules:
- Each tweet under 270 characters
- Tweet 1 = the payoff, not the setup
- One supporting point per tweet
- No hashtags, no emojis, no numbering (1/, 2/)
- Last tweet: soft CTA or strongest reframe
- Thread 1: main angle, Thread 2: contrarian angle
- Output ONLY the JSON array`,
          { maxTokens: 1500 }
        )
        return parseClaudeJson<XThread[]>(text)
      }),

      // Step 4: Generate email snippets (if requested)
      step('email', async (input) => {
        if (!requestedChannels.includes('email')) return []

        const intel = input.previous.extract as SourceIntelligence

        const { text } = await callClaude(
          `Generate email snippets from this source intelligence.

${voicePrompt}

SOURCE INTELLIGENCE:
- Core thesis: ${intel.coreThesis}
- Best stats: ${intel.bestStats.join(' | ')}
- Emotional hook: ${intel.emotionalHook}

Generate as JSON:
[
  {"type": "newsletter_blurb", "content": "80-120 word newsletter intro"},
  {"type": "ps_line", "content": "20-40 word PS line for cold emails"}
]

Rules:
- Newsletter blurb should tease the insight and link to the full piece
- PS line should be casual, specific, and create curiosity
- Match author's voice
- Output ONLY the JSON array`,
          { maxTokens: 400 }
        )
        return parseClaudeJson<EmailSnippet[]>(text)
      }),

      // Step 5: Generate hooks + pull quotes
      step('hooks_quotes', async (input) => {
        const intel = input.previous.extract as SourceIntelligence

        const { text } = await callClaude(
          `Generate short-form hooks and pull quotes from this source.

SOURCE INTELLIGENCE:
- Core thesis: ${intel.coreThesis}
- Contrarian angle: ${intel.contrarianAngle}
- Best quotes: ${intel.bestQuotes.join(' | ')}
- Best stats: ${intel.bestStats.join(' | ')}

Output JSON:
{
  "hooks": ["6-8 one-liner openings that work as standalone hooks across any platform"],
  "pullQuotes": ["3-5 shareable quotes that stand alone without context"]
}

Hook patterns to use:
- "Most [role]s get [topic] completely backwards."
- "The [thing everyone does] is why [bad outcome]."
- "[Number] years ago, [company/person] did [thing]. Here's what happened."
- "Unpopular opinion: [claim]."

Rules:
- Each hook under 100 characters
- Pull quotes should be screenshot-worthy
- Output ONLY the JSON`,
          { maxTokens: 600 }
        )
        return parseClaudeJson<{ hooks: string[]; pullQuotes: string[] }>(text)
      }),
    ]

    const result = await runPipeline(
      'content_generation',
      repurposePipeline,
      { source, channels: requestedChannels },
      brainContext
    )

    // Log pipeline run (fire and forget)
    logPipelineRun(auth.sb, auth.dbUser.id, result).catch(() => {})

    const intel = result.steps[0]?.output as SourceIntelligence
    const linkedin = (result.steps[1]?.output ?? []) as LinkedInVariant[]
    const xThreads = (result.steps[2]?.output ?? []) as XThread[]
    const email = (result.steps[3]?.output ?? []) as EmailSnippet[]
    const hooksQuotes = (result.steps[4]?.output ?? {}) as {
      hooks: string[]
      pullQuotes: string[]
    }

    return NextResponse.json({
      sourceIntelligence: intel,
      content: {
        linkedin,
        x: xThreads,
        email,
        hooks: hooksQuotes.hooks ?? [],
        pullQuotes: hooksQuotes.pullQuotes ?? [],
      } as RepurposedContent,
      pipeline: {
        stepsCompleted: result.steps.map((s) => s.stepName),
        totalDurationMs: result.totalDurationMs,
        brainContextUsed: result.brainContextUsed,
        voiceProfileUsed: voiceProfile !== null,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Content repurposing failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
