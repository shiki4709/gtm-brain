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

export default function WatchlistFeed() {
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null) // username to drill into
  const [showPeople, setShowPeople] = useState(false) // collapsible people section
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [insights, setInsights] = useState<LinkedInInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [addPlatform] = useState<'linkedin' | 'x'>('linkedin')
  const [adding, setAdding] = useState(false)
  const [tasks, setTasks] = useState<TaskState>({})
  const [roi, setRoi] = useState<RoiData | null>(null)
  const [watchSuggestions, setWatchSuggestions] = useState<Array<{ platform: string; username: string; name: string; reason: string; headline?: string; followers?: number }>>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [watchingInProgress, setWatchingInProgress] = useState<string | null>(null) // username being added

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

  async function addToWatchlist() {
    if (!addInput.trim()) return
    setAdding(true)
    let platform = addPlatform
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
      {/* ═══ PEOPLE SECTION (collapsible) ═══ */}
      <div className="mb-6">
        <button
          onClick={() => setShowPeople(!showPeople)}
          className="flex items-center gap-2 w-full text-left mb-3"
        >
          <span className="text-[11px] text-ink-4">{showPeople ? '▼' : '▶'}</span>
          <span className="section-label">Watching ({watchlist.length})</span>
          {!showPeople && watchlist.length > 0 && (
            <div className="flex gap-1 ml-1">
              {watchlist.slice(0, 5).map(w => (
                <span key={w.id} className="text-[10px] text-ink-4 px-2 py-0.5 bg-[var(--rule-light)] rounded-full">
                  {w.platform === 'x' ? '@' : ''}{w.display_name ?? w.username}
                </span>
              ))}
              {watchlist.length > 5 && <span className="text-[10px] text-ink-4">+{watchlist.length - 5}</span>}
            </div>
          )}
        </button>

        {showPeople && (
          <>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={addInput}
                onChange={e => setAddInput(e.target.value)}
                placeholder="LinkedIn URL or @handle..."
                className="input flex-1 py-2 px-3 text-sm"
                onKeyDown={e => { if (e.key === 'Enter') addToWatchlist() }}
              />
              <button onClick={addToWatchlist} disabled={adding || !addInput.trim()} className="btn-accent">
                {adding ? '...' : '+ Watch'}
              </button>
            </div>

            {/* Suggestions */}
            {watchSuggestions.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-ink-4">AI suggestions — verify before watching</span>
                </div>
                <div className="flex flex-col gap-2">
                  {watchSuggestions.map((s, i) => renderSuggestionCard(s, i))}
                </div>
              </div>
            )}

            {/* People list */}
            <div className="flex flex-col gap-1.5">
              {watchlist.map(w => {
                const postCount = feed.filter(f => matchesPerson(f, w.username, w.display_name)).length
                const unactedCount = feed.filter(f => matchesPerson(f, w.username, w.display_name) && !tasks[f.url]).length
                return (
                  <div key={w.id} className="flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] hover:bg-[var(--bg-warm)] transition-colors">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${w.platform === 'linkedin' ? 'bg-accent' : ''}`}
                      style={w.platform === 'x' ? { background: 'var(--accent-orange)' } : undefined} />
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => setSelectedPerson(w.username)}
                    >
                      <span className="text-sm font-semibold text-ink hover:text-accent transition-colors">
                        {w.platform === 'x' ? '@' : ''}{w.display_name ?? w.username}
                      </span>
                      <span className="text-[11px] text-ink-4 ml-2">
                        {postCount > 0 ? `${unactedCount} new` : 'no posts'}
                      </span>
                    </button>
                    {unactedCount > 0 && <span className="badge-count text-[9px]">{unactedCount}</span>}
                    <button onClick={() => removeFromWatchlist(w.id)} className="text-[11px] text-ink-4 hover:text-ink shrink-0">×</button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ═══ FEED ═══ */}
      <div className="flex items-center justify-between mb-4">
        <div className="section-label">
          {feed.filter(f => !tasks[f.url]).length > 0
            ? `${feed.filter(f => !tasks[f.url]).length} actions`
            : 'No new actions'}
        </div>
        <button onClick={() => fetchFeed(true)} disabled={loadingFeed} className="btn-outline text-xs">
          {loadingFeed ? '...' : '↻ Refresh'}
        </button>
      </div>

      {loadingFeed ? (
        <div className="text-sm text-ink-4 py-8 text-center">
          <div className="mb-1">Loading posts from your watchlist...</div>
          <div className="text-[11px]">This can take 10-30 seconds (fetching from LinkedIn & X)</div>
        </div>
      ) : (
        <>
          {/* ═══ LINKEDIN TASKS ═══ */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <h2 className="font-head text-base font-bold text-ink">LinkedIn</h2>
                {linkedinTodo.length > 0 && (
                  <span className="badge-count">{linkedinTodo.length}</span>
                )}
              </div>
              {/* Watching badges */}
              <div className="flex flex-wrap gap-1">
                {linkedinWatchlist.map(w => (
                  <span key={w.id} className="text-[10px] text-ink-4 px-2 py-0.5 bg-[var(--rule-light)] rounded-full flex items-center gap-1">
                    {w.display_name ?? w.username}
                    <button onClick={() => removeFromWatchlist(w.id)} className="hover:text-ink">×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Todo */}
            {linkedinTodo.length > 0 ? (
              <div className="flex flex-col gap-2">
                {linkedinTodo.map((item, i) => {
                  const rec = getRecommendation(item)
                  const primaryAction = rec.actions[0]
                  return (
                    <div key={i} className={`bg-white border rounded-[var(--radius)] p-4 ${
                      primaryAction?.priority === 'high' ? 'border-accent' : 'border-rule'
                    }`}>
                      {primaryAction?.priority === 'high' && (
                        <div className="text-[10px] text-accent font-bold uppercase tracking-wider mb-2">High priority</div>
                      )}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-head text-sm font-semibold text-ink">{item.author}</span>
                        <span className="text-[11px] text-ink-4">{timeAgo(item.time)}</span>
                        {(() => { const v = getVelocity(item); return v.velocity >= 2 ? (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${v.velocity >= 10 ? 'bg-accent text-white' : 'bg-[var(--rule-light)] text-ink-3'}`}>
                            {v.velocity}/hr
                          </span>
                        ) : null })()}
                      </div>
                      {item.engagement && (
                        <div className="flex gap-3 text-[11px] text-ink-4 mb-2">
                          {(item.engagement.likes ?? 0) > 0 && <span>{item.engagement.likes} likes</span>}
                          {(item.engagement.replies ?? 0) > 0 && <span className="font-semibold text-accent">{item.engagement.replies} comments</span>}
                          {(item.engagement.retweets ?? 0) > 0 && <span>{item.engagement.retweets} shares</span>}
                        </div>
                      )}
                      <div className="text-xs text-ink-2 leading-relaxed mb-2">{item.text}</div>

                      {/* ROI estimates */}
                      {(() => {
                        const est = getEstimatedROI(item)
                        const p = est.prefix
                        return (
                          <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
                            <div className="bg-[var(--bg-warm)] rounded px-2.5 py-2">
                              <div className="font-semibold text-accent">Scrape</div>
                              <div className="text-ink-2">{p}{est.scrape.icpLeads} ICP leads</div>
                              {est.scrape.replies > 0 && <div className="text-ink-4">{p}{est.scrape.replies} replies → {p}{est.scrape.meetings} meetings</div>}
                            </div>
                            <div className="bg-[var(--bg-warm)] rounded px-2.5 py-2">
                              <div className="font-semibold text-accent">Reply</div>
                              <div className="text-ink-2">{p}{est.reply.impressions} impressions</div>
                              <div className="text-ink-4">{p}{est.reply.followers} followers</div>
                            </div>
                            <div className="bg-[var(--bg-warm)] rounded px-2.5 py-2">
                              <div className="font-semibold text-accent">Content</div>
                              <div className="text-ink-2">{p}{est.content.inboundLeads} inbound leads</div>
                              <div className="text-ink-4">{est.content.icpRate}% ICP topic</div>
                            </div>
                          </div>
                        )
                      })()}

                      <div className="flex flex-wrap gap-2">
                        {rec.actions.map((a, j) => {
                          if (a.type === 'scrape') return (
                            <Link key={j} href={`/find-leads?scrape=${encodeURIComponent(item.url)}`}
                              className={a.priority === 'high' ? 'btn-primary' : 'btn-accent'}
                              onClick={() => markDone(item.url, a.type)}>
                              {a.label}
                            </Link>
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
                    </div>
                  )
                })}
              </div>
            ) : linkedinWatchlist.length > 0 ? (
              <div className="text-center py-6 text-xs text-ink-4">No posts found in the last 30 days. They might not post often — try watching someone more active.</div>
            ) : (
              <div className="border border-dashed border-rule rounded-[var(--radius)] p-4 text-center">
                <div className="text-xs text-ink-4 mb-2">Add LinkedIn profiles to watch</div>
                <input
                  type="text"
                  placeholder="linkedin.com/in/markroberge"
                  className="input py-2 px-3 text-sm max-w-sm mx-auto"
                  onKeyDown={e => { if (e.key === 'Enter') { setAddInput((e.target as HTMLInputElement).value); addToWatchlist() } }}
                />
              </div>
            )}

            {/* Done */}
            {linkedinDone.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] text-ink-4 uppercase tracking-wider mb-2">Done today</div>
                {linkedinDone.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 text-xs text-ink-4">
                    <span>{tasks[item.url] === 'done' ? '✓' : '—'}</span>
                    <span className="line-through">{item.author}: {item.text.slice(0, 60)}...</span>
                    <button onClick={() => undoTask(item.url)} className="text-[10px] hover:text-ink ml-auto">Undo</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══ X TASKS ═══ */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-orange)' }} />
                <h2 className="font-head text-base font-bold text-ink">X</h2>
                {xTodo.length > 0 && (
                  <span className="badge-count">{xTodo.length}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {xWatchlist.map(w => (
                  <span key={w.id} className="text-[10px] text-ink-4 px-2 py-0.5 bg-[var(--rule-light)] rounded-full flex items-center gap-1">
                    @{w.display_name ?? w.username}
                    <button onClick={() => removeFromWatchlist(w.id)} className="hover:text-ink">×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Todo */}
            {xTodo.length > 0 ? (
              <div className="flex flex-col gap-2">
                {xTodo.map((item, i) => {
                  const rec = getRecommendation(item)
                  const draftReply = draftReplies[item.url]
                  return (
                    <div key={i} className={`bg-white border rounded-[var(--radius)] p-4 ${
                      rec.actions[0]?.priority === 'high' ? 'border-[var(--accent-orange)]' : 'border-rule'
                    }`}>
                      {rec.actions[0]?.priority === 'high' && (
                        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--accent-orange)' }}>
                          {(item.engagement?.likes ?? 0) >= 100 ? '🔥 Viral — reply now' : 'High priority'}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-head text-sm font-semibold text-ink">{item.author}</span>
                        <span className="text-[11px] text-ink-4">@{item.authorHandle} · {timeAgo(item.time)}</span>
                        {(() => { const v = getVelocity(item); return v.velocity >= 2 ? (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${v.velocity >= 10 ? 'text-white' : 'bg-[var(--rule-light)] text-ink-3'}`}
                            style={v.velocity >= 10 ? { background: 'var(--accent-orange)' } : undefined}>
                            {v.velocity}/hr
                          </span>
                        ) : null })()}
                      </div>
                      <div className="text-xs text-ink-2 leading-relaxed mb-1">{item.text}</div>
                      {item.engagement && (
                        <div className="flex gap-3 text-[11px] text-ink-4 mb-2">
                          <span>{item.engagement.likes?.toLocaleString()} likes</span>
                          {(item.engagement.replies ?? 0) > 0 && (
                            <span className="font-semibold" style={{ color: 'var(--accent-orange)' }}>{item.engagement.replies} replies</span>
                          )}
                          <span>{item.engagement.retweets} RTs</span>
                        </div>
                      )}

                      {/* ROI estimates */}
                      {(() => {
                        const est = getEstimatedROI(item)
                        const p = est.prefix
                        return (
                          <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
                            <div className="bg-[var(--bg-warm)] rounded px-2.5 py-2">
                              <div className="font-semibold" style={{ color: 'var(--accent-orange)' }}>Reply</div>
                              <div className="text-ink-2">{p}{est.reply.impressions} impressions</div>
                              <div className="text-ink-4">{p}{est.reply.followers} followers</div>
                            </div>
                            <div className="bg-[var(--bg-warm)] rounded px-2.5 py-2">
                              <div className="font-semibold" style={{ color: 'var(--accent-orange)' }}>Scrape</div>
                              <div className="text-ink-2">{p}{est.scrape.icpLeads} ICP leads</div>
                              {est.scrape.replies > 0 && <div className="text-ink-4">{p}{est.scrape.replies} replies</div>}
                            </div>
                            <div className="bg-[var(--bg-warm)] rounded px-2.5 py-2">
                              <div className="font-semibold" style={{ color: 'var(--accent-orange)' }}>Content</div>
                              <div className="text-ink-2">{p}{est.content.inboundLeads} inbound leads</div>
                              <div className="text-ink-4">{est.content.icpRate}% ICP topic</div>
                            </div>
                          </div>
                        )
                      })()}
                      <div className="flex flex-wrap gap-2">
                        {rec.actions.map((a, j) => {
                          if (a.type === 'reply') return (
                            <button key={j} onClick={() => handleDraftReply(item)} disabled={draftingUrl === item.url}
                              className={a.priority === 'high' ? 'btn-primary' : 'btn-accent'}>
                              {draftingUrl === item.url ? 'Drafting...' : a.label}
                            </button>
                          )
                          if (a.type === 'scrape') return (
                            <Link key={j} href={`/find-leads?scrape=${encodeURIComponent(item.url)}`}
                              className={a.priority === 'high' ? 'btn-primary' : 'btn-outline'}
                              onClick={() => markDone(item.url, a.type)}>
                              {a.label}
                            </Link>
                          )
                          if (a.type === 'content') return (
                            <button key={j} className="btn-outline" onClick={() => markDone(item.url, a.type)}>
                              {a.label}
                            </button>
                          )
                          return null
                        })}
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-outline">Open on X</a>
                        <button onClick={() => markSkipped(item.url)} className="text-[11px] text-ink-4 hover:text-ink ml-auto">Skip</button>
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
            ) : xWatchlist.length > 0 ? (
              <div className="text-center py-6 text-xs text-ink-4">No recent tweets found. The handle might be wrong or they haven&apos;t posted recently. Try removing and re-adding with the correct handle.</div>
            ) : (
              <div className="border border-dashed border-rule rounded-[var(--radius)] p-4 text-center">
                <div className="text-xs text-ink-4 mb-2">Add X accounts to watch</div>
                <input
                  type="text"
                  placeholder="@markroberge"
                  className="input py-2 px-3 text-sm max-w-sm mx-auto"
                  onKeyDown={e => { if (e.key === 'Enter') { setAddInput((e.target as HTMLInputElement).value); addToWatchlist() } }}
                />
              </div>
            )}

            {/* Done */}
            {xDone.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] text-ink-4 uppercase tracking-wider mb-2">Done today</div>
                {xDone.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 text-xs text-ink-4">
                    <span>{tasks[item.url] === 'done' ? '✓' : '—'}</span>
                    <span className="line-through">{item.author}: {item.text.slice(0, 60)}...</span>
                    <button onClick={() => undoTask(item.url)} className="text-[10px] hover:text-ink ml-auto">Undo</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
