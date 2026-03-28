import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function POST(request: Request) {
  const body = await request.json()
  const url = (body.url ?? '').trim()
  const pollId = body.runId ?? ''

  const apifyToken = process.env.APIFY_TOKEN ?? ''
  if (!apifyToken) {
    return NextResponse.json({ error: 'Apify not configured' }, { status: 400 })
  }

  // Poll mode — check existing runs
  if (pollId) {
    try {
      const result = await checkRuns(pollId, apifyToken)

      // If done, save to Supabase
      if (result.status === 'done' && result.leads.length > 0) {
        const auth = await getAuthUser()
        if (auth) {
          await saveToSupabase(url, result, auth.dbUser.id, auth.dbUser.icp_config)
        }
      }

      return NextResponse.json(result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Poll failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // Start mode — kick off scrape
  if (!url || !url.includes('linkedin.com')) {
    return NextResponse.json({ error: 'Invalid LinkedIn URL' }, { status: 400 })
  }

  try {
    const result = await startScrape(url, apifyToken)
    return NextResponse.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Scrape failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function startScrape(postUrl: string, token: string) {
  const actorId = 'scraping_solutions~linkedin-posts-engagers-likers-and-commenters-no-cookies'
  const startUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`

  // Normalize LinkedIn URL
  let apifyUrl = postUrl
  const actMatch = postUrl.match(/activity[- ](\d+)/)
  const shareMatch = postUrl.match(/share[- ](\d+)/)
  if (actMatch) {
    apifyUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${actMatch[1]}/`
  } else if (shareMatch) {
    apifyUrl = `https://www.linkedin.com/feed/update/urn:li:share:${shareMatch[1]}/`
  }

  // Start multiple offset batches for commenters and likers
  const batchSize = 18
  const offsets = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]

  const startRun = (type: string, start: number) =>
    fetch(startUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: apifyUrl, type, iterations: batchSize, start }),
    }).then(r => r.json())

  const allRuns = await Promise.all([
    ...offsets.map(s => startRun('commenters', s)),
    ...offsets.map(s => startRun('likers', s)),
  ])

  // Collect valid run IDs
  const runIds: Array<{ ds: string; id: string }> = []
  for (const run of allRuns) {
    const ds = run.data?.defaultDatasetId
    const id = run.data?.id
    if (ds && id) runIds.push({ ds, id })
  }

  if (runIds.length === 0) {
    const rawErr = allRuns[0]?.error ?? ''
    const errMsg = typeof rawErr === 'string' ? rawErr : JSON.stringify(rawErr)
    throw new Error(errMsg || 'Apify failed to start any runs')
  }

  // Encode run IDs as pollId: ds1,id1|ds2,id2|...
  const newPollId = runIds.map(r => r.ds + ',' + r.id).join('|')

  return {
    status: 'started',
    pollId: newPollId,
    totalBatches: runIds.length,
  }
}

interface LeadResult {
  name: string
  title: string
  company: string
  linkedin_url: string
  comment_text: string
}

interface CheckResult {
  status: 'running' | 'done'
  leads: LeadResult[]
  total?: number
  fetched: number
  commenters?: number
  likers?: number
  progress?: string
}

