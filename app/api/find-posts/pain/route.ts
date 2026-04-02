import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { callClaude, parseClaudeJson } from '@/lib/claude'
import { fetchBrainContext, brainContextToPrompt } from '@/lib/brain-context'
import { runPipeline, step } from '@/lib/pipeline'
import { logPipelineRun } from '@/lib/feedback'

// Pain-language post discovery
// Instead of searching by topic keywords (which attract builders/VCs),
// searches by PAIN keywords (which attract operators living with the problem)
//
// Core principle from goose-skills: "can't find drivers" > "AI automation"

interface PainSearchRequest {
  readonly product_description?: string // What does the product solve?
  readonly pain_phrases?: readonly string[] // Optional manual pain phrases
}

interface PainKeywords {
  readonly keywords: readonly string[]
  readonly categories: Record<string, readonly string[]>
}

interface PainPost {
  readonly url: string
  readonly author: string
  readonly title: string
  readonly snippet: string
  readonly activity_id: string
  readonly engagement: number
  readonly painSignal: string // Which pain keyword matched
}

export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { product_description, pain_phrases } = body as PainSearchRequest

  const icpConfig = auth.dbUser.icp_config
  if (!icpConfig?.titles?.length && !product_description) {
    return NextResponse.json(
      { error: 'Complete onboarding first or provide a product description' },
      { status: 400 }
    )
  }

  const braveKey = process.env.BRAVE_SEARCH_KEY ?? ''
  if (!braveKey) {
    return NextResponse.json({ error: 'Brave Search API not configured' }, { status: 400 })
  }

  try {
    const brainContext = await fetchBrainContext(
      auth.sb,
      auth.dbUser.id,
      'post_finding',
      icpConfig?.titles ?? []
    )

    const brainPrompt = brainContextToPrompt(brainContext)

    const painPipeline = [
      // Step 1: Generate pain-language keywords
      step('generate_keywords', async () => {
        // If user provided manual pain phrases, use those
        if (pain_phrases && pain_phrases.length >= 3) {
          return {
            keywords: pain_phrases,
            categories: { manual: pain_phrases },
          } as PainKeywords
        }

        const { text } = await callClaude(
          `You are a pain-language keyword strategist.

${brainPrompt}

CONTEXT:
- ICP titles: ${(icpConfig?.titles ?? []).join(', ')}
- ICP exclusions: ${(icpConfig?.exclude ?? []).join(', ')}
${product_description ? `- Product: ${product_description}` : ''}
${(icpConfig?.track_keywords ?? []).length > 0 ? `- Track keywords: ${icpConfig.track_keywords?.join(', ')}` : ''}

Generate pain-language search keywords. These should be phrases a frustrated operator would ACTUALLY TYPE OR SAY, not marketing language.

WRONG: "AI automation", "workflow optimization", "productivity tools"
RIGHT: "spending hours on", "can't find qualified", "manual data entry killing", "our process is broken"

Output JSON:
{
  "keywords": ["15-20 pain-language search phrases for LinkedIn"],
  "categories": {
    "staffing_pain": ["hiring difficulties, turnover, burnout phrases"],
    "operational_friction": ["manual processes, missed SLAs, breakdowns"],
    "growth_pain": ["cost pressure, scaling challenges"],
    "process_complaints": ["specific workflow frustrations"]
  }
}

Rules:
- Every keyword should be something a frustrated person would actually post
- Use quotation marks for exact phrases where it helps precision
- Include common LinkedIn complaint patterns: "tired of", "why is it so hard to", "spent X hours"
- If brain data shows which topics attract ICP leads, generate pain keywords around those topics
- Output ONLY the JSON`,
          { maxTokens: 600 }
        )
        return parseClaudeJson<PainKeywords>(text)
      }),

      // Step 2: Search Brave for LinkedIn posts using pain keywords
      step('search', async (input) => {
        const painKeywords = input.previous.generate_keywords as PainKeywords
        const allPosts: PainPost[] = []
        const seen = new Set<string>()

        // Search top 6 keywords (balance cost vs coverage)
        const searchKeywords = painKeywords.keywords.slice(0, 6)

        for (const keyword of searchKeywords) {
          try {
            const query = `site:linkedin.com/posts ${keyword}`
            const resp = await fetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&freshness=p3m`,
              {
                headers: {
                  'X-Subscription-Token': braveKey,
                  Accept: 'application/json',
                },
                signal: AbortSignal.timeout(10000),
              }
            )

            if (!resp.ok) continue

            const data = await resp.json()
            const results =
              ((data.web as Record<string, unknown[]>)?.results ?? []) as Array<
                Record<string, string>
              >

            for (const r of results) {
              const url = r.url ?? ''
              if (!url.includes('linkedin.com/posts/')) continue

              const clean = url
                .replace(/[?&](utm_\w+|trk|rcm)=[^&]*/g, '')
                .replace(/[&?]$/, '')
              const actMatch = clean.match(/activity-(\d+)/)
              const dedupKey = actMatch ? actMatch[1] : clean
              if (seen.has(dedupKey)) continue
              seen.add(dedupKey)

              const postMatch = clean.match(
                /linkedin\.com\/posts\/([^_]+?)[-_](.+?)(?:-activity|-\d|$)/
              )
              const author = postMatch
                ? postMatch[1].replace(/-/g, ' ')
                : ''

              allPosts.push({
                url: clean,
                author,
                title: (r.title ?? '').substring(0, 120),
                snippet: (r.description ?? '').substring(0, 200),
                activity_id: actMatch ? actMatch[1] : '',
                engagement: estimateEngagement(
                  r.description ?? '',
                  r.title ?? ''
                ),
                painSignal: keyword,
              })
            }
          } catch {
            // Skip failed keyword search
          }
        }

        // Sort by engagement, highest first
        allPosts.sort((a, b) => b.engagement - a.engagement)
        return allPosts.slice(0, 20) // Top 20 pain posts
      }),

      // Step 3: Score posts by pain relevance
      step('score', async (input) => {
        const posts = input.previous.search as PainPost[]
        if (posts.length === 0) return []

        // Batch score — send all snippets to Claude for pain-relevance scoring
        const postSummaries = posts
          .slice(0, 15)
          .map(
            (p, i) =>
              `[${i}] "${p.title}" by ${p.author} — "${p.snippet}" (signal: ${p.painSignal})`
          )
          .join('\n')

        const { text } = await callClaude(
          `Score these LinkedIn posts by pain-language relevance. Higher = more likely the post author or engagers are experiencing a real business pain.

ICP TITLES: ${(icpConfig?.titles ?? []).join(', ')}

POSTS:
${postSummaries}

Output a JSON array of indices sorted by pain relevance (best first):
[{"index": 0, "painScore": 0.9, "reason": "why this post signals real pain"}, ...]

Only include posts with painScore > 0.3. Output ONLY the JSON array.`,
          { maxTokens: 800 }
        )

        const scores = parseClaudeJson<
          Array<{ index: number; painScore: number; reason: string }>
        >(text)

        return scores
          .filter((s) => s.index < posts.length)
          .map((s) => ({
            ...posts[s.index],
            painScore: s.painScore,
            painReason: s.reason,
          }))
      }),
    ]

    const result = await runPipeline(
      'post_finding',
      painPipeline,
      { product_description, pain_phrases },
      brainContext
    )

    // Log pipeline run (fire and forget)
    logPipelineRun(auth.sb, auth.dbUser.id, result).catch(() => {})

    const keywords = result.steps[0]?.output as PainKeywords
    const scoredPosts = result.finalOutput as Array<
      PainPost & { painScore: number; painReason: string }
    >

    return NextResponse.json({
      keywords: keywords.categories,
      posts: scoredPosts,
      totalFound: (result.steps[1]?.output as PainPost[])?.length ?? 0,
      pipeline: {
        stepsCompleted: result.steps.map((s) => s.stepName),
        totalDurationMs: result.totalDurationMs,
        brainContextUsed: result.brainContextUsed,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Pain-language search failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function estimateEngagement(snippet: string, title: string): number {
  const text = `${snippet} ${title}`.toLowerCase()
  let score = 0

  const patterns = [
    /(\d[\d,]*)\s*(?:likes?|reactions?)/gi,
    /(\d[\d,]*)\s*(?:comments?)/gi,
    /(\d[\d,]*)\s*(?:reposts?|shares?)/gi,
  ]

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern)
    for (const m of matches) {
      score += parseInt(m[1].replace(/,/g, ''), 10) || 0
    }
  }

  if (score === 0) score = 1
  return score
}
