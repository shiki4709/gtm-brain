// Platform-agnostic content ingestion — fetches content from RSS feeds, URLs, and profiles

interface RssItem {
  readonly title: string
  readonly content: string
  readonly url: string
  readonly publishedAt: string
}

interface IngestResult {
  readonly items: ReadonlyArray<RssItem>
  readonly source: string
}

/**
 * Fetch and parse an RSS/Atom feed into normalized content items.
 * Works with Substack, Medium, Ghost, WordPress, and any standard RSS feed.
 */
export async function fetchRssFeed(feedUrl: string, since?: Date): Promise<IngestResult> {
  const resp = await fetch(feedUrl, {
    headers: { 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
  })

  if (!resp.ok) {
    throw new Error(`Failed to fetch feed: ${resp.status}`)
  }

  const xml = await resp.text()
  const items = parseRssXml(xml, since)

  return { items, source: feedUrl }
}

/**
 * Parse RSS/Atom XML into normalized items.
 * Handles both RSS 2.0 (<item>) and Atom (<entry>) formats.
 */
function parseRssXml(xml: string, since?: Date): ReadonlyArray<RssItem> {
  const items: RssItem[] = []

  // Try RSS 2.0 format first (<item>), then Atom (<entry>)
  const isAtom = xml.includes('<entry>')
  const itemRegex = isAtom
    ? /<entry>([\s\S]*?)<\/entry>/gi
    : /<item>([\s\S]*?)<\/item>/gi

  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]

    const title = extractTag(block, 'title')
    const content = extractContent(block, isAtom)
    const url = extractUrl(block, isAtom)
    const publishedAt = extractDate(block, isAtom)

    if (!content && !title) continue

    // Skip items older than `since`
    if (since && publishedAt) {
      const pubDate = new Date(publishedAt)
      if (pubDate < since) continue
    }

    items.push({
      title: stripHtml(title),
      content: stripHtml(content),
      url,
      publishedAt: publishedAt || new Date().toISOString(),
    })
  }

  return items
}

function extractTag(block: string, tag: string): string {
  // Handle CDATA sections
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i')
  const cdataMatch = block.match(cdataRegex)
  if (cdataMatch) return cdataMatch[1].trim()

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const match = block.match(regex)
  return match ? match[1].trim() : ''
}

function extractContent(block: string, isAtom: boolean): string {
  if (isAtom) {
    return extractTag(block, 'content') || extractTag(block, 'summary')
  }
  // RSS: prefer content:encoded, fall back to description
  return extractTag(block, 'content:encoded') || extractTag(block, 'description')
}

function extractUrl(block: string, isAtom: boolean): string {
  if (isAtom) {
    // Atom uses <link href="..." />
    const linkMatch = block.match(/<link[^>]*href="([^"]*)"[^>]*\/?\s*>/i)
    return linkMatch ? linkMatch[1] : ''
  }
  return extractTag(block, 'link')
}

function extractDate(block: string, isAtom: boolean): string {
  if (isAtom) {
    return extractTag(block, 'published') || extractTag(block, 'updated')
  }
  return extractTag(block, 'pubDate')
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Build a feed URL from a platform and identifier.
 * Returns null if the platform doesn't support RSS.
 */
export function buildFeedUrl(platform: string, identifier: string): string | null {
  switch (platform) {
    case 'substack': {
      // Accept full URL or just subdomain
      const subdomain = identifier.includes('.')
        ? identifier.replace(/https?:\/\//, '').replace(/\.substack\.com.*/, '')
        : identifier
      return `https://${subdomain}.substack.com/feed`
    }
    case 'medium': {
      // Accept @username or full URL
      const handle = identifier.startsWith('@') ? identifier : `@${identifier}`
      return `https://medium.com/feed/${handle}`
    }
    case 'ghost':
    case 'blog': {
      // Assume the identifier is the base URL
      const base = identifier.replace(/\/+$/, '')
      return `${base}/rss/`
    }
    default:
      return null
  }
}

/**
 * Supported source platforms and their capabilities.
 */
export const PLATFORM_CAPABILITIES: Record<string, {
  readonly supportsRss: boolean
  readonly displayName: string
  readonly repurposeTo: ReadonlyArray<string>
}> = {
  substack: { supportsRss: true, displayName: 'Substack', repurposeTo: ['linkedin', 'x', 'quote', 'thread'] },
  medium: { supportsRss: true, displayName: 'Medium', repurposeTo: ['linkedin', 'x', 'quote', 'thread'] },
  ghost: { supportsRss: true, displayName: 'Ghost Blog', repurposeTo: ['linkedin', 'x', 'quote', 'thread'] },
  blog: { supportsRss: true, displayName: 'Blog (RSS)', repurposeTo: ['linkedin', 'x', 'quote', 'thread'] },
  linkedin: { supportsRss: false, displayName: 'LinkedIn', repurposeTo: ['x', 'quote', 'thread', 'substack'] },
  x: { supportsRss: false, displayName: 'X / Twitter', repurposeTo: ['linkedin', 'substack'] },
}
