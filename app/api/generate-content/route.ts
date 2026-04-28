import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { callClaude, parseClaudeJson } from '@/lib/claude'
import { fetchBrainContext, brainContextToPrompt } from '@/lib/brain-context'
import { runPipeline, step } from '@/lib/pipeline'
import { logPipelineRun } from '@/lib/feedback'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'
import { getProductContext, productContextToPrompt } from '@/lib/product-context'

interface GenerateRequest {
  readonly source: string
  readonly platforms?: readonly string[]
}

interface AngleOption {
  readonly angle: string
  readonly thesis: string
  readonly targetAudience: string
}

interface ContentOutput {
  readonly linkedin: string
  readonly x: string
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { source, platforms } = body as GenerateRequest

  if (!source) {
    return NextResponse.json({ error: 'No source material provided' }, { status: 400 })
  }

  const requestedPlatforms = platforms ?? ['linkedin', 'x']

  try {
    // Fetch brain context + voice profile + product context in parallel
    const [brainContext, voiceProfile, productContext] = await Promise.all([
      fetchBrainContext(
        auth.sb,
        auth.dbUser.id,
        'content_generation',
        auth.dbUser.icp_config?.titles ?? []
      ),
      getVoiceProfile(auth.sb, auth.dbUser.id),
      getProductContext(auth.sb, auth.dbUser.id),
    ])

    const brainPrompt = brainContextToPrompt(brainContext)
    const voicePrompt = voiceToPrompt(voiceProfile)
    const productPrompt = productContextToPrompt(productContext)

    // Define pipeline: research → angle → draft → refine
    const contentPipeline = [
      // Step 1: Research — extract core insight + identify angles
      step('research', async () => {
        const { text } = await callClaude(
          `You are a research analyst for GTM content.

${brainPrompt}
${productPrompt}

SOURCE MATERIAL:
${source.substring(0, 3000)}

Analyze this source and output a JSON object:
{
  "coreInsight": "one sentence — the key takeaway",
  "keyPoints": ["3-5 bullet points"],
  "angles": [
    {"angle": "name", "thesis": "one sentence POV", "targetAudience": "who cares about this"},
    {"angle": "name", "thesis": "one sentence POV", "targetAudience": "who cares about this"},
    {"angle": "name", "thesis": "one sentence POV", "targetAudience": "who cares about this"}
  ]
}

Rules:
- If brain context shows which topics attract ICP leads, bias angles toward those topics
- One angle should be a hot take, one tactical, one contrarian
- Don't invent stats not in the source
- Output ONLY the JSON, nothing else`,
          { maxTokens: 600 }
        )
        return parseClaudeJson<{
          coreInsight: string
          keyPoints: string[]
          angles: AngleOption[]
        }>(text)
      }),

      // Step 2: Draft — generate platform-native content using best angle
      step('draft', async (input) => {
        const research = input.previous.research as {
          coreInsight: string
          keyPoints: string[]
          angles: AngleOption[]
        }
        const bestAngle = research.angles[0] // Auto-pick top angle

        const platformInstructions: string[] = []
        if (requestedPlatforms.includes('linkedin')) {
          platformInstructions.push(`[LINKEDIN]
Write a LinkedIn post. 150-250 words. Start with a hook that stops the scroll.
Use short paragraphs (1-2 sentences each). Add line breaks between paragraphs.
End with a question or call-to-action. Max 3 hashtags at the end.
Tone: confident practitioner sharing a real insight, not a thought leader performing.
[/LINKEDIN]`)
        }
        if (requestedPlatforms.includes('x')) {
          platformInstructions.push(`[X_THREAD]
Write an X thread of 4-6 tweets. Each tweet under 270 characters.
Format: one tweet per line, separated by ---
First tweet is the hook — make it standalone-shareable.
Last tweet is a summary or CTA.
No hashtags. No emojis. No numbering (1/, 2/).
Tone: sharp, opinionated, concise.
[/X_THREAD]`)
        }

        const { text } = await callClaude(
          `You are a content strategist. Write platform-native content using this angle.

${voicePrompt}
${productPrompt}

ANGLE: ${bestAngle.angle}
THESIS: ${bestAngle.thesis}
TARGET AUDIENCE: ${bestAngle.targetAudience}
CORE INSIGHT: ${research.coreInsight}
KEY POINTS:
${research.keyPoints.map((p) => `- ${p}`).join('\n')}

${brainPrompt}

Create content for each platform:
${platformInstructions.join('\n\n')}

Rules:
- Don't invent statistics or quotes not in the source
- Don't use corporate buzzwords (synergy, leverage, disrupt, game-changer)
- Write like a real person who actually does this work
- Each platform's content should feel native to that platform
- Output ONLY the tagged sections, nothing else`,
          { model: 'claude-sonnet-4-6', maxTokens: 2000 }
        )

        const linkedinMatch = text.match(/\[LINKEDIN\]([\s\S]*?)\[\/LINKEDIN\]/)
        const xMatch = text.match(/\[X_THREAD\]([\s\S]*?)\[\/X_THREAD\]/)

        return {
          linkedin: linkedinMatch ? linkedinMatch[1].trim() : '',
          x: xMatch ? xMatch[1].trim() : '',
        } as ContentOutput
      }),

      // Step 3: Refine — tighten, punch up, remove fluff
      step('refine', async (input) => {
        const draft = input.previous.draft as ContentOutput
        const sections: string[] = []

        if (draft.linkedin) {
          sections.push(`[LINKEDIN]\n${draft.linkedin}\n[/LINKEDIN]`)
        }
        if (draft.x) {
          sections.push(`[X_THREAD]\n${draft.x}\n[/X_THREAD]`)
        }

        const { text } = await callClaude(
          `You are a ruthless editor. Improve this content.

${voicePrompt}

${sections.join('\n\n')}

Editing checklist:
- Tighten every sentence — cut words that don't earn their spot
- Strengthen the hook — make the first line impossible to scroll past
- Remove any fluff, filler, or corporate speak
- Make the tone more punchy and direct
- Keep the same structure and tagged format

Output the improved version in the same [LINKEDIN]...[/LINKEDIN] and [X_THREAD]...[/X_THREAD] tags.
Output ONLY the tagged sections, nothing else.`,
          { maxTokens: 2000 }
        )

        const linkedinMatch = text.match(/\[LINKEDIN\]([\s\S]*?)\[\/LINKEDIN\]/)
        const xMatch = text.match(/\[X_THREAD\]([\s\S]*?)\[\/X_THREAD\]/)

        return {
          linkedin: linkedinMatch ? linkedinMatch[1].trim() : draft.linkedin,
          x: xMatch ? xMatch[1].trim() : draft.x,
        } as ContentOutput
      }),
    ]

    // Run the pipeline
    const result = await runPipeline(
      'content_generation',
      contentPipeline,
      { source, platforms: requestedPlatforms },
      brainContext
    )

    // Log pipeline run (fire and forget)
    logPipelineRun(auth.sb, auth.dbUser.id, result).catch(() => {})

    // Extract outputs for API response
    const research = result.steps[0]?.output as {
      coreInsight: string
      angles: AngleOption[]
    }
    const refined = result.finalOutput as ContentOutput

    return NextResponse.json({
      coreInsight: research.coreInsight,
      angles: research.angles,
      results: {
        linkedin: refined.linkedin,
        x: refined.x,
      },
      pipeline: {
        stepsCompleted: result.steps.map((s) => s.stepName),
        totalDurationMs: result.totalDurationMs,
        brainContextUsed: result.brainContextUsed,
        voiceProfileUsed: voiceProfile !== null,
        productContextUsed: productContext !== null,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Content generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
