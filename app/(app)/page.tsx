'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface FeedItem {
  platform: 'linkedin' | 'x'
  author: string
  authorHandle: string
  text: string
  url: string
  time: string
  engagement?: { likes?: number; replies?: number; retweets?: number }
}

interface WatchlistEntry {
  id: string
  platform: string
  username: string
  display_name: string
  profile_url: string
}

interface LinkedInInsights {
  topics?: Array<{ topic: string; avg_icp_rate: number }>
}

interface RoiData {
  avg_icp_rate: number
  dm_reply_rate: number
  meeting_rate: number
  topic_rates: Record<string, number>
  avg_reply_likes: number
  confidence: 'benchmark' | 'low' | 'medium' | 'high'
}

interface TaskState {
  [url: string]: 'done' | 'skipped'
}

type FeedView = 'posts' | 'outreach'

interface OutreachLead {
  id: string
  name: string
  title: string
  company: string
  linkedin_url: string
  comment_text: string
  icp_match: boolean
  status: string
  dm_draft: string | null
  sb_scrapes?: { post_url: string; post_topic: string | null }
}

export default function WatchlistFeed() {
  const [feedView, setFeedView] = useState<FeedView>('posts')
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null) // username to drill into
  const [showPeople, setShowPeople] = useState(false) // collapsible people section
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  // Outreach state
  const [outreachLeads, setOutreachLeads] = useState<OutreachLead[]>([])
  const [outreachTotal, setOutreachTotal] = useState(0)
  const [loadingOutreach, setLoadingOutreach] = useState(false)
  const [draftingDmId, setDraftingDmId] = useState<string | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [insights, setInsights] = useState<LinkedInInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [tasks, setTasks] = useState<TaskState>({})
  const [roi, setRoi] = useState<RoiData | null>(null)
  const [watchSuggestions, setWatchSuggestions] = useState<Array<{ platform: string; username: string; name: string; reason: string; headline?: string; followers?: number }>>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [watchingInProgress, setWatchingInProgress] = useState<string | null>(null) // username being added
  // Chat state for discovering influencers
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  // Draft reply state
  const [draftingUrl, setDraftingUrl] = useState<string | null>(null)
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)

  function fetchSuggestions() {
    setLoadingSuggestions(true)
    fetch('/api/suggest-watchlist').then(r => r.json()).then(json => {
      if (json.success && json.suggestions) setWatchSuggestions(json.suggestions)
    }).catch(() => {}).finally(() => setLoadingSuggestions(false))
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/watchlist').then(r => r.json()),
      fetch('/api/insights/linkedin').then(r => r.json()),
      fetch('/api/insights/roi').then(r => r.json()),
    ]).then(async ([wlJson, liJson, roiJson]) => {
      if (roiJson.success) setRoi(roiJson.data)
      if (wlJson.success) setWatchlist(wlJson.data ?? [])
      if (liJson.success) setInsights(liJson.data)
      if (wlJson.data?.length > 0) {
        await fetchFeed()
        // If feed is empty after fetching, show suggestions to help user add better profiles
        fetchSuggestions()
      } else {
        fetchSuggestions()
      }
    }).catch(() => {}).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchFeed(forceRefresh = false) {
    setLoadingFeed(true)
    try {
      const res = await fetch(`/api/watchlist/feed${forceRefresh ? '?refresh=1' : ''}`)
      const json = await res.json()
      if (json.success) setFeed(json.items ?? [])
    } catch { /* silently fail */ }
    finally { setLoadingFeed(false) }
  }

  async function fetchOutreach() {
    setLoadingOutreach(true)
    try {
      const res = await fetch('/api/leads?filter=icp&limit=50')
      const json = await res.json()
      if (json.success) {
        setOutreachLeads(json.data ?? [])
        setOutreachTotal(json.total ?? 0)
      }
    } catch { /* silently fail */ }
    finally { setLoadingOutreach(false) }
  }

  async function handleDraftDm(lead: OutreachLead) {
    setDraftingDmId(lead.id)
    try {
      const topic = lead.sb_scrapes?.post_topic ?? ''
      const res = await fetch('/api/draft-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_name: lead.name,
          lead_title: lead.title,
          lead_company: lead.company,
          comment_text: lead.comment_text,
          post_topic: topic,
        }),
      })
      const json = await res.json()
      if (json.message) {
        setOutreachLeads(prev => prev.map(l =>
          l.id === lead.id ? { ...l, dm_draft: json.message, status: 'dm_drafted' } : l
        ))
      }
    } catch { /* silently fail */ }
    finally { setDraftingDmId(null) }
  }

  async function chatFindPeople(query: string) {
    setChatLoading(true)
    try {
      const res = await fetch('/api/suggest-watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const json = await res.json()
      if (json.success && json.suggestions?.length > 0) {
        setWatchSuggestions(json.suggestions)
      }
    } catch { /* silently fail */ }
    finally { setChatLoading(false); setChatInput('') }
  }

  async function addToWatchlist() {
    if (!addInput.trim()) return
    setAdding(true)
    let platform: 'linkedin' | 'x' = 'linkedin'
    let username = addInput.trim()
    if (username.includes('linkedin.com/in/')) {
      platform = 'linkedin'
      username = username.replace(/.*linkedin\.com\/in\//, '').replace(/\/$/, '')
    } else if (username.includes('x.com/') || username.includes('twitter.com/')) {
      platform = 'x'
      username = username.replace(/.*(?:x|twitter)\.com\//, '').replace(/\/$/, '').replace(/^@/, '')
    } else if (username.startsWith('@')) {
      platform = 'x'
      username = username.replace(/^@/, '')
    }
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, username }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setWatchlist(prev => [json.data, ...prev.filter(w => w.id !== json.data.id)])
        setAddInput('')
        fetchFeed(true)
      }
    } catch { /* silently fail */ }
    finally { setAdding(false) }
  }

  async function removeFromWatchlist(id: string) {
    await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' })
    setWatchlist(prev => prev.filter(w => w.id !== id))
  }

  async function handleDraftReply(item: FeedItem) {
    setDraftingUrl(item.url)
    try {
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet_text: item.text, author_name: item.author, author_handle: item.authorHandle }),
      })
      const json = await res.json()
      if (json.reply) setDraftReplies(prev => ({ ...prev, [item.url]: json.reply }))
    } catch { /* silently fail */ }
    finally { setDraftingUrl(null) }
  }

  function copyAndOpen(text: string, url: string) {
    navigator.clipboard.writeText(text)
    setCopied(url)
    window.open(url, '_blank')
    setTimeout(() => setCopied(null), 2000)
  }

  function markDone(url: string, actionType?: string) {
    setTasks(prev => ({ ...prev, [url]: 'done' }))
    const item = feed.find(f => f.url === url)
    if (item) {
      const rec = getRecommendation(item)
      logBrainDecision(item, actionType ?? rec.actions[0]?.type ?? 'unknown', rec.actions[0]?.priority ?? 'medium', rec.reason, 'followed')
    }
  }

  function markSkipped(url: string) {
    setTasks(prev => ({ ...prev, [url]: 'skipped' }))
    const item = feed.find(f => f.url === url)
    if (item) {
      const rec = getRecommendation(item)
      logBrainDecision(item, rec.actions[0]?.type ?? 'unknown', rec.actions[0]?.priority ?? 'medium', rec.reason, 'skipped')
    }
  }

  function undoTask(url: string) {
    setTasks(prev => {
      const next = { ...prev }
      delete next[url]
      return next
    })
  }

  // Calculate ROI estimates for a post
  function getEstimatedROI(item: FeedItem) {
    const likes = item.engagement?.likes ?? 0
    const comments = item.engagement?.replies ?? 0
    const rts = item.engagement?.retweets ?? 0
    const totalEngagement = likes + comments + rts
    const r = roi ?? { avg_icp_rate: 0.03, dm_reply_rate: 0.10, meeting_rate: 0.30, topic_rates: {}, avg_reply_likes: 0, confidence: 'benchmark' as const }
    const prefix = r.confidence === 'benchmark' ? '~' : ''

    // Check for topic-specific rate
    const textLower = item.text.toLowerCase()
    let icpRate = r.avg_icp_rate
    for (const [topic, rate] of Object.entries(r.topic_rates)) {
      if (textLower.includes(topic)) { icpRate = rate; break }
    }

    // SCRAPE ROI
    const estIcpLeads = Math.round(totalEngagement * icpRate)
    const estReplies = Math.round(estIcpLeads * r.dm_reply_rate * 10) / 10
    const estMeetings = Math.round(estReplies * r.meeting_rate * 10) / 10

    // REPLY ROI
    const threadVisibility = likes + comments + (rts * 3)
    const replyImpressions = Math.round(threadVisibility * 0.15)
    const estFollowers = Math.round(replyImpressions * 0.02 * 10) / 10

    // CONTENT ROI
    const estContentEngagers = 50 // benchmark: avg engagers on a repurposed post
    const estInboundLeads = Math.round(estContentEngagers * icpRate)

    return {
      scrape: { icpLeads: estIcpLeads, replies: estReplies, meetings: estMeetings },
      reply: { impressions: replyImpressions, followers: estFollowers },
      content: { inboundLeads: estInboundLeads, icpRate: Math.round(icpRate * 100) },
      prefix,
      confidence: r.confidence,
    }
  }

  // Calculate engagement velocity: engagement per hour since posted
  function getVelocity(item: FeedItem): { velocity: number; ageHours: number } {
    const totalEngagement = (item.engagement?.likes ?? 0) + (item.engagement?.replies ?? 0) + (item.engagement?.retweets ?? 0)
    if (!item.time) return { velocity: totalEngagement, ageHours: 0 }
    const ageMs = Date.now() - new Date(item.time).getTime()
    const ageHours = Math.max(ageMs / (1000 * 60 * 60), 0.5) // min 30 min
    return { velocity: Math.round((totalEngagement / ageHours) * 10) / 10, ageHours: Math.round(ageHours * 10) / 10 }
  }

  // Log brain decision (fire and forget)
  function logBrainDecision(item: FeedItem, action: string, priority: string, reason: string, userAction: string) {
    const { velocity, ageHours } = getVelocity(item)
    fetch('/api/brain-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_url: item.url,
        platform: item.platform,
        author_handle: item.authorHandle,
        recommended_action: action,
        priority,
        reason,
        engagement_at_time: {
          likes: item.engagement?.likes ?? 0,
          comments: item.engagement?.replies ?? 0,
          shares: item.engagement?.retweets ?? 0,
          age_hours: ageHours,
          velocity,
        },
        user_action: userAction,
      }),
    }).catch(() => {})
  }

  function getRecommendation(item: FeedItem): { actions: Array<{ label: string; type: 'scrape' | 'reply' | 'content' | 'skip'; priority: 'high' | 'medium' | 'low' }>; reason: string } {
    const likes = item.engagement?.likes ?? 0
    const comments = item.engagement?.replies ?? 0
    const rts = item.engagement?.retweets ?? 0
    const totalEngagement = likes + comments + rts
    const { velocity, ageHours } = getVelocity(item)
    const textLower = item.text.toLowerCase()
    const matchedTopic = insights?.topics?.find(t => textLower.includes(t.topic.toLowerCase()))
    const hasQuestion = item.text.includes('?')
    const isLinkedIn = item.platform === 'linkedin'

    // Velocity boost: a fresh post with decent velocity is worth more than an old post with raw numbers
    const isHot = velocity >= 10 && ageHours < 6 // 10+ engagements per hour in first 6 hours
    const isFresh = ageHours < 2

    type Action = { label: string; type: 'scrape' | 'reply' | 'content' | 'skip'; priority: 'high' | 'medium' | 'low' }
    const actions: Action[] = []

    // ═══ VELOCITY-BASED — fresh posts with momentum ═══

    if (isHot) {
      if (isLinkedIn) {
        actions.push({ label: 'Scrape now — trending', type: 'scrape', priority: 'high' })
        actions.push({ label: 'Reply on post', type: 'reply', priority: 'medium' })
      } else {
        actions.push({ label: 'Reply now — trending', type: 'reply', priority: 'high' })
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'medium' })
      }
      actions.push({ label: 'Use as content idea', type: 'content', priority: 'low' })
      const topicNote = matchedTopic ? ` ICP topic "${matchedTopic.topic}".` : ''
      return { actions, reason: `🔥 ${velocity} engagements/hr — posted ${ageHours < 1 ? 'just now' : `${Math.round(ageHours)}h ago`}. Engagement is accelerating.${topicNote}` }
    }

    if (isFresh && totalEngagement >= 3) {
      if (isLinkedIn) {
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'medium' })
        actions.push({ label: 'Reply on post', type: 'reply', priority: 'medium' })
      } else {
        actions.push({ label: 'Draft reply', type: 'reply', priority: 'medium' })
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'low' })
      }
      return { actions, reason: `Fresh (${Math.round(ageHours * 60)}min ago) with ${totalEngagement} engagers. Early engagement = likely to grow. Act now.` }
    }

    // ═══ HIGH ENGAGEMENT — multiple actions available ═══

    // Viral / very high engagement
    if ((isLinkedIn && comments >= 10) || (!isLinkedIn && (likes >= 100 || comments >= 20))) {
      // Primary: scrape on LinkedIn, reply on X
      if (isLinkedIn) {
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'high' })
        actions.push({ label: 'Reply on post', type: 'reply', priority: 'medium' })
      } else {
        actions.push({ label: 'Reply now', type: 'reply', priority: 'high' })
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'medium' })
      }
      actions.push({ label: 'Use as content idea', type: 'content', priority: 'low' })

      const topicNote = matchedTopic ? ` Topic "${matchedTopic.topic}" yields ${Math.round(matchedTopic.avg_icp_rate * 100)}% ICP match.` : ''
      if (isLinkedIn) {
        return { actions, reason: `${comments} comments (15x more valuable than likes). Scrape for leads, reply to build visibility.${topicNote}` }
      }
      return { actions, reason: `🔥 ${likes} likes, ${comments} replies. Reply ASAP for visibility. Scrape engagers for leads too.${topicNote}` }
    }

    // High engagement + topic match
    if (totalEngagement >= 20 && matchedTopic) {
      actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'high' })
      actions.push({ label: isLinkedIn ? 'Reply on post' : 'Draft reply', type: 'reply', priority: 'medium' })
      actions.push({ label: 'Use as content idea', type: 'content', priority: 'low' })
      return { actions, reason: `${totalEngagement} engagers + topic "${matchedTopic.topic}" matches your ICP (${Math.round(matchedTopic.avg_icp_rate * 100)}%). Scrape for leads and engage.` }
    }

    // X: high likes but low replies = underserved thread
    if (!isLinkedIn && likes >= 30 && comments < 5) {
      actions.push({ label: 'Reply — you\'ll stand out', type: 'reply', priority: 'high' })
      actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'low' })
      return { actions, reason: `${likes} likes but only ${comments} replies. Your reply will stand out. Scrape likers for leads too.` }
    }

    // Question posts = high comment potential
    if (hasQuestion && totalEngagement >= 10) {
      actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'high' })
      actions.push({ label: isLinkedIn ? 'Reply on post' : 'Draft reply', type: 'reply', priority: 'medium' })
      return { actions, reason: `Question post with ${totalEngagement} engagers. Question posts get 40-60% more comments — great for both leads and visibility.` }
    }

    // ═══ MODERATE ENGAGEMENT ═══

    if (totalEngagement >= 10) {
      actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'medium' })
      actions.push({ label: isLinkedIn ? 'Reply on post' : 'Draft reply', type: 'reply', priority: 'medium' })
      actions.push({ label: 'Use as content idea', type: 'content', priority: 'low' })
      return { actions, reason: `${totalEngagement} engagers. Worth scraping for leads and replying for visibility. Topic could inspire your own content.` }
    }

    if (totalEngagement >= 5) {
      if (matchedTopic) {
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'medium' })
        actions.push({ label: isLinkedIn ? 'Reply on post' : 'Draft reply', type: 'reply', priority: 'low' })
        return { actions, reason: `${totalEngagement} engagers on a topic your ICP cares about. Scrape for leads.` }
      }
      actions.push({ label: isLinkedIn ? 'Reply on post' : 'Draft reply', type: 'reply', priority: 'medium' })
      actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'low' })
      return { actions, reason: `${totalEngagement} engagers. Reply to get visible with ${item.author}'s audience.` }
    }

    // ═══ LOW ENGAGEMENT ═══

    actions.push({ label: 'Use as content idea', type: 'content', priority: 'low' })
    actions.push({ label: 'Skip', type: 'skip', priority: 'low' })
    return { actions, reason: `Low engagement (${totalEngagement}). Not worth scraping or replying. The topic might inspire your own post.` }
  }

  function profileUrl(platform: string, username: string): string {
    return `https://x.com/${username}`
  }

  function linkedinSearchUrl(name: string, headline?: string): string {
    // Extract company/role from headline to disambiguate common names
    const keywords = headline ? `${name} ${headline.split(',')[0]}` : name
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`
  }

  function renderSuggestionCard(s: { platform: string; username: string; name: string; reason: string; headline?: string; followers?: number }, i: number) {
    const isAdding = watchingInProgress === s.username
    const isX = s.platform === 'x'
    return (
      <div key={i} className="bg-white border border-rule rounded-[var(--radius)] px-4 py-3 flex items-center justify-between hover:border-accent transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
              !isX ? 'bg-accent/10 text-accent' : 'bg-[var(--accent-orange)]/10'
            }`} style={isX ? { color: 'var(--accent-orange)' } : undefined}>
              {isX ? 'X' : 'LinkedIn'}
            </span>
            {isX ? (
              <a href={profileUrl(s.platform, s.username)} target="_blank" rel="noopener noreferrer"
                className="font-head text-sm font-semibold text-ink hover:text-accent transition-colors">
                @{s.name}
              </a>
            ) : (
              <span className="font-head text-sm font-semibold text-ink">{s.name}</span>
            )}
            {s.followers && s.followers > 0 && (
              <span className="text-[10px] text-ink-4">{s.followers >= 1000 ? `${Math.round(s.followers / 1000)}K` : s.followers}</span>
            )}
            {!isX && (
              <a href={linkedinSearchUrl(s.name, s.headline)} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-accent hover:underline">
                Find on LinkedIn
              </a>
            )}
          </div>
          {s.headline && (
            <div className="text-[11px] text-ink-3 ml-0 mt-0.5 truncate">{s.headline}</div>
          )}
          <div className="text-[11px] text-ink-4 mt-0.5">{s.reason}</div>
        </div>
        <button
          className="btn-accent shrink-0 ml-3"
          disabled={isAdding}
          onClick={async () => {
            setWatchingInProgress(s.username)
            try {
              const res = await fetch('/api/watchlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: s.platform, username: s.username, display_name: s.name }),
              })
              const json = await res.json()
              if (json.success && json.data) {
                setWatchlist(prev => [json.data, ...prev])
                setWatchSuggestions(prev => prev.filter((_, j) => j !== i))
                fetchFeed(true)
              }
            } finally {
              setWatchingInProgress(null)
            }
          }}
        >
          {isAdding ? 'Loading...' : '+ Watch'}
        </button>
      </div>
    )
  }

  function getBrainSummary(): { focus: string; platform: 'linkedin' | 'x' | 'both'; topAction: string; why: string; stats: string } | null {
    const todoItems = feed.filter(f => !tasks[f.url])
    if (todoItems.length === 0) return null

    const liItems = todoItems.filter(f => f.platform === 'linkedin')
    const xItems = todoItems.filter(f => f.platform === 'x')

    // Score each platform by actionable opportunity
    const scorePlatform = (items: FeedItem[]) => {
      let score = 0
      let highPriority = 0
      let totalEngagement = 0
      for (const item of items) {
        const rec = getRecommendation(item)
        const eng = (item.engagement?.likes ?? 0) + (item.engagement?.replies ?? 0) + (item.engagement?.retweets ?? 0)
        totalEngagement += eng
        if (rec.actions[0]?.priority === 'high') { score += 3; highPriority++ }
        else if (rec.actions[0]?.priority === 'medium') score += 1
      }
      return { score, highPriority, totalEngagement, count: items.length }
    }

    const liScore = scorePlatform(liItems)
    const xScore = scorePlatform(xItems)

    // Find the single best post
    let bestItem: FeedItem | null = null
    let bestScore = -1
    for (const item of todoItems) {
      const rec = getRecommendation(item)
      const eng = (item.engagement?.likes ?? 0) + (item.engagement?.replies ?? 0) + (item.engagement?.retweets ?? 0)
      const s = (rec.actions[0]?.priority === 'high' ? 10 : rec.actions[0]?.priority === 'medium' ? 3 : 1) + eng * 0.01
      if (s > bestScore) { bestScore = s; bestItem = item }
    }

    const bestRec = bestItem ? getRecommendation(bestItem) : null
    const bestAction = bestRec?.actions[0]

    // Determine platform focus
    let platform: 'linkedin' | 'x' | 'both' = 'both'
    let focus = ''
    let stats = ''

    if (liScore.score > xScore.score * 2 && liItems.length > 0) {
      platform = 'linkedin'
      focus = 'Focus on LinkedIn today'
      stats = `${liScore.highPriority > 0 ? `${liScore.highPriority} high-priority` : `${liItems.length}`} posts worth acting on`
    } else if (xScore.score > liScore.score * 2 && xItems.length > 0) {
      platform = 'x'
      focus = 'Focus on X today'
      stats = `${xScore.highPriority > 0 ? `${xScore.highPriority} high-priority` : `${xItems.length}`} posts worth engaging`
    } else if (liItems.length > 0 && xItems.length > 0) {
      platform = 'both'
      focus = 'Activity on both platforms'
      stats = `${liItems.length} LinkedIn + ${xItems.length} X posts`
    } else if (liItems.length > 0) {
      platform = 'linkedin'
      focus = 'New LinkedIn activity'
      stats = `${liItems.length} posts to review`
    } else {
      platform = 'x'
      focus = 'New X activity'
      stats = `${xItems.length} posts to review`
    }

    // Build top action recommendation
    let topAction = ''
    let why = ''
    if (bestItem && bestAction) {
      const eng = (bestItem.engagement?.likes ?? 0) + (bestItem.engagement?.replies ?? 0) + (bestItem.engagement?.retweets ?? 0)
      if (bestAction.type === 'scrape') {
        const est = getEstimatedROI(bestItem)
        topAction = `Scrape ${bestItem.author}'s post`
        why = `${eng} engagers — est. ${est.scrape.icpLeads} ICP leads`
      } else if (bestAction.type === 'reply') {
        topAction = `Reply to ${bestItem.author}'s post`
        why = `${eng} engagers — your reply gets visibility with their audience`
      } else {
        topAction = `Check ${bestItem.author}'s post`
        why = bestRec?.reason.slice(0, 80) ?? ''
      }
    }

    return { focus, platform, topAction, why, stats }
  }

  function timeAgo(dateStr: string): string {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    if (isNaN(diff)) return ''
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  if (loading) return <div className="text-sm text-ink-4 py-8 text-center">Loading...</div>

  const linkedinWatchlist = watchlist.filter(w => w.platform === 'linkedin')
  const xWatchlist = watchlist.filter(w => w.platform === 'x')

  // Split feed into todo and done
  const linkedinTodo = feed.filter(f => f.platform === 'linkedin' && !tasks[f.url])
  const linkedinDone = feed.filter(f => f.platform === 'linkedin' && tasks[f.url])
  const xTodo = feed.filter(f => f.platform === 'x' && !tasks[f.url])
  const xDone = feed.filter(f => f.platform === 'x' && tasks[f.url])

  // ═══ NEW USER ═══
  if (watchlist.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10 pt-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full gradient-dot" />
            <span className="font-head text-xl font-bold text-ink">Feed</span>
          </div>
          <h1 className="font-head text-2xl font-bold text-ink mb-3">Your GTM starts with people</h1>
          <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed">
            Watch influencers your ICP follows. When they post, the brain tells you what to do and why.
          </p>
        </div>

        <div className="bg-white border border-rule rounded-[var(--radius)] p-6 mb-6">
          <div className="section-label mb-3">Add someone to watch</div>
          <div className="flex gap-3 mb-2">
            <input
              type="text"
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
              placeholder="LinkedIn URL or @handle..."
              className="input flex-1 py-3 px-4 text-sm"
              onKeyDown={e => { if (e.key === 'Enter') addToWatchlist() }}
            />
            <button onClick={addToWatchlist} disabled={adding || !addInput.trim()} className="btn-primary px-6 py-3">
              {adding ? '...' : 'Watch'}
            </button>
          </div>
          <div className="text-[11px] text-ink-4">
            e.g. linkedin.com/in/markroberge · @GergelyOrosz
          </div>
        </div>

        {/* AI suggestions */}
        {loadingSuggestions && (
          <div className="text-xs text-ink-4 mb-4 text-center">Finding creators your ICP follows...</div>
        )}
        {!loadingSuggestions && watchSuggestions.length === 0 && watchlist.length === 0 && (
          <div className="text-xs text-ink-4 mb-4 text-center">No suggestions yet — try refreshing the page</div>
        )}
        {watchSuggestions.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="section-label">Suggested for your ICP</div>
              <span className="text-[10px] text-ink-4">AI-generated — verify before watching</span>
            </div>
            <div className="flex flex-col gap-2">
              {watchSuggestions.map((s, i) => renderSuggestionCard(s, i))}
            </div>
          </div>
        )}

        <div className="brain-card">
          <div className="section-label mb-3">How it works</div>
          <div className="flex flex-col gap-4 text-xs text-ink-3 leading-relaxed">
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-[9px] font-bold shrink-0">1</div>
              <div><strong className="text-ink">They post</strong> → brain tells you what to do with it</div>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-[9px] font-bold shrink-0">2</div>
              <div><strong className="text-ink">LinkedIn</strong> → scrape engagers → find ICP → draft DMs</div>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: 'var(--accent-orange)' }}>3</div>
              <div><strong className="text-ink">X tweet</strong> → reply to build visibility with their audience</div>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: 'var(--gradient-main)', color: '#fff' }}>B</div>
              <div><strong className="text-ink">Brain learns</strong> → which posts, DMs, and replies actually work</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══ RETURNING USER ═══

  function matchesPerson(f: FeedItem, username: string, displayName?: string): boolean {
    const u = username.toLowerCase()
    return f.authorHandle.toLowerCase() === u
      || f.author.toLowerCase() === u
      || (displayName ? f.author.toLowerCase() === displayName.toLowerCase() : false)
  }

  const personFeed = selectedPerson
    ? feed.filter(f => matchesPerson(f, selectedPerson, watchlist.find(w => w.username === selectedPerson)?.display_name))
    : []
  const selectedEntry = selectedPerson
    ? watchlist.find(w => w.username === selectedPerson || w.display_name === selectedPerson)
    : null

  // ═══ PERSON DRILL-DOWN VIEW ═══
  if (selectedPerson) {
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => setSelectedPerson(null)} className="text-xs text-ink-4 hover:text-ink mb-4">
          ← Back to feed
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-2.5 h-2.5 rounded-full ${selectedEntry?.platform === 'linkedin' ? 'bg-accent' : ''}`}
            style={selectedEntry?.platform === 'x' ? { background: 'var(--accent-orange)' } : undefined} />
          <h2 className="font-head text-lg font-bold text-ink">
            {selectedEntry?.platform === 'x' ? '@' : ''}{selectedEntry?.display_name ?? selectedPerson}
          </h2>
          {selectedEntry && (
            <a href={selectedEntry.profile_url} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-accent hover:underline">
              View profile
            </a>
          )}
        </div>

        {personFeed.length === 0 ? (
          <div className="text-center py-8 text-xs text-ink-4">
            No recent posts found. They might not post often.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {personFeed.map((item, i) => {
              const isDone = !!tasks[item.url]
              const rec = getRecommendation(item)
              return (
                <div key={i} className={`bg-white border rounded-[var(--radius)] p-4 ${isDone ? 'border-rule opacity-60' : rec.actions[0]?.priority === 'high' ? 'border-accent' : 'border-rule'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] text-ink-4">{timeAgo(item.time)}</span>
                    {isDone && <span className="text-[10px] text-green-600 font-semibold">{tasks[item.url] === 'done' ? 'Done' : 'Skipped'}</span>}
                    {!isDone && rec.actions[0]?.priority === 'high' && (
                      <span className="text-[10px] text-accent font-bold uppercase tracking-wider">High priority</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-2 leading-relaxed mb-2">{item.text}</div>
                  {item.engagement && (
                    <div className="flex gap-3 text-[11px] text-ink-4 mb-2">
                      {(item.engagement.likes ?? 0) > 0 && <span>{item.engagement.likes} likes</span>}
                      {(item.engagement.replies ?? 0) > 0 && <span className="font-semibold text-accent">{item.engagement.replies} comments</span>}
                      {(item.engagement.retweets ?? 0) > 0 && <span>{item.engagement.retweets} {item.platform === 'linkedin' ? 'shares' : 'RTs'}</span>}
                    </div>
                  )}
                  {!isDone && (
                    <div className="flex flex-wrap gap-2">
                      {rec.actions.map((a, j) => {
                        if (a.type === 'scrape') return (
                          <Link key={j} href={`/find-leads?scrape=${encodeURIComponent(item.url)}`}
                            className={a.priority === 'high' ? 'btn-primary' : 'btn-accent'}
                            onClick={() => markDone(item.url, a.type)}>
                            {a.label}
                          </Link>
                        )
                        if (a.type === 'reply') return (
                          <button key={j} onClick={() => handleDraftReply(item)} disabled={draftingUrl === item.url}
                            className={a.priority === 'high' ? 'btn-primary' : 'btn-accent'}>
                            {draftingUrl === item.url ? 'Drafting...' : a.label}
                          </button>
                        )
                        if (a.type === 'content') return (
                          <button key={j} className="btn-outline" onClick={() => markDone(item.url, a.type)}>
                            {a.label}
                          </button>
                        )
                        if (a.type === 'skip') return (
                          <button key={j} onClick={() => markSkipped(item.url)} className="text-[11px] text-ink-4 hover:text-ink">Skip</button>
                        )
                        return null
                      })}
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-outline">View post</a>
                      {!rec.actions.find(a => a.type === 'skip') && (
                        <button onClick={() => markSkipped(item.url)} className="text-[11px] text-ink-4 hover:text-ink ml-auto">Skip</button>
                      )}
                    </div>
                  )}
                  {isDone && (
                    <button onClick={() => undoTask(item.url)} className="text-[10px] text-ink-4 hover:text-ink">Undo</button>
                  )}
                  {draftReplies[item.url] && (
                    <div className="mt-3 pt-3 border-t border-rule-light">
                      <div className="text-sm text-ink bg-[var(--bg-warm)] rounded-lg px-3 py-2 mb-2 leading-relaxed">{draftReplies[item.url]}</div>
                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => { copyAndOpen(draftReplies[item.url], item.url); markDone(item.url, 'reply') }}>
                          {copied === item.url ? 'Copied' : 'Copy & Open'}
                        </button>
                        <button className="btn-outline" onClick={() => handleDraftReply(item)}>Rewrite</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* ═══ ADD PEOPLE ═══ */}
      {showPeople && (
        <div className="mb-5 bg-white border border-rule rounded-[var(--radius)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] text-ink-4">Describe who you want to watch</div>
            <button onClick={() => setShowPeople(false)} className="text-[11px] text-ink-4 hover:text-ink">Done</button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="e.g. SaaS sales leaders, DevTools founders..."
              className="input flex-1 py-2 px-3 text-sm"
              onKeyDown={e => { if (e.key === 'Enter' && chatInput.trim()) chatFindPeople(chatInput.trim()) }}
              autoFocus
            />
            <button onClick={() => chatFindPeople(chatInput.trim())} disabled={chatLoading || !chatInput.trim()} className="btn-primary">
              {chatLoading ? '...' : 'Find'}
            </button>
          </div>

          {/* Suggestions */}
          {watchSuggestions.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {watchSuggestions.map((s, i) => renderSuggestionCard(s, i))}
            </div>
          )}
        </div>
      )}

      {/* ═══ FEED VIEW TOGGLE ═══ */}
      <div className="flex items-center gap-0 mb-4 border-b border-rule">
        {([['posts', 'Posts'], ['outreach', 'Outreach']] as const).map(([key, label]) => {
          const count = key === 'posts'
            ? feed.filter(f => !tasks[f.url]).length
            : outreachTotal
          return (
            <button
              key={key}
              onClick={() => {
                setFeedView(key)
                if (key === 'outreach' && outreachLeads.length === 0) fetchOutreach()
              }}
              className={`text-sm font-semibold px-4 py-2.5 border-b-[2px] transition-colors flex items-center gap-1.5 ${
                feedView === key ? 'text-ink border-accent' : 'text-ink-4 border-transparent hover:text-ink-3'
              }`}
            >
              {label}
              {count > 0 && <span className="badge-count">{count}</span>}
            </button>
          )
        })}
        <div className="ml-auto flex gap-1.5 pb-1.5">
          <button onClick={() => setShowPeople(!showPeople)} className={`text-xs px-2.5 py-1 rounded transition-colors ${showPeople ? 'bg-accent text-white' : 'btn-outline'}`}>
            + People
          </button>
          <button onClick={() => feedView === 'posts' ? fetchFeed(true) : fetchOutreach()} disabled={loadingFeed || loadingOutreach} className="btn-outline text-xs">
            {(loadingFeed || loadingOutreach) ? '...' : '↻'}
          </button>
        </div>
      </div>

      {/* ═══ OUTREACH VIEW ═══ */}
      {feedView === 'outreach' && (
        <>
          {loadingOutreach ? (
            <div className="text-sm text-ink-4 py-8 text-center">Loading leads...</div>
          ) : outreachLeads.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-sm text-ink-3 mb-2">No ICP leads yet</div>
              <div className="text-xs text-ink-4">Scrape a LinkedIn post from the Posts tab to find leads that match your ICP.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {outreachLeads.map(lead => {
                const hasDraft = !!lead.dm_draft
                const isDrafting = draftingDmId === lead.id
                return (
                  <div key={lead.id} className={`bg-white border rounded-[var(--radius)] p-4 ${
                    lead.comment_text ? 'border-accent' : 'border-rule'
                  }`}>
                    {/* Source post */}
                    {lead.sb_scrapes?.post_url && (
                      <a href={lead.sb_scrapes.post_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[10px] text-ink-4 hover:text-accent mb-2 transition-colors">
                        <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
                        From: {lead.sb_scrapes.post_topic ?? lead.sb_scrapes.post_url.replace(/https?:\/\/(www\.)?linkedin\.com\//, '').slice(0, 50)}
                      </a>
                    )}
                    {lead.comment_text && (
                      <div className="text-[10px] text-accent font-bold uppercase tracking-wider mb-1.5">Commented on this post</div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-head text-sm font-semibold text-ink">{lead.name}</div>
                        <div className="text-[11px] text-ink-3">{lead.title}</div>
                        {lead.company && <div className="text-[11px] text-ink-4">{lead.company}</div>}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                        lead.status === 'dm_drafted' ? 'bg-accent/10 text-accent' :
                        lead.status === 'dm_sent' ? 'bg-green-100 text-green-700' :
                        'bg-[var(--rule-light)] text-ink-4'
                      }`}>
                        {lead.status === 'dm_drafted' ? 'Draft ready' :
                         lead.status === 'dm_sent' ? 'Sent' :
                         lead.status === 'icp_filtered' ? 'ICP match' :
                         lead.status}
                      </span>
                    </div>

                    {lead.comment_text && (
                      <div className="mt-2 text-xs text-ink-2 bg-[var(--bg-warm)] rounded px-3 py-2 leading-relaxed">
                        &ldquo;{lead.comment_text}&rdquo;
                      </div>
                    )}

                    {hasDraft && (
                      <div className="mt-2 text-xs text-ink bg-[var(--bg-warm)] rounded px-3 py-2 leading-relaxed border-l-2 border-accent">
                        {lead.dm_draft}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      {!hasDraft && (
                        <button onClick={() => handleDraftDm(lead)} disabled={isDrafting}
                          className="btn-primary text-xs">
                          {isDrafting ? 'Drafting...' : 'Draft DM'}
                        </button>
                      )}
                      {hasDraft && (
                        <button onClick={() => {
                          navigator.clipboard.writeText(lead.dm_draft ?? '')
                          window.open(lead.linkedin_url, '_blank')
                        }} className="btn-primary text-xs">
                          Copy DM & Open
                        </button>
                      )}
                      <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="btn-outline text-xs">
                        View profile
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ POSTS VIEW ═══ */}
      {feedView === 'posts' && loadingFeed && (
        <div className="text-sm text-ink-4 py-8 text-center">
          <div className="mb-1">Loading posts from your watchlist...</div>
          <div className="text-[11px]">This can take 10-30 seconds (fetching from LinkedIn & X)</div>
        </div>
      )}
      {feedView === 'posts' && !loadingFeed && (
        <>
          {/* ═══ BRAIN SUMMARY ═══ */}
          {(() => {
            const summary = getBrainSummary()
            if (!summary) return null
            return (
              <div className="brain-card mb-6">
                <div className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                    summary.platform === 'linkedin' ? 'bg-accent' :
                    summary.platform === 'x' ? '' : 'gradient-dot'
                  }`} style={summary.platform === 'x' ? { background: 'var(--accent-orange)' } : summary.platform === 'both' ? { background: 'var(--gradient-main)' } : undefined} />
                  <div className="flex-1">
                    <div className="font-head text-sm font-bold text-ink mb-0.5">{summary.focus}</div>
                    <div className="text-[11px] text-ink-4 mb-2">{summary.stats}</div>
                    {summary.topAction && (
                      <div className="text-xs text-ink-2 leading-relaxed">
                        <span className="font-semibold text-accent">Start here:</span> {summary.topAction}
                        {summary.why && <span className="text-ink-4"> — {summary.why}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ═══ UNIFIED FEED — sorted by ROI ═══ */}
          {(() => {
            const allTodo = feed
              .filter(f => !tasks[f.url])
              .map(item => {
                const rec = getRecommendation(item)
                const eng = (item.engagement?.likes ?? 0) + (item.engagement?.replies ?? 0) + (item.engagement?.retweets ?? 0)
                const score = (rec.actions[0]?.priority === 'high' ? 100 : rec.actions[0]?.priority === 'medium' ? 30 : 1) + eng * 0.1
                return { item, rec, score }
              })
              .sort((a, b) => b.score - a.score)

            const allDone = feed.filter(f => tasks[f.url])

            if (allTodo.length === 0 && allDone.length === 0) {
              return (
                <div className="text-center py-12">
                  <div className="text-sm text-ink-3 mb-2">No posts in the last 24 hours</div>
                  <div className="text-xs text-ink-4">Your watched people haven&apos;t posted recently. Try adding more people or check back later.</div>
                </div>
              )
            }

            return (
              <>
                <div className="flex flex-col gap-2">
                  {allTodo.map(({ item, rec }, i) => {
                    const isLinkedIn = item.platform === 'linkedin'
                    const primaryAction = rec.actions[0]
                    const draftReply = draftReplies[item.url]
                    const est = getEstimatedROI(item)
                    const p = est.prefix
                    const accentColor = isLinkedIn ? undefined : 'var(--accent-orange)'

                    return (
                      <div key={i} className={`bg-white border rounded-[var(--radius)] p-4 ${
                        primaryAction?.priority === 'high' ? (isLinkedIn ? 'border-accent' : 'border-[var(--accent-orange)]') : 'border-rule'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLinkedIn ? 'bg-accent' : ''}`}
                            style={!isLinkedIn ? { background: 'var(--accent-orange)' } : undefined} />
                          <span className="font-head text-sm font-semibold text-ink">{item.author}</span>
                          <span className="text-[11px] text-ink-4">
                            {!isLinkedIn && `@${item.authorHandle} · `}{timeAgo(item.time)}
                          </span>
                          {primaryAction?.priority === 'high' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accentColor ?? 'var(--accent)' }}>
                              High ROI
                            </span>
                          )}
                          {(() => { const v = getVelocity(item); return v.velocity >= 2 ? (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${v.velocity >= 10 ? 'text-white' : 'bg-[var(--rule-light)] text-ink-3'}`}
                              style={v.velocity >= 10 ? { background: accentColor ?? 'var(--accent)' } : undefined}>
                              {v.velocity}/hr
                            </span>
                          ) : null })()}
                        </div>
                        {item.engagement && (
                          <div className="flex gap-3 text-[11px] text-ink-4 mb-1.5">
                            {(item.engagement.likes ?? 0) > 0 && <span>{item.engagement.likes?.toLocaleString()} likes</span>}
                            {(item.engagement.replies ?? 0) > 0 && <span className="font-semibold" style={{ color: accentColor ?? 'var(--accent)' }}>{item.engagement.replies} {isLinkedIn ? 'comments' : 'replies'}</span>}
                            {(item.engagement.retweets ?? 0) > 0 && <span>{item.engagement.retweets} {isLinkedIn ? 'shares' : 'RTs'}</span>}
                          </div>
                        )}
                        <div className="text-xs text-ink-2 leading-relaxed mb-2">{item.text}</div>

                        {/* Compact ROI — only show the primary action's ROI */}
                        <div className="text-[11px] text-ink-4 mb-2">
                          {primaryAction?.type === 'scrape' && <span>{p}{est.scrape.icpLeads} est. ICP leads → {p}{est.scrape.meetings} meetings</span>}
                          {primaryAction?.type === 'reply' && <span>{p}{est.reply.impressions} est. impressions → {p}{est.reply.followers} followers</span>}
                          {primaryAction?.type === 'content' && <span>{est.content.icpRate}% ICP topic match</span>}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {rec.actions.map((a, j) => {
                            if (a.type === 'scrape') return (
                              <Link key={j} href={`/find-leads?scrape=${encodeURIComponent(item.url)}`}
                                className={a.priority === 'high' ? 'btn-primary' : 'btn-accent'}
                                onClick={() => markDone(item.url, a.type)}>
                                {a.label}
                              </Link>
                            )
                            if (a.type === 'reply') return (
                              <button key={j} onClick={() => handleDraftReply(item)} disabled={draftingUrl === item.url}
                                className={a.priority === 'high' ? 'btn-primary' : 'btn-accent'}>
                                {draftingUrl === item.url ? 'Drafting...' : a.label}
                              </button>
                            )
                            if (a.type === 'content') return (
                              <button key={j} className="btn-outline" onClick={() => markDone(item.url, a.type)}>
                                {a.label}
                              </button>
                            )
                            if (a.type === 'skip') return (
                              <button key={j} onClick={() => markSkipped(item.url)} className="text-[11px] text-ink-4 hover:text-ink">Skip</button>
                            )
                            return null
                          })}
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-outline">
                            {isLinkedIn ? 'View post' : 'Open on X'}
                          </a>
                          {!rec.actions.find(a => a.type === 'skip') && (
                            <button onClick={() => markSkipped(item.url)} className="text-[11px] text-ink-4 hover:text-ink ml-auto">Skip</button>
                          )}
                        </div>

                        {draftReply && (
                          <div className="mt-3 pt-3 border-t border-rule-light">
                            <div className="text-sm text-ink bg-[var(--bg-warm)] rounded-lg px-3 py-2 mb-2 leading-relaxed">{draftReply}</div>
                            <div className="flex gap-2">
                              <button className="btn-primary" onClick={() => { copyAndOpen(draftReply, item.url); markDone(item.url, 'reply') }}>
                                {copied === item.url ? 'Copied' : 'Copy & Open'}
                              </button>
                              <button className="btn-outline" onClick={() => handleDraftReply(item)}>Rewrite</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {allDone.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[10px] text-ink-4 uppercase tracking-wider mb-2">Done today</div>
                    {allDone.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 text-xs text-ink-4">
                        <span>{tasks[item.url] === 'done' ? '✓' : '—'}</span>
                        <span className="line-through">{item.author}: {item.text.slice(0, 60)}...</span>
                        <button onClick={() => undoTask(item.url)} className="text-[10px] hover:text-ink ml-auto">Undo</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}
