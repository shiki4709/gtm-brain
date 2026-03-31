'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import ProgressWidget from '@/components/progress-widget'
import ModeSelector from '@/components/mode-selector'
import type { UserMode } from '@/lib/types'

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
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState<'all' | 'reply' | 'scrape' | 'content'>('all')
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
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
  const [icpTitles, setIcpTitles] = useState<string[]>([])
  const [trackKeywords, setTrackKeywords] = useState<string[]>([])
  // Chat state for discovering influencers

  // Draft reply state
  const [draftingUrl, setDraftingUrl] = useState<string | null>(null)
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [refineInput, setRefineInput] = useState<Record<string, string>>({}) // url → instruction
  const [refiningUrl, setRefiningUrl] = useState<string | null>(null)

  // Repurpose state
  const [repurposeUrl, setRepurposeUrl] = useState<string | null>(null) // which post is being repurposed
  const [repurposeLoading, setRepurposeLoading] = useState(false)
  const [repurposeContent, setRepurposeContent] = useState<Record<string, Record<string, string>>>({}) // url → { linkedin: '...', x: '...' }
  const [repurposeCopied, setRepurposeCopied] = useState<string | null>(null)
  const [repurposeEditing, setRepurposeEditing] = useState<Record<string, string>>({}) // platform → edited text
  const [repurposePosted, setRepurposePosted] = useState<Record<string, Set<string>>>({}) // url → Set of platforms posted to

  // Mode gate state
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [userMode, setUserMode] = useState<UserMode>('personal_brand')
  const [progressKey, setProgressKey] = useState(0)
  const [activeSection, setActiveSection] = useState<string>('engage')

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
      fetch('/api/user').then(r => r.json()),
    ]).then(async ([wlJson, liJson, roiJson, userJson]) => {
      if (userJson.success && userJson.data?.icp_config?.titles) {
        setIcpTitles(userJson.data.icp_config.titles)
        setTrackKeywords(userJson.data.icp_config.track_keywords ?? [])
      }
      if (userJson.success && userJson.data) {
        setUserMode(userJson.data.mode ?? 'personal_brand')
        if (!userJson.data.mode_set) setShowModeSelector(true)
      }
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

  async function handleRepurpose(item: FeedItem, format?: 'quote' | 'thread' | 'linkedin') {
    // If format specified, generate that specific format
    if (format) {
      setRepurposeUrl(item.url)
      setRepurposeLoading(true)
      try {
        const res = await fetch('/api/repurpose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: item.text,
            author: item.author,
            platform: item.platform,
            format,
          }),
        })
        const json = await res.json()
        if (json.success && json.content) {
          setRepurposeContent(prev => ({
            ...prev,
            [item.url]: { ...prev[item.url], ...json.content },
          }))
        }
      } catch { /* silently fail */ }
      finally { setRepurposeLoading(false) }
      return
    }
    // No format specified — just toggle the panel
    if (repurposeContent[item.url]) {
      setRepurposeUrl(repurposeUrl === item.url ? null : item.url)
      return
    }
    // Default: generate both LinkedIn + thread
    setRepurposeUrl(item.url)
    setRepurposeLoading(true)
    try {
      const res = await fetch('/api/repurpose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: item.text,
          author: item.author,
          platform: item.platform,
          platforms: ['linkedin', 'x'],
        }),
      })
      const json = await res.json()
      if (json.success && json.content) {
        setRepurposeContent(prev => ({ ...prev, [item.url]: json.content }))
      }
    } catch { /* silently fail */ }
    finally { setRepurposeLoading(false) }
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

  async function handleRefineReply(item: FeedItem, instruction: string) {
    if (!instruction.trim()) return
    setRefiningUrl(item.url)
    try {
      const currentDraft = draftReplies[item.url] ?? ''
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tweet_text: item.text,
          author_name: item.author,
          author_handle: item.authorHandle,
          refine_instruction: instruction,
          current_draft: currentDraft,
        }),
      })
      const json = await res.json()
      if (json.reply) {
        setDraftReplies(prev => ({ ...prev, [item.url]: json.reply }))
        setRefineInput(prev => ({ ...prev, [item.url]: '' }))
      }
    } catch { /* silently fail */ }
    finally { setRefiningUrl(null) }
  }

  function copyAndOpen(text: string, url: string, platform?: string) {
    navigator.clipboard.writeText(text)
    setCopied(url)
    window.open(url, '_blank')
    setTimeout(() => setCopied(null), 2000)
    // Log reply action (high-intent: opening the post to reply)
    fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: 'reply', post_id: url, platform: platform ?? 'x' }),
    }).catch(() => {})
  }

  function markDone(url: string, actionType?: string, platform?: string) {
    setTasks(prev => ({ ...prev, [url]: 'done' }))
    const item = feed.find(f => f.url === url)
    if (item) {
      const rec = getRecommendation(item)
      logBrainDecision(item, actionType ?? rec.actions[0]?.type ?? 'unknown', rec.actions[0]?.priority ?? 'medium', rec.reason, 'followed')
    }
    // Log action for goal tracking
    if (actionType && ['scrape', 'reply', 'dm_send'].includes(actionType)) {
      fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_type: actionType, post_id: url, platform: platform ?? 'x' }),
      }).catch(() => {})
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

  // GTM Action Framework — each action has distinct qualifying criteria
  // See skill: gtm-action-framework for the full decision matrix
  function getRecommendation(item: FeedItem): { actions: Array<{ label: string; type: 'scrape' | 'reply' | 'content' | 'skip'; priority: 'high' | 'medium' | 'low' }>; reason: string } {
    const likes = item.engagement?.likes ?? 0
    const comments = item.engagement?.replies ?? 0
    const rts = item.engagement?.retweets ?? 0
    const totalEngagement = likes + comments + rts
    const { velocity, ageHours } = getVelocity(item)
    const isLinkedIn = item.platform === 'linkedin'
    const isSubstantive = item.text.length >= 80

    // Mode-aware: suppress actions that don't match the user's goal
    const showScrape = userMode === 'b2b_outbound' || userMode === 'both'
    const showRepurpose = userMode === 'personal_brand' || userMode === 'both'

    type Action = { label: string; type: 'scrape' | 'reply' | 'content' | 'skip'; priority: 'high' | 'medium' | 'low' }
    const actions: Action[] = []
    const reasons: string[] = []

    // ═══ REPLY — Visibility play (always relevant) ═══
    const replyWindowOpen = ageHours < 12
    const lowReplyCount = comments < 20
    const highVisibility = totalEngagement >= 20 || velocity >= 10

    if (replyWindowOpen && highVisibility && lowReplyCount) {
      const isTrending = velocity >= 10 && ageHours < 6
      if (isTrending) {
        actions.push({ label: 'Reply now — trending', type: 'reply', priority: 'high' })
        reasons.push(`${velocity}/hr velocity, reply window open`)
      } else if (likes >= 30 && comments < 5) {
        actions.push({ label: 'Reply — you\'ll stand out', type: 'reply', priority: 'high' })
        reasons.push(`${likes} likes but only ${comments} replies — your reply stands out`)
      } else {
        actions.push({ label: 'Draft reply', type: 'reply', priority: 'medium' })
        reasons.push(`${totalEngagement} engagers, fresh post`)
      }
    }

    // ═══ SCRAPE — Lead gen play (B2B + both only) ═══
    if (showScrape) {
      const worthScraping = comments >= 10 || (isLinkedIn && totalEngagement >= 15)
      if (worthScraping) {
        if (comments >= 20 || (isLinkedIn && comments >= 10)) {
          actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'high' })
          reasons.push(`${comments} comments — high intent engagers`)
        } else {
          actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'medium' })
          reasons.push(`${totalEngagement} engagers worth scraping`)
        }
      }
    }

    // ═══ REPURPOSE — Authority play (personal brand + both only) ═══
    if (showRepurpose && isSubstantive && totalEngagement >= 5) {
      actions.push({ label: 'Use as content idea', type: 'content', priority: 'medium' })
      reasons.push(`substantive insight worth repurposing`)
    }

    // ═══ SKIP — nothing qualifies ═══
    if (actions.length === 0) {
      actions.push({ label: 'Skip', type: 'skip', priority: 'low' })
      return { actions, reason: `Low value — not enough engagement or substance to act on.` }
    }

    return { actions, reason: reasons.join(' · ') }
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

  // Brain Summary — takes the scored/filtered allTodo list, not raw feed
  function getBrainSummary(scoredItems: Array<{ item: FeedItem; rec: ReturnType<typeof getRecommendation>; score: number }>): { focus: string; platform: 'linkedin' | 'x' | 'both'; topAction: string; why: string; stats: string } | null {
    // Only count posts with real actions (not skip-only)
    const actionable = scoredItems.filter(({ rec }) => rec.actions[0]?.type !== 'skip')
    if (actionable.length === 0) return null

    const liItems = actionable.filter(({ item }) => item.platform === 'linkedin')
    const xItems = actionable.filter(({ item }) => item.platform === 'x')

    const highPriorityCount = actionable.filter(({ rec }) => rec.actions[0]?.priority === 'high').length

    // Best post is already first (sorted by score)
    const best = actionable[0]
    const bestAction = best.rec.actions[0]

    // Determine platform focus
    let platform: 'linkedin' | 'x' | 'both' = 'both'
    let focus = ''
    let stats = ''

    if (liItems.length > 0 && xItems.length === 0) {
      platform = 'linkedin'
      focus = 'Focus on LinkedIn today'
      stats = `${highPriorityCount > 0 ? `${highPriorityCount} high-priority` : `${actionable.length}`} actionable posts`
    } else if (xItems.length > 0 && liItems.length === 0) {
      platform = 'x'
      focus = 'Focus on X today'
      stats = `${highPriorityCount > 0 ? `${highPriorityCount} high-priority` : `${actionable.length}`} actionable posts`
    } else if (liItems.length > 0 && xItems.length > 0) {
      platform = liItems.length >= xItems.length ? 'linkedin' : 'x'
      focus = `Activity on both platforms`
      stats = `${actionable.length} actionable posts (${liItems.length} LinkedIn, ${xItems.length} X)`
    } else {
      platform = 'x'
      focus = 'New activity'
      stats = `${actionable.length} posts to review`
    }

    // Build top action recommendation from best scored post
    let topAction = ''
    let why = ''
    const bestItem = best.item
    const eng = (bestItem.engagement?.likes ?? 0) + (bestItem.engagement?.replies ?? 0) + (bestItem.engagement?.retweets ?? 0)
    if (bestAction?.type === 'scrape') {
      const est = getEstimatedROI(bestItem)
      topAction = `Scrape ${bestItem.author}'s post`
      why = `${eng} engagers — est. ${est.scrape.icpLeads} ICP leads`
    } else if (bestAction?.type === 'reply') {
      topAction = `Reply to ${bestItem.author}'s post`
      why = `${eng} engagers — your reply gets visibility with their audience`
    } else if (bestAction?.type === 'content') {
      topAction = `Repurpose ${bestItem.author}'s post`
      why = `ICP-relevant insight worth building on`
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
            {(userMode === 'b2b_outbound' || userMode === 'both') && (
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-[9px] font-bold shrink-0">2</div>
                <div><strong className="text-ink">Scrape engagers</strong> → find ICP matches → draft DMs → book meetings</div>
              </div>
            )}
            {(userMode === 'personal_brand' || userMode === 'both') && (
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: 'var(--accent-orange)' }}>{userMode === 'both' ? '3' : '2'}</div>
                <div><strong className="text-ink">Reply to trending posts</strong> → build visibility → grow your audience</div>
              </div>
            )}
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: 'var(--gradient-main)', color: '#fff' }}>B</div>
              <div><strong className="text-ink">Brain learns</strong> → what actually works for {userMode === 'b2b_outbound' ? 'booking meetings' : userMode === 'both' ? 'your goals' : 'growing your audience'}</div>
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

  // Goal-oriented sections — different tabs per mode
  const goalSections = (() => {
    const sections: Array<{ key: string; label: string; filterType: 'all' | 'reply' | 'scrape' | 'content'; count: number }> = []
    if (userMode === 'personal_brand') {
      sections.push({ key: 'engage', label: 'Reply', filterType: 'reply', count: 0 })
      sections.push({ key: 'create', label: 'Create', filterType: 'content', count: 0 })
    } else if (userMode === 'b2b_outbound') {
      sections.push({ key: 'prospect', label: 'Find leads', filterType: 'scrape', count: 0 })
      sections.push({ key: 'engage', label: 'Engage', filterType: 'reply', count: 0 })
    } else {
      sections.push({ key: 'engage', label: 'Reply', filterType: 'reply', count: 0 })
      sections.push({ key: 'create', label: 'Create', filterType: 'content', count: 0 })
      sections.push({ key: 'prospect', label: 'Find leads', filterType: 'scrape', count: 0 })
    }
    sections.push({ key: 'done', label: 'Done', filterType: 'all', count: 0 })
    return sections
  })()

  // Sync activeSection with actionFilter for backward compat
  const currentSection = goalSections.find(s => s.key === activeSection) ?? goalSections[0]
  const effectiveFilter = currentSection?.filterType ?? 'all'

  return (
    <div className="max-w-2xl mx-auto">
      {/* ═══ MODE SELECTOR GATE ═══ */}
      {showModeSelector && (
        <ModeSelector onComplete={(mode) => { setUserMode(mode); setShowModeSelector(false); setProgressKey(k => k + 1) }} />
      )}

      {/* ═══ MODE HEADER ═══ */}
      <div className="mb-4">
        <h1 className="font-head text-lg font-bold text-ink">
          {userMode === 'personal_brand' ? 'Build your audience' : userMode === 'b2b_outbound' ? 'Find and close leads' : 'Grow & prospect'}
        </h1>
        <p className="text-xs text-ink-4 mt-0.5">
          {userMode === 'personal_brand'
            ? 'Reply to trending posts and create content to grow your visibility.'
            : userMode === 'b2b_outbound'
              ? 'Scrape high-engagement posts for ICP leads and draft outreach DMs.'
              : 'Build presence and generate pipeline from the same feed.'}
        </p>
      </div>

      {/* ═══ METRICS DASHBOARD ═══ */}
      <ProgressWidget key={progressKey} mode={userMode} />

      {/* ═══ SECTION TABS (goal-oriented) ═══ */}
      <div className="flex items-center gap-0 mb-4 border-b border-rule">
        {goalSections.map(section => {
          const isActive = activeSection === section.key
          return (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              className={`font-head text-sm font-semibold px-4 py-2.5 border-b-[2px] transition-colors ${
                isActive ? 'text-ink border-accent' : 'text-ink-4 border-transparent hover:text-ink-3'
              }`}
            >
              {section.label}
              {section.count > 0 && (
                <span className="ml-1.5 badge-count">{section.count}</span>
              )}
            </button>
          )
        })}
        <div className="ml-auto pb-1.5">
          <button onClick={() => fetchFeed(true)} disabled={loadingFeed} className="btn-outline text-xs">
            {loadingFeed ? '...' : '\u21BB'}
          </button>
        </div>
      </div>

      {/* ═══ POSTS ═══ */}
      {loadingFeed && feed.length === 0 && (
        <div className="text-sm text-ink-4 py-8 text-center">
          <div className="mb-1">Loading posts from your watchlist...</div>
          <div className="text-[11px]">This can take 10-30 seconds (fetching from LinkedIn & X)</div>
        </div>
      )}
      {(feed.length > 0 || !loadingFeed) && (
        <>
          {/* ═══ UNIFIED FEED — sorted by ICP relevance + ROI ═══ */}
          {(() => {
            // Build ICP keyword set from user's actual ICP titles + topic insights
            // e.g. "Marketing Manager" → ["marketing", "manager"]
            // e.g. "Head of Sales" → ["head", "sales"]
            const icpWords = new Set<string>()
            const stopWords = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'for', 'to', 'at', 'on', 'vp', 'head', 'director', 'manager', 'chief', 'officer'])
            for (const title of icpTitles) {
              for (const word of title.toLowerCase().split(/[\s,/]+/)) {
                if (word.length > 2 && !stopWords.has(word)) {
                  icpWords.add(word)
                }
              }
            }
            // Add topic insights
            const topicKeywords: Array<{ keyword: string; rate: number }> = []
            if (insights?.topics) {
              for (const t of insights.topics) {
                if (t.avg_icp_rate > 0) topicKeywords.push({ keyword: t.topic.toLowerCase(), rate: t.avg_icp_rate })
              }
            }
            if (roi?.topic_rates) {
              for (const [topic, rate] of Object.entries(roi.topic_rates)) {
                topicKeywords.push({ keyword: topic.toLowerCase(), rate })
              }
            }

            // Word-boundary match — "ai" matches "ai" but not "raise" or "Oakland"
            function matchesWord(text: string, word: string): boolean {
              const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
              return re.test(text)
            }

            // Expand keywords with common related terms
            const RELATED_TERMS: Record<string, string[]> = {
              'ai': ['artificial intelligence', 'machine learning', 'ml', 'agents', 'agentic', 'gpt', 'chatbot', 'automation', 'neural', 'deep learning'],
              'llm': ['large language model', 'language model', 'foundation model', 'gpt', 'transformer'],
              'claude': ['anthropic'],
              'openai': ['chatgpt', 'gpt-4', 'gpt-5', 'gpt'],
              'gemini': ['google ai', 'deepmind'],
              'saas': ['software as a service', 'b2b software', 'subscription software'],
              'gtm': ['go to market', 'go-to-market'],
              'sales': ['selling', 'pipeline', 'quota', 'revenue', 'deals', 'prospecting'],
              'marketing': ['demand gen', 'content marketing', 'brand', 'campaigns'],
              'growth': ['scaling', 'product-led', 'plg', 'acquisition'],
            }

            function getExpandedKeywords(): string[] {
              const expanded = [...trackKeywords]
              for (const kw of trackKeywords) {
                const related = RELATED_TERMS[kw]
                if (related) expanded.push(...related)
              }
              return [...new Set(expanded)]
            }

            const expandedKeywords = getExpandedKeywords()

            function getIcpRelevance(text: string): { score: number; matchedTopic: string | null } {
              // 1. User-defined track keywords — exact match (strongest)
              const exactMatches = trackKeywords.filter(kw => matchesWord(text, kw))
              if (exactMatches.length >= 2) return { score: 0.6, matchedTopic: exactMatches.slice(0, 2).join(', ') }
              if (exactMatches.length === 1) return { score: 0.4, matchedTopic: exactMatches[0] }

              // 1b. Expanded/related keywords (strong — auto-inferred from user keywords)
              const relatedMatches = expandedKeywords.filter(kw => matchesWord(text, kw))
              if (relatedMatches.length >= 2) return { score: 0.35, matchedTopic: relatedMatches.slice(0, 2).join(', ') }
              if (relatedMatches.length === 1) return { score: 0.25, matchedTopic: relatedMatches[0] }

              // 2. Topic insights from past scrapes (strong — real conversion data)
              let bestRate = 0
              let bestTopic: string | null = null
              for (const { keyword, rate } of topicKeywords) {
                if (matchesWord(text, keyword) && rate > bestRate) {
                  bestRate = rate
                  bestTopic = keyword
                }
              }
              if (bestRate > 0) return { score: bestRate, matchedTopic: bestTopic }

              // 3. ICP title keywords (medium — inferred from job titles)
              const titleMatches = [...icpWords].filter(w => matchesWord(text, w))
              if (titleMatches.length >= 3) return { score: 0.5, matchedTopic: titleMatches.slice(0, 2).join(', ') }
              if (titleMatches.length === 2) return { score: 0.35, matchedTopic: titleMatches.join(', ') }
              if (titleMatches.length === 1) return { score: 0.2, matchedTopic: titleMatches[0] }

              return { score: 0, matchedTopic: null }
            }

            const allScored = feed
              .filter(f => !tasks[f.url])
              .map(item => {
                const rec = getRecommendation(item)
                const eng = (item.engagement?.likes ?? 0) + (item.engagement?.replies ?? 0) + (item.engagement?.retweets ?? 0)
                const icpRel = getIcpRelevance(item.text)
                const score =
                  (icpRel.score > 0 ? 200 * icpRel.score : 0) +
                  (rec.actions[0]?.priority === 'high' ? 100 : rec.actions[0]?.priority === 'medium' ? 30 : 1) +
                  eng * 0.1
                const primaryType = rec.actions[0]?.type ?? 'skip'
                return { item, rec, score, icpRelevance: icpRel, primaryType }
              })
              .sort((a, b) => b.score - a.score)

            // Update section counts
            for (const section of goalSections) {
              section.count = allScored.filter(s =>
                s.rec.actions.some(a => a.type === section.filterType)
              ).length
            }

            // Filter by action type
            // Off-topic + low engagement = hidden. Off-topic + high engagement = still shown (worth replying for visibility).
            const MIN_ENG_FOR_OFFTOPIC = 20

            const allTodo = effectiveFilter === 'all'
              ? allScored.filter(({ item, icpRelevance }) => {
                  if (icpRelevance.score > 0) return true
                  // Off-topic but high engagement — still worth engaging for visibility
                  const eng = (item.engagement?.likes ?? 0) + (item.engagement?.replies ?? 0) + (item.engagement?.retweets ?? 0)
                  return eng >= MIN_ENG_FOR_OFFTOPIC
                })
              : allScored.filter(({ item, rec, icpRelevance }) => {
                  if (!rec.actions.some(a => a.type === effectiveFilter)) return false
                  if (icpRelevance.score > 0) return true
                  // Off-topic: only show in Reply tab if high engagement (visibility play)
                  if (effectiveFilter === 'reply') {
                    const eng = (item.engagement?.likes ?? 0) + (item.engagement?.replies ?? 0) + (item.engagement?.retweets ?? 0)
                    return eng >= MIN_ENG_FOR_OFFTOPIC
                  }
                  // Scrape/Repurpose: must be ICP-relevant
                  if (effectiveFilter === 'content') {
                    if (item.text.length < 80) return false
                  }
                  return icpRelevance.score > 0
                })

            const allDone = feed.filter(f => tasks[f.url])

            if (allTodo.length === 0 && allDone.length === 0) {
              return (
                <div className="text-center py-12">
                  <div className="text-sm text-ink-3 mb-2">
                    {userMode === 'personal_brand' ? 'No posts to engage with right now' : userMode === 'b2b_outbound' ? 'No posts to scrape right now' : 'No posts in the last 24 hours'}
                  </div>
                  <div className="text-xs text-ink-4">
                    {userMode === 'personal_brand'
                      ? 'Your watched creators haven\u2019t posted recently. Add more in Settings.'
                      : 'Your watched accounts haven\u2019t posted recently. Try adding more people or check back later.'}
                  </div>
                </div>
              )
            }

            // Section descriptions — mode-aware
            const descsByMode: Record<string, Record<string, string>> = {
              personal_brand: {
                engage: 'Reply to these to get seen by their audience',
                create: 'Turn these into your own posts',
              },
              b2b_outbound: {
                prospect: 'Scrape these for ICP leads, then draft DMs',
                engage: 'Reply to get on their radar',
              },
              both: {
                engage: 'Reply to grow visibility',
                create: 'Turn into your own content',
                prospect: 'Scrape for leads and outreach',
              },
            }
            const descs = descsByMode[userMode] ?? descsByMode.personal_brand

            return (
              <>
                {/* Section header */}
                {currentSection && currentSection.key !== 'done' && (
                  <div className="brain-nudge mb-4">
                    <div className="brain-nudge-icon">{currentSection.key === 'engage' ? '\u{1F4AC}' : currentSection.key === 'create' ? '\u270F\uFE0F' : '\u{1F50D}'}</div>
                    <div>
                      <div className="font-head text-sm font-semibold text-ink">{descs[currentSection.key] ?? 'Posts for you'}</div>
                      <div className="text-[11px] text-ink-4 mt-0.5">{allTodo.length} {allTodo.length === 1 ? 'post' : 'posts'} to act on</div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {allTodo.map(({ item, rec, icpRelevance }, i) => {
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
                          {icpRelevance.score > 0 && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              icpRelevance.score >= 0.1 ? 'bg-green-100 text-green-700' : 'bg-[var(--rule-light)] text-ink-4'
                            }`}>
                              {icpRelevance.matchedTopic ? `ICP: ${icpRelevance.matchedTopic}` : 'ICP relevant'}
                            </span>
                          )}
                          {icpRelevance.score === 0 && (
                            <span className="text-[10px] text-ink-4 px-1.5 py-0.5 bg-[var(--rule-light)] rounded">Off-topic</span>
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

                        {/* ROI for the relevant action (mode-aware) */}
                        <div className="text-[11px] text-ink-4 mb-2">
                          {(userMode === 'b2b_outbound' || userMode === 'both') && (effectiveFilter === 'scrape' || (actionFilter === 'all' && primaryAction?.type === 'scrape')) && <span>{p}{est.scrape.icpLeads} est. ICP leads → {p}{est.scrape.meetings} meetings</span>}
                          {(effectiveFilter === 'reply' || (actionFilter === 'all' && primaryAction?.type === 'reply')) && <span>{p}{est.reply.impressions} est. impressions → {p}{est.reply.followers} followers</span>}
                          {(userMode === 'personal_brand' || userMode === 'both') && (effectiveFilter === 'content' || (actionFilter === 'all' && primaryAction?.type === 'content')) && <span>{est.content.icpRate}% ICP topic match</span>}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            // In All tab: only show primary action. In filtered tabs: show matching action.
                            const actionsToShow = effectiveFilter === 'all'
                              ? rec.actions.slice(0, 1)
                              : rec.actions.filter(a => a.type === effectiveFilter)

                            return actionsToShow.map((a, j) => {
                              if (a.type === 'scrape') return (
                                <Link key={j} href={`/find-leads?scrape=${encodeURIComponent(item.url)}`}
                                  className="btn-primary"
                                  onClick={() => markDone(item.url, a.type)}>
                                  {a.label}
                                </Link>
                              )
                              if (a.type === 'reply') return (
                                <button key={j} onClick={() => handleDraftReply(item)} disabled={draftingUrl === item.url}
                                  className="btn-primary">
                                  {draftingUrl === item.url ? 'Drafting...' : a.label}
                                </button>
                              )
                              if (a.type === 'content') return (
                                <span key={j} className="flex gap-1.5">
                                  <button className="btn-primary" onClick={() => handleRepurpose(item, 'quote')}
                                    disabled={repurposeLoading && repurposeUrl === item.url}>
                                    {repurposeLoading && repurposeUrl === item.url ? 'Generating...' : 'Quote tweet'}
                                  </button>
                                  <button className="btn-accent" onClick={() => handleRepurpose(item, 'thread')}
                                    disabled={repurposeLoading && repurposeUrl === item.url}>
                                    Write thread
                                  </button>
                                  {isLinkedIn ? null : (
                                    <button className="btn-outline" onClick={() => handleRepurpose(item, 'linkedin')}
                                      disabled={repurposeLoading && repurposeUrl === item.url}>
                                      LinkedIn post
                                    </button>
                                  )}
                                </span>
                              )
                              return null
                            })
                          })()}
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-outline">
                            {isLinkedIn ? 'View post' : 'Open on X'}
                          </a>
                          <button onClick={() => markSkipped(item.url)} className="text-[11px] text-ink-4 hover:text-ink ml-auto">Skip</button>
                        </div>

                        {/* Repurpose content panel */}
                        {repurposeUrl === item.url && repurposeContent[item.url] && (() => {
                          const posted = repurposePosted[item.url] ?? new Set<string>()
                          const FORMAT_LABELS: Record<string, string> = {
                            quote: 'Quote Tweet', thread: 'X Thread', linkedin: 'LinkedIn Post', x: 'X Thread',
                          }
                          // Show all generated formats
                          const formats = Object.keys(repurposeContent[item.url]).filter(k => repurposeContent[item.url][k])

                          return (
                            <div className="mt-3 pt-3 border-t border-rule-light">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-[10px] text-ink-4 uppercase tracking-wider">Your content</span>
                              </div>
                              <div className="flex flex-col gap-4">
                                {formats.map(platform => {
                                  const rawContent = repurposeContent[item.url][platform]
                                  if (!rawContent) return null
                                  const formatLabel = FORMAT_LABELS[platform] ?? platform
                                  const editKey = `${item.url}:${platform}`
                                  const isCopied = repurposeCopied === editKey
                                  const isPosted = posted.has(platform)
                                  const isRecommended = false // recommendation logic removed — format-based now
                                  const cleanContent = rawContent.replace(/\n---\s*$/, '').trim()

                                  function markPosted() {
                                    const text = platform === 'x'
                                      ? cleanContent.split(/\n---\n/).map(t => t.trim()).filter(Boolean).join('\n\n')
                                      : (repurposeEditing[editKey] ?? cleanContent)
                                    navigator.clipboard.writeText(text)
                                    setRepurposeCopied(editKey)
                                    setTimeout(() => setRepurposeCopied(null), 2000)
                                    setRepurposePosted(prev => {
                                      const current = new Set(prev[item.url] ?? [])
                                      current.add(platform)
                                      return { ...prev, [item.url]: current }
                                    })
                                  }

                                  if (platform === 'x' || platform === 'thread') {
                                    const tweets = cleanContent.split(/\n---\n/).map(t => t.trim()).filter(Boolean)
                                    return (
                                      <div key={platform}>
                                        <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--accent-orange)]/10" style={{ color: 'var(--accent-orange)' }}>
                                              {formatLabel} · {tweets.length} tweets
                                            </span>
                                            {isPosted && <span className="text-[9px] text-green font-semibold">Posted</span>}
                                          </div>
                                          <button className={`text-xs font-semibold ${isPosted ? 'btn-outline' : 'btn-primary'}`} onClick={markPosted}>
                                            {isCopied ? 'Copied!' : isPosted ? 'Copy again' : 'Copy & mark posted'}
                                          </button>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                          {tweets.map((tweet, ti) => (
                                            <div key={ti} className="bg-white border border-rule rounded-lg px-3 py-2.5">
                                              <div className="flex items-start gap-2">
                                                <span className="text-[10px] text-ink-4 font-semibold shrink-0 mt-0.5">{ti + 1}/{tweets.length}</span>
                                                <div className="flex-1">
                                                  <div className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{tweet}</div>
                                                  <div className={`text-[10px] mt-1 ${tweet.length > 270 ? 'text-red-500 font-semibold' : 'text-ink-4'}`}>
                                                    {tweet.length}/280
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  }

                                  // Quote tweet or LinkedIn post — single block rendering
                                  const isQuote = platform === 'quote'
                                  return (
                                    <div key={platform}>
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${isQuote ? 'bg-[var(--accent-orange)]/10' : 'bg-accent/10 text-accent'}`}
                                            style={isQuote ? { color: 'var(--accent-orange)' } : undefined}>
                                            {formatLabel}
                                          </span>
                                          {isPosted && <span className="text-[9px] text-green font-semibold">Posted</span>}
                                        </div>
                                        <button className={`text-xs font-semibold ${isPosted ? 'btn-outline' : 'btn-primary'}`} onClick={markPosted}>
                                          {isCopied ? 'Copied!' : isPosted ? 'Copy again' : 'Copy & mark posted'}
                                        </button>
                                      </div>
                                      <div className="bg-white border border-rule rounded-lg px-3 py-2.5">
                                        <textarea
                                          className="w-full text-xs text-ink leading-relaxed bg-transparent resize-none outline-none min-h-[120px]"
                                          value={repurposeEditing[editKey] ?? cleanContent}
                                          onChange={e => setRepurposeEditing(prev => ({ ...prev, [editKey]: e.target.value }))}
                                          onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
                                        />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              <div className="flex gap-2 mt-3">
                                {posted.size > 0 && (
                                  <button className="btn-primary text-xs" onClick={() => { markDone(item.url, 'content'); setRepurposeUrl(null) }}>
                                    Done
                                  </button>
                                )}
                                <button className="btn-outline text-xs" onClick={() => setRepurposeUrl(null)}>
                                  Close
                                </button>
                              </div>
                            </div>
                          )
                        })()}

                        {draftReply && effectiveFilter !== 'scrape' && (
                          <div className="mt-3 pt-3 border-t border-rule-light">
                            <div className="text-sm text-ink bg-[var(--bg-warm)] rounded-lg px-3 py-2 mb-2 leading-relaxed">{draftReply}</div>
                            <div className="flex gap-2 mb-2">
                              <button className="btn-primary" onClick={() => { copyAndOpen(draftReply, item.url); markDone(item.url, 'reply') }}>
                                {copied === item.url ? 'Copied!' : 'Copy & Open tweet'}
                              </button>
                            </div>
                            {/* Refine input */}
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={refineInput[item.url] ?? ''}
                                onChange={e => setRefineInput(prev => ({ ...prev, [item.url]: e.target.value }))}
                                placeholder="e.g. make it punchier, add a question, be more contrarian..."
                                className="input flex-1 py-1.5 px-3 text-xs"
                                onKeyDown={e => { if (e.key === 'Enter' && (refineInput[item.url] ?? '').trim()) handleRefineReply(item, refineInput[item.url]) }}
                              />
                              <button
                                className="btn-outline text-xs"
                                disabled={!(refineInput[item.url] ?? '').trim() || refiningUrl === item.url}
                                onClick={() => handleRefineReply(item, refineInput[item.url] ?? '')}
                              >
                                {refiningUrl === item.url ? '...' : 'Refine'}
                              </button>
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
