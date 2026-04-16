import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { fetchRssFeed } from '@/lib/content-ingest'
import { callClaude } from '@/lib/claude'
import { getVoiceProfile, voiceToPrompt } from '@/lib/brand-voice'
import { SYSTEM_PROMPTS } from '@/lib/repurpose-prompts'
import { fetchRelevantTakes, takesToPrompt } from '@/lib/brain-context'

// GET: Fetch ingested items for a source
export async function GET(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sourceId = searchParams.get('sourceId')
  if (!sourceId) return NextResponse.json({ success: false, error: 'sourceId required' }, { status: 400 })

  const { data: items } = await auth.sb
    .from('sb_content_items')
    .select('*')
    .eq('source_id', sourceId)
    .eq('user_id', auth.dbUser.id)
    .order('published_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ success: true, items: items ?? [] })
}

// POST: Ingest new content from a source, extract takes, and optionally auto-repurpose
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { sourceId } = body as { sourceId: string }

  if (!sourceId) return NextResponse.json({ success: false, error: 'sourceId required' }, { status: 400 })

  // Fetch source config
  const { data: source } = await auth.sb
    .from('sb_content_sources')
    .select('*')
    .eq('id', sourceId)
    .eq('user_id', auth.dbUser.id)
    .single()

  if (!source) return NextResponse.json({ success: false, error: 'Source not found' }, { status: 404 })

  // RSS-based ingestion
  if (source.source_type === 'rss' && source.feed_url) {
    const since = source.last_ingested_at ? new Date(source.last_ingested_at) : undefined
    let feedResult
    try {
      feedResult = await fetchRssFeed(source.feed_url, since)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Feed fetch failed'
      return NextResponse.json({ success: false, error: message }, { status: 502 })
    }

    if (feedResult.items.length === 0) {
      return NextResponse.json({ success: true, ingested: 0, message: 'No new content' })
    }

    // Insert new items, skip duplicates by URL
    const newItems = []
    for (const item of feedResult.items) {
      const { data: existing } = await auth.sb
        .from('sb_content_items')
        .select('id')
        .eq('user_id', auth.dbUser.id)
        .eq('url', item.url)
        .limit(1)

      if (existing && existing.length > 0) continue

      const { data: inserted } = await auth.sb
        .from('sb_content_items')
        .insert({
          source_id: sourceId,
          user_id: auth.dbUser.id,
          title: item.title,
          content: item.content,
          url: item.url,
          platform: source.platform,
          published_at: item.publishedAt,
        })
        .select()
        .single()

      if (inserted) newItems.push(inserted)
    }

    // Update last_ingested_at
    await auth.sb
      .from('sb_content_sources')
      .update({ last_ingested_at: new Date().toISOString() })
      .eq('id', sourceId)

    // Process new items: extract takes + auto-repurpose
    const processed = []
    for (const item of newItems) {
      const result = await processContentItem(auth, item, source)
      processed.push(result)
    }

    return NextResponse.json({
      success: true,
      ingested: newItems.length,
      processed,
    })
  }

  return NextResponse.json({ success: false, error: 'Unsupported source type' }, { status: 400 })
}

interface AuthContext {
  readonly sb: import('@supabase/supabase-js').SupabaseClient
  readonly dbUser: { readonly id: string }
}

interface ContentItem {
  readonly id: string
  readonly title: string
  readonly content: string
  readonly url: string
  readonly platform: string
}

interface ContentSource {
  readonly is_own_content: boolean
  readonly auto_repurpose: boolean
  readonly target_platforms: string[]
  readonly platform: string
}

async function processContentItem(
  auth: AuthContext,
  item: ContentItem,
  source: ContentSource
): Promise<{ readonly id: string; readonly takesExtracted: number; readonly repurposedTo: ReadonlyArray<string> }> {
  let takesExtracted = 0
  const repurposedTo: string[] = []

  // Step 1: Extract takes from own content
  if (source.is_own_content) {
    takesExtracted = await extractTakesFromContent(auth, item)
  }

  // Step 2: Auto-repurpose if enabled
  if (source.auto_repurpose) {
    const targetPlatforms = (source.target_platforms ?? ['linkedin', 'x']).filter(
      (p: string) => p !== source.platform // don't repurpose to the same platform
    )
    if (targetPlatforms.length > 0) {
      const repurposed = await repurposeContent(auth, item, targetPlatforms)
      if (repurposed) {
        await auth.sb
          .from('sb_content_items')
          .update({ repurposed: true, repurposed_content: repurposed })
          .eq('id', item.id)
        repurposedTo.push(...Object.keys(repurposed))
      }
    }
  }

  return { id: item.id, takesExtracted, repurposedTo }
}