async function checkRuns(pollId: string, token: string): Promise<CheckResult> {
  const batches = pollId.split('|').map(b => {
    const [ds, id] = b.split(',')
    return { ds, id }
  })

  // Check if all runs finished
  let anyRunning = false
  let succeededCount = 0

  for (const batch of batches) {
    if (!batch.id) continue
    try {
      const resp = await fetch(`https://api.apify.com/v2/actor-runs/${batch.id}?token=${token}`)
      if (resp.ok) {
        const runData = (await resp.json()).data
        const s = runData?.status
        if (s === 'SUCCEEDED' || s === 'FAILED' || s === 'ABORTED') {
          succeededCount++
        } else {
          anyRunning = true
        }
      }
    } catch {
      anyRunning = true
    }
  }

  if (anyRunning) {
    return { status: 'running', leads: [], fetched: 0, progress: `${succeededCount}/${batches.length}` }
  }

  // All done — fetch and merge results from all datasets
  const allItems: Array<Record<string, string>> = []
  for (const batch of batches) {
    if (!batch.ds) continue
    try {
      const r = await fetch(`https://api.apify.com/v2/datasets/${batch.ds}/items?token=${token}`)
      if (r.ok) {
        const items = await r.json()
        allItems.push(...items)
      }
    } catch {
      // Skip failed dataset fetches
    }
  }

  // Deduplicate by profile URL (commenters get priority — they have comment text)
  const leads: LeadResult[] = []
  const seen = new Set<string>()
  let commentCount = 0
  let likerCount = 0

  for (const item of allItems) {
    const profileUrl = item.url_profile ?? ''
    if (!profileUrl || seen.has(profileUrl)) continue
    seen.add(profileUrl)
    const hasComment = !!item.content
    if (hasComment) commentCount++
    else likerCount++
    leads.push({
      name: item.name ?? '',
      title: item.subtitle ?? '',
      company: extractCompany(item.subtitle ?? ''),
      linkedin_url: profileUrl,
      comment_text: item.content ?? '',
    })
  }

  return {
    status: 'done',
    leads,
    total: leads.length,
    fetched: leads.length,
    commenters: commentCount,
    likers: likerCount,
  }
}

function extractCompany(headline: string): string {
  if (!headline) return ''
  for (const sep of [' @ ', ' @', ' | ', ' at ']) {
    if (headline.includes(sep)) {
      return headline.split(sep)[1].split('|')[0].trim()
    }
  }
  return ''
}

async function saveToSupabase(postUrl: string, result: CheckResult, userId: string, icpConfig: Record<string, unknown> | null) {
  const sb = createServiceClient()

  // Get ICP titles for filtering
  const icpTitles: string[] = (icpConfig?.titles as string[]) ?? []
  const icpExclude: string[] = (icpConfig?.exclude as string[]) ?? []

  // Filter leads by ICP
  const leadsWithIcp = result.leads.map(lead => {
    const titleLower = lead.title.toLowerCase()
    const matchesIcp = icpTitles.some(t => titleLower.includes(t.toLowerCase()))
    const excluded = icpExclude.some(t => titleLower.includes(t.toLowerCase()))
    return { ...lead, icp_match: matchesIcp && !excluded }
  })

  const icpCount = leadsWithIcp.filter(l => l.icp_match).length

  // Create scrape record
  const { data: scrape, error: scrapeErr } = await sb
    .from('sb_scrapes')
    .insert({
      user_id: userId,
      post_url: postUrl,
      post_author: '',
      platform: 'linkedin',
      total_engagers: result.leads.length,
      icp_matches: icpCount,
    })
    .select('id')
    .single()

  if (scrapeErr || !scrape) return

  // Insert leads
  const leadRows = leadsWithIcp.map(l => ({
    scrape_id: scrape.id,
    user_id: userId,
    name: l.name,
    title: l.title,
    company: l.company,
    linkedin_url: l.linkedin_url,
    comment_text: l.comment_text,
    icp_match: l.icp_match,
    status: l.icp_match ? 'icp_filtered' : 'scraped',
    source_type: 'outbound',
  }))

  if (leadRows.length > 0) {
    await sb.from('sb_leads').insert(leadRows)
  }

  // Auto-extract topic via Claude Haiku (fire and forget)
  extractTopic(scrape.id, postUrl).catch(() => {})
}

async function extractTopic(scrapeId: string, postUrl: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) return

  const urlTitle = extractTitleFromUrl(postUrl)

  const prompt = `Given this LinkedIn post URL and title, extract a 1-3 word topic tag.
Examples: 'engineering hiring', 'product launches', 'sales playbook', 'remote work', 'GTM strategy'.
URL: ${postUrl}
Title hint: ${urlTitle}
Output only the topic tag, nothing else.`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!resp.ok) return

  const result = await resp.json()
  const topic: string = (result.content?.[0]?.text ?? '').trim().toLowerCase()

  if (topic) {
    const sb = createServiceClient()
    await sb.from('sb_scrapes').update({ post_topic: topic }).eq('id', scrapeId)
  }
}

function extractTitleFromUrl(url: string): string {
  const match = url.match(/\/posts\/[^_]+[_-](.+?)(?:-activity|-\d|$)/)
  if (match) return match[1].replace(/-/g, ' ').substring(0, 100)
  return ''
}