/**
 * Extract opinion takes from content and save to sb_insights as user_take.
 * This feeds the brain context so future replies and repurposed content
 * reflect what the user has published.
 */
async function extractTakesFromContent(
  auth: AuthContext,
  item: ContentItem
): Promise<number> {
  // Truncate to ~3000 chars to stay within token limits
  const contentSlice = item.content.slice(0, 3000)

  const { text } = await callClaude(
    `Extract the author's key opinions and stances from this content. These will be stored as the user's "takes" for use in future content generation.

TITLE: ${item.title}
CONTENT:
${contentSlice}

Return ONLY a JSON array of 2-4 takes:
[{"topic": "specific topic name", "opinion": "their stance in 1-2 sentences", "keywords": ["3-5 retrieval keywords"]}]

Rules:
- Extract REAL opinions, not summaries
- Each take should be a clear stance someone could agree/disagree with
- Keywords should help match this take to related content later`,
    { model: 'claude-haiku-4-5-20251001', maxTokens: 500 }
  )

  try {
    const takes = JSON.parse(
      text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    ) as Array<{ topic: string; opinion: string; keywords: string[] }>

    if (takes.length === 0) return 0

    const rows = takes.map(t => ({
      user_id: auth.dbUser.id,
      insight_type: 'user_take' as const,
      insight_data: {
        topic: t.topic,
        opinion: t.opinion,
        keywords: t.keywords ?? [],
        source_url: item.url,
        source_platform: item.platform,
      },
      confidence: 0.9, // slightly lower than manually entered takes
    }))

    await auth.sb.from('sb_insights').insert(rows)

    // Mark takes as extracted
    await auth.sb
      .from('sb_content_items')
      .update({ takes_extracted: true })
      .eq('id', item.id)

    return takes.length
  } catch {
    return 0
  }
}

/**
 * Repurpose content to target platforms using the existing repurpose prompt system.
 * Injects brand voice and relevant takes for consistency.
 */
async function repurposeContent(
  auth: AuthContext,
  item: ContentItem,
  targetPlatforms: ReadonlyArray<string>
): Promise<Record<string, string> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return null

  const [voiceProfile, relevantTakes] = await Promise.all([
    getVoiceProfile(auth.sb, auth.dbUser.id),
    fetchRelevantTakes(auth.sb, auth.dbUser.id, item.content),
  ])

  const voiceNote = voiceProfile ? `\n${voiceToPrompt(voiceProfile)}` : ''
  const takesNote = takesToPrompt(relevantTakes)

  // Truncate content for prompt
  const contentSlice = item.content.slice(0, 3000)
  const sourceLabel = item.platform === 'substack' ? 'newsletter issue'
    : item.platform === 'medium' ? 'blog post'
    : item.platform === 'x' ? 'tweet'
    : item.platform === 'linkedin' ? 'LinkedIn post'
    : 'article'

  const userPrompt = `Repurpose this ${sourceLabel} into your own original content for other platforms. Don't copy the original, extract the core insight and make it yours.${voiceNote}${takesNote}

TITLE: ${item.title}
SOURCE ${sourceLabel.toUpperCase()}:
"${contentSlice}"

Generate content for: ${targetPlatforms.join(', ')}

For each format, output the content preceded by the format name in brackets. Put each format's content between its bracket tag.`

  const combinedSystem = targetPlatforms.map(f => `[${f}]\n${SYSTEM_PROMPTS[f] ?? ''}`).join('\n\n')

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: combinedSystem,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!resp.ok) return null

    const result = await resp.json()
    const raw: string = result.content?.[0]?.text ?? ''

    // Parse [format] sections — same pattern as /api/repurpose
    const content: Record<string, string> = {}
    for (const f of targetPlatforms) {
      const regex = new RegExp(`\\[${f}\\]\\s*([\\s\\S]*?)(?=\\[(?:${targetPlatforms.join('|')})\\]|$)`, 'i')
      const match = raw.match(regex)
      content[f] = match ? match[1].trim() : ''
    }

    // Fallback: if parsing failed for a single format, return raw
    if (targetPlatforms.every(f => !content[f]) && targetPlatforms.length === 1) {
      content[targetPlatforms[0]] = raw.trim()
    }

    return content
  } catch {
    return null
  }
}
