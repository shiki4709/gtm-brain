'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import ModeSelector from '@/components/mode-selector'
import ContentCalendar from '@/components/content-calendar'
import type { UserMode } from '@/lib/types'
import { getIcpRelevance, getPlaybookBonus, type UserScoringConfig, type ProfileScoreOverride } from '@/lib/scoring'

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
  const [tasks, setTasks] = useState<TaskState>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('gtm-brain-tasks') ?? '{}') } catch { return {} }
  })
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
  const [activeSection, setActiveSection] = useState<string>('engage')
  const [activeView, setActiveView] = useState<'dashboard' | 'feed' | 'create'>('dashboard')
  const [feedLoaded, setFeedLoaded] = useState(false)

  // Onboarding guide state
  const [hasActions, setHasActions] = useState(true) // assume true to avoid flash
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    if (typeof window === 'undefined') return true
    try { return localStorage.getItem('gtm-brain-onboarding-dismissed') === 'true' } catch { return false }
  })

  // Community posts (Reddit/HN)
  const [communityPosts, setCommunityPosts] = useState<Array<{
    platform: 'reddit' | 'hackernews'; title: string; text: string; url: string
    commentsUrl: string; score: number; comments: number; author: string; subreddit?: string; time?: string
  }>>([])
  const [loadingCommunity, setLoadingCommunity] = useState(false)

  // Create flow — angle detection + generation
  const [createInput, setCreateInput] = useState('')
  const [createShowText, setCreateShowText] = useState(false)
  const [createAnalyzing, setCreateAnalyzing] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createAngles, setCreateAngles] = useState<Array<{
    id: string; type: string; title: string; summary: string; platforms: string[]; mentions: string[]
  }>>([])
  const [createSummary, setCreateSummary] = useState('')
  const [createGenerating, setCreateGenerating] = useState<string | null>(null) // angle id being generated
  const [createResults, setCreateResults] = useState<Record<string, Record<string, string>>>({}) // angleId → { platform: content }

  // Activity timeline state
  const [activityData, setActivityData] = useState<Record<string, Array<{
    id: string; action_type: string; platform: string | null; label: string
    content_preview: string | null; created_at: string
  }>>>({})
  const [activityOpen, setActivityOpen] = useState(true)

  // Growth chart state
  const [growthFollowers, setGrowthFollowers] = useState<Array<{ date: string; value: number }>>([])
  const [growthConnections, setGrowthConnections] = useState<Array<{ date: string; value: number }>>([])

  // Weekly brief state
  const [weeklyBrief, setWeeklyBrief] = useState<{
    brief: string
    patterns: { mostActiveDay: string; avgActionsPerDay: number; notificationActRate: number; topAction: string; trend: string }
    generatedAt: string
  } | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefMessage, setBriefMessage] = useState<string | null>(null)
  const [growthActions, setGrowthActions] = useState<Array<{ date: string; count: number }>>([])

  // Profile-based scoring state
  const [profileScores, setProfileScores] = useState<Record<string, { score: number; topic: string | null; reason: string }>>({})
  const [profileInterests, setProfileInterests] = useState<string[]>([])
  const [profileScoring, setProfileScoring] = useState(false)

  // Fetch profile scores when feed changes
  useEffect(() => {
    if (feed.length === 0) return
    let cancelled = false
    setProfileScoring(true)

    const posts = feed.map(f => ({ url: f.url, text: f.text, author: f.authorHandle }))
    fetch('/api/profile-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.success && data.scores) {
          setProfileScores(data.scores)
          if (data.profile?.interests) setProfileInterests(data.profile.interests)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setProfileScoring(false) })

    return () => { cancelled = true }
  }, [feed])

  function looksLikeUrl(s: string): boolean {
    const t = s.trim()
    return t.startsWith('http://') || t.startsWith('https://') || t.includes('.com/') || t.includes('.co/')
  }

  async function handleAnalyzeAngles(textOverride?: string) {
    const input = textOverride ?? createInput.trim()
    if (!input) return
    setCreateAnalyzing(true)
    setCreateError('')
    setCreateAngles([])
    setCreateResults({})

    try {
      const isUrl = looksLikeUrl(input) && !textOverride
      const res = await fetch('/api/analyze-angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isUrl ? { url: input } : { text: input }),
      })
      const json = await res.json()
      if (json.success && json.data?.angles) {
        setCreateAngles(json.data.angles)
        setCreateSummary(json.data.summary ?? '')
        setCreateShowText(false)
      } else if (json.error === 'paste_text') {
        setCreateShowText(true)
      } else {
        setCreateError(json.error ?? 'Analysis failed')
      }
    } catch {
      setCreateError('Failed to connect')
    } finally {
      setCreateAnalyzing(false)
    }
  }

  async function handleGenerateFromAngle(angleId: string, platform: string) {
    const angle = createAngles.find(a => a.id === angleId)
    if (!angle) return
    setCreateGenerating(angleId)
    try {
      const format = platform === 'linkedin' ? 'linkedin' : platform === 'x' ? 'thread' : 'quote'
      const res = await fetch('/api/repurpose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `ANGLE: ${angle.title}\n${angle.summary}\n\nSOURCE: ${createSummary}`,
          author: 'unknown',
          platform: 'x',
          format,
        }),
      })
      const json = await res.json()
      if (json.success && json.content) {
        setCreateResults(prev => ({
          ...prev,
          [angleId]: { ...prev[angleId], ...json.content },
        }))
        // Auto-log content creation
        const actionMap: Record<string, string> = { quote: 'x_quote', thread: 'x_thread', linkedin: 'li_post' }
        const actionType = actionMap[format]
        if (actionType) {
          fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action_type: actionType }) }).catch(() => {})
        }
      }
    } catch { /* */ }
    finally { setCreateGenerating(null) }
  }

  // Persist tasks (skips/done) to localStorage
  useEffect(() => {
    try { localStorage.setItem('gtm-brain-tasks', JSON.stringify(tasks)) } catch { /* */ }
  }, [tasks])

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
      fetch('/api/actions').then(r => r.json()),
      fetch('/api/activity').then(r => r.json()),
      fetch('/api/growth').then(r => r.json()),
    ]).then(async ([wlJson, liJson, roiJson, userJson, actionsJson, activityJson, growthJson]) => {
      // Check if user has any action log entries
      if (actionsJson.success) {
        setHasActions((actionsJson.items ?? []).length > 0)
      }
      if (userJson.success && userJson.data?.icp_config?.titles) {
        setIcpTitles(userJson.data.icp_config.titles)
        setTrackKeywords(userJson.data.icp_config.track_keywords ?? [])
      }
      if (userJson.success && userJson.data) {
        setUserMode(userJson.data.mode ?? 'personal_brand')
        if (!userJson.data.mode_set) setShowModeSelector(true)
      }
      if (activityJson.success && activityJson.data) setActivityData(activityJson.data)
      if (growthJson.success && growthJson.data) {
        setGrowthFollowers(growthJson.data.followers ?? [])
        setGrowthConnections(growthJson.data.connections ?? [])
        setGrowthActions(growthJson.data.actions ?? [])
      }
      if (roiJson.success) setRoi(roiJson.data)
      if (wlJson.success) setWatchlist(wlJson.data ?? [])
      if (liJson.success) setInsights(liJson.data)
      if (wlJson.data?.length > 0) {
        fetchSuggestions()
      } else {
        fetchSuggestions()
      }
    }).catch(() => {}).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load feed lazily when user switches to feed view
  useEffect(() => {
    if (activeView === 'feed' && !feedLoaded && watchlist.length > 0 && !loadingFeed) {
      fetchFeed()
      setFeedLoaded(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, watchlist.length])

  // Load community posts when tab selected
  useEffect(() => {
    if (activeSection === 'community' && communityPosts.length === 0 && !loadingCommunity) {
      setLoadingCommunity(true)
      fetch('/api/community-posts')
        .then(r => r.json())
        .then(json => { if (json.success) setCommunityPosts(json.posts ?? []) })
        .catch(() => {})
        .finally(() => setLoadingCommunity(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  // Fetch weekly brief on dashboard load
  useEffect(() => {
    if (activeView === 'dashboard') {
      fetch('/api/learning')
        .then(r => r.json())
        .then(json => {
          if (json.success && json.data) {
            setWeeklyBrief(json.data)
          } else if (json.message) {
            setBriefMessage(json.message)
          }
        })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView])

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
          // Auto-log the content creation action
          const actionMap: Record<string, string> = { quote: 'x_quote', thread: 'x_thread', linkedin: 'li_post' }
          const actionType = actionMap[format]
          if (actionType) {
            fetch('/api/actions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action_type: actionType, post_id: item.url, platform: item.platform }),
            }).catch(() => {})
          }
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
        body: JSON.stringify({
          tweet_text: item.text,
          author_name: item.author,
          author_handle: item.authorHandle,
          platform: item.platform,
          likes: item.engagement?.likes,
          retweets: item.engagement?.retweets,
        }),
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
    const showScrape = true // always available
    const showRepurpose = true // always available

    type Action = { label: string; type: 'scrape' | 'reply' | 'content' | 'skip'; priority: 'high' | 'medium' | 'low' }
    const actions: Action[] = []
    const reasons: string[] = []

    // ═══ REPLY — Visibility play (playbook-informed) ═══
    // X playbook: replies = 27x a like, early replies (first 15 min) get surfaced to thousands
    // LinkedIn playbook: comments within 60 min get locked at top, >15 words = 12-15x a like
    const earlyWindow = isLinkedIn ? ageHours < 1.5 : ageHours < 0.25 // 90 min LinkedIn, 15 min X
    const replyWindowOpen = ageHours < 12
    const lowReplyCount = comments < 20
    const highVisibility = totalEngagement >= 20 || velocity >= 10
    const likeToReplyRatio = comments > 0 ? likes / comments : likes // high ratio = your reply stands out

    if (replyWindowOpen && highVisibility && lowReplyCount) {
      if (earlyWindow && velocity >= 5) {
        // Playbook: early reply on trending post = maximum algorithm boost
        actions.push({ label: isLinkedIn ? 'Comment now — golden hour' : 'Reply now — 27x boost', type: 'reply', priority: 'high' })
        reasons.push(isLinkedIn
          ? `Posted ${Math.round(ageHours * 60)}m ago, ${velocity}/hr — early comments get locked at top`
          : `Posted ${Math.round(ageHours * 60)}m ago, ${velocity}/hr — early replies get 27x algorithm weight`)
      } else if (likeToReplyRatio >= 6 && likes >= 30) {
        // Playbook: high likes, low replies = your reply gets maximum visibility
        actions.push({ label: 'Reply — you\'ll stand out', type: 'reply', priority: 'high' })
        reasons.push(`${likes} likes but only ${comments} replies — ${Math.round(likeToReplyRatio)}:1 like-to-reply ratio`)
      } else if (velocity >= 10) {
        actions.push({ label: 'Reply now — trending', type: 'reply', priority: 'high' })
        reasons.push(`${velocity}/hr velocity, reply window open`)
      } else {
        actions.push({ label: 'Draft reply', type: 'reply', priority: 'medium' })
        reasons.push(`${totalEngagement} engagers, ${isLinkedIn ? 'comment to borrow their audience' : 'reply for visibility'}`)
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
    // X playbook: threads get 3x engagement, bookmarks = 10x a like
    // LinkedIn playbook: carousels get 4x reach, saves = 5x a like
    if (showRepurpose && isSubstantive && totalEngagement >= 5) {
      const hasDataPoints = /\d+%|\$\d|x\d|\d+x/i.test(item.text)
      const hasFramework = /step|framework|system|playbook|process|how to/i.test(item.text)
      if (hasDataPoints || hasFramework) {
        actions.push({ label: isLinkedIn ? 'Turn into carousel — 4x reach' : 'Write thread — 3x engagement', type: 'content', priority: 'high' })
        reasons.push(hasFramework ? 'Framework/how-to angle — best for threads and carousels' : 'Data-rich — drives bookmarks (10x a like on X, 5x on LinkedIn)')
      } else {
        actions.push({ label: 'Quote or repurpose', type: 'content', priority: 'medium' })
        reasons.push('Substantive insight worth repurposing')
      }
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
            <span className={`badge ${!isX ? 'badge-icp' : 'badge-replied'}`}>
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

  if (loading) return (
    <div className="max-w-2xl mx-auto">
      <div className="skeleton skeleton-text w-1/4 mb-3" />
      <div className="skeleton skeleton-text w-1/2 mb-6" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
    </div>
  )

  const linkedinWatchlist = watchlist.filter(w => w.platform === 'linkedin')
  const xWatchlist = watchlist.filter(w => w.platform === 'x')

  // Split feed into todo and done
  const linkedinTodo = feed.filter(f => f.platform === 'linkedin' && !tasks[f.url])
  const linkedinDone = feed.filter(f => f.platform === 'linkedin' && tasks[f.url])
  const xTodo = feed.filter(f => f.platform === 'x' && !tasks[f.url])
  const xDone = feed.filter(f => f.platform === 'x' && tasks[f.url])

  // New user empty watchlist content — rendered inside feed view below
  const isNewUser = watchlist.length === 0

  function renderEmptyWatchlist() {
    return (
      <>
        <div className="text-center mb-10 pt-4">
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
              aria-label="Add to watchlist"
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
              <div><strong className="text-ink">{userMode === 'b2b_outbound' ? 'Scrape engagers' : 'Reply to trending posts'}</strong> → {userMode === 'b2b_outbound' ? 'find ICP matches → draft DMs → book meetings' : 'build visibility → grow your audience'}</div>
            </div>
            <div className="flex gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: 'var(--gradient-main)', color: '#fff' }}>B</div>
              <div><strong className="text-ink">Brain learns</strong> → what actually works for {userMode === 'b2b_outbound' ? 'booking meetings' : 'growing your audience'}</div>
            </div>
          </div>
        </div>
      </>
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
        <button onClick={() => setSelectedPerson(null)} className="text-xs text-ink-4 hover:text-ink mb-4" aria-label="Back to feed">
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
                    {isDone && <span className="text-[10px] text-[var(--green)] font-semibold">{tasks[item.url] === 'done' ? 'Done' : 'Skipped'}</span>}
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
                        <button className="btn-primary" onClick={() => { copyAndOpen(draftReplies[item.url], item.url, item.platform); markDone(item.url, 'reply', item.platform) }}>
                          {copied === item.url ? 'Copied' : item.platform === 'linkedin' ? 'Copy & Open on LinkedIn' : 'Copy & Open'}
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

  // Goal-oriented sections — tabs specific to each mode
  const goalSections = (() => {
    const sections: Array<{ key: string; label: string; filterType: 'all' | 'reply' | 'scrape' | 'content'; count: number }> = []
    if (userMode === 'b2b_outbound') {
      sections.push({ key: 'prospect', label: 'Find leads', filterType: 'scrape', count: 0 })
      sections.push({ key: 'engage', label: 'Engage', filterType: 'reply', count: 0 })
    } else {
      sections.push({ key: 'engage', label: 'Reply', filterType: 'reply', count: 0 })
    }
    sections.push({ key: 'community', label: 'Reddit & HN', filterType: 'all', count: communityPosts.length })
    return sections
  })()

  // Sync activeSection with actionFilter for backward compat
  const currentSection = goalSections.find(s => s.key === activeSection) ?? goalSections[0]
  const effectiveFilter = currentSection?.filterType ?? 'all'

  return (
    <div className="max-w-2xl mx-auto">
      {/* ═══ TOP-LEVEL VIEW TABS ═══ */}
      <div className="flex items-center gap-1 mb-6">
        {([
          { key: 'dashboard' as const, label: 'Dashboard' },
          { key: 'feed' as const, label: 'Feed', count: feedLoaded ? feed.length : 0 },
          ...(userMode === 'personal_brand' ? [{ key: 'create' as const, label: 'Create' }] : []),
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            className={`font-head text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
              activeView === tab.key ? 'bg-[var(--blue-tint)] text-ink' : 'text-ink-4 hover:text-ink-3 hover:bg-[var(--rule-light)]'
            }`}
          >
            {tab.label}
            {'count' in tab && (tab.count ?? 0) > 0 && (
              <span className="ml-1.5 text-[10px] bg-[var(--rule-light)] rounded-full px-1.5 py-0.5">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ DASHBOARD VIEW ═══ */}
      {activeView === 'dashboard' && (
        <div>
          {/* Onboarding guide — only for new users with zero actions */}
          {!hasActions && !onboardingDismissed && (
            <div className="card p-4 mb-5 border-l-[3px] border-l-[var(--accent)] relative">
              <button
                className="absolute top-3 right-3 text-ink-4 hover:text-ink text-sm leading-none"
                onClick={() => {
                  setOnboardingDismissed(true)
                  try { localStorage.setItem('gtm-brain-onboarding-dismissed', 'true') } catch { /* */ }
                }}
                aria-label="Dismiss getting started guide"
              >
                &times;
              </button>
              <div className="font-head text-sm font-bold text-ink mb-3">Getting started</div>
              {userMode === 'personal_brand' || userMode === 'both' ? (
                <ol className="space-y-2 text-xs text-ink-3 list-none pl-0">
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-ink shrink-0">1.</span>
                    <span>
                      <button onClick={() => setActiveView('dashboard')} className="text-accent hover:underline font-medium">Add 3-5 people to watch</button>
                      {' '}&mdash; use the watchlist below to follow people in your niche
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-ink shrink-0">2.</span>
                    <span>
                      <button onClick={() => setActiveView('feed')} className="text-accent hover:underline font-medium">Go to Feed and reply to a post</button>
                      {' '}&mdash; engage with trending content to build visibility
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-ink shrink-0">3.</span>
                    <span>
                      <button onClick={() => setActiveView('create')} className="text-accent hover:underline font-medium">Check Create tab for content ideas</button>
                      {' '}&mdash; AI-generated drafts based on what is trending
                    </span>
                  </li>
                </ol>
              ) : (
                <ol className="space-y-2 text-xs text-ink-3 list-none pl-0">
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-ink shrink-0">1.</span>
                    <span>
                      <button onClick={() => setActiveView('dashboard')} className="text-accent hover:underline font-medium">Add 3-5 people to watch</button>
                      {' '}&mdash; follow thought leaders your ICP engages with
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-ink shrink-0">2.</span>
                    <span>
                      <button onClick={() => setActiveView('feed')} className="text-accent hover:underline font-medium">Scrape a high-engagement post</button>
                      {' '}&mdash; find ICP matches among post engagers
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-ink shrink-0">3.</span>
                    <span>
                      <button onClick={() => setActiveView('feed')} className="text-accent hover:underline font-medium">Draft DMs to ICP matches</button>
                      {' '}&mdash; personalized outreach based on their activity
                    </span>
                  </li>
                </ol>
              )}
            </div>
          )}

          {/* Section 1: Quick stats bar */}
          {(() => {
            const latestFollowers = growthFollowers.length > 0 ? growthFollowers[growthFollowers.length - 1].value : 0
            const weekAgoIdx = Math.max(0, growthFollowers.length - 7)
            const followerDelta = growthFollowers.length > 1 ? latestFollowers - (growthFollowers[weekAgoIdx]?.value ?? latestFollowers) : 0
            const latestConnections = growthConnections.length > 0 ? growthConnections[growthConnections.length - 1].value : 0
            const liWeekIdx = Math.max(0, growthConnections.length - 7)
            const connectionDelta = growthConnections.length > 1 ? latestConnections - (growthConnections[liWeekIdx]?.value ?? latestConnections) : 0
            const todayStr = new Date().toISOString().slice(0, 10)
            const actionsToday = growthActions.find(a => a.date === todayStr)?.count ?? 0
            return (
              <div className="card p-3 mb-4 flex items-center gap-6">
                {growthFollowers.length > 0 && (
                  <div>
                    <div className="text-[11px] text-ink-4">X followers</div>
                    <div className="font-head text-2xl font-bold text-ink leading-tight">
                      {latestFollowers.toLocaleString()}
                      {followerDelta !== 0 && (
                        <span className={`text-sm ml-1 ${followerDelta > 0 ? 'text-[var(--green)]' : 'text-[var(--status-error)]'}`}>
                          {followerDelta > 0 ? '+' : ''}{followerDelta}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {growthConnections.length > 0 && (
                  <div className="border-l border-[var(--rule-light)] pl-6">
                    <div className="text-[11px] text-ink-4">LinkedIn</div>
                    <div className="font-head text-2xl font-bold text-ink leading-tight">
                      {latestConnections.toLocaleString()}
                      {connectionDelta !== 0 && (
                        <span className={`text-sm ml-1 ${connectionDelta > 0 ? 'text-[var(--green)]' : 'text-[var(--status-error)]'}`}>
                          {connectionDelta > 0 ? '+' : ''}{connectionDelta}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className={`${growthFollowers.length > 0 || growthConnections.length > 0 ? 'border-l border-[var(--rule-light)] pl-6' : ''}`}>
                  <div className="text-[11px] text-ink-4">Actions today</div>
                  <div className="font-head text-2xl font-bold text-ink leading-tight">
                    {actionsToday}<span className="text-sm text-ink-4 font-normal">/10</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Section 2: Growth chart (simplified) */}
          {growthFollowers.length >= 2 ? (() => {
            const svgW = 320
            const svgH = 160
            const padX = 0
            const padY = 8
            const values = growthFollowers.map(p => p.value)
            const allValues = [...values, ...growthConnections.map(c => c.value)]
            const minV = Math.min(...allValues)
            const maxV = Math.max(...allValues)
            // Ensure minimum visual range so small changes are visible
            const rawRange = maxV - minV
            const rangeV = Math.max(rawRange, maxV * 0.05, 10)
            const latest = values[values.length - 1] ?? 0
            const weekAgoIdx = Math.max(0, values.length - 7)
            const weekDelta = latest - (values[weekAgoIdx] ?? latest)
            const points = growthFollowers.map((p, i) => {
              const x = padX + (i / (growthFollowers.length - 1)) * (svgW - 2 * padX)
              const y = padY + (1 - (p.value - minV) / rangeV) * (svgH - 2 * padY)
              return { x, y }
            })
            const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
            // LinkedIn line
            const liPoints = growthConnections.length >= 2 ? growthConnections.map((p, i) => {
              const x = padX + (i / (growthConnections.length - 1)) * (svgW - 2 * padX)
              const y = padY + (1 - (p.value - minV) / rangeV) * (svgH - 2 * padY)
              return { x, y }
            }) : []
            const liPathD = liPoints.length > 0 ? liPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') : ''
            return (
              <div className="card p-4 mb-4">
                <div className="text-xs text-ink-4 mb-2">
                  <span className="text-ink font-semibold">{latest.toLocaleString()} followers</span>
                  {weekDelta !== 0 && (
                    <span className={`ml-1 ${weekDelta > 0 ? 'text-[var(--green)]' : 'text-[var(--status-error)]'}`}>
                      {weekDelta > 0 ? '+' : ''}{weekDelta} this week
                    </span>
                  )}
                  {growthConnections.length > 0 && (
                    <span className="ml-2 text-ink-4">
                      · {growthConnections[growthConnections.length - 1].value.toLocaleString()} LI followers
                    </span>
                  )}
                </div>
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ height: 140 }}>
                  {[0.25, 0.5, 0.75].map(pct => (
                    <line key={pct} x1={0} x2={svgW} y1={padY + pct * (svgH - 2 * padY)} y2={padY + pct * (svgH - 2 * padY)} stroke="var(--rule-light)" strokeWidth="0.5" />
                  ))}
                  <path
                    d={`${pathD} L ${points[points.length - 1].x.toFixed(1)},${svgH} L ${points[0].x.toFixed(1)},${svgH} Z`}
                    fill="var(--blue-tint)"
                  />
                  <path d={pathD} stroke="var(--blue-bright)" fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {liPathD && (
                    <path d={liPathD} stroke="var(--accent)" fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 2" />
                  )}
                  {points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={points.length <= 10 ? 2.5 : 1.5} fill="var(--blue-bright)" />
                  ))}
                </svg>
                <div className="flex justify-between mt-1 text-[9px] text-ink-4">
                  {growthFollowers.length > 0 && <span>{new Date(growthFollowers[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  {growthFollowers.length > 2 && <span>{new Date(growthFollowers[Math.floor(growthFollowers.length / 2)].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  {growthFollowers.length > 1 && <span>{new Date(growthFollowers[growthFollowers.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                </div>
                {liPathD && (
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-ink-4">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[var(--blue-bright)] rounded" /> X followers</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 border-t border-dashed border-[var(--accent)]" /> LinkedIn</span>
                  </div>
                )}
              </div>
            )
          })() : (
            <div className="card p-4 mb-4">
              <div className="font-head text-sm font-bold text-ink mb-1">Growth</div>
              <p className="text-xs text-ink-4">
                Follower tracking starts after 2 days. Connect your X handle in Settings.
              </p>
            </div>
          )}

          {/* Section 2.5: Weekly GTM Brief */}
          <div className="card p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-head text-sm font-bold text-ink">Weekly GTM Brief</div>
              {weeklyBrief && (
                <button
                  className="text-[11px] text-accent hover:underline disabled:opacity-50"
                  onClick={() => {
                    setBriefLoading(true)
                    fetch('/api/learning', { method: 'POST' })
                      .then(r => r.json())
                      .then(json => { if (json.success && json.data) { setWeeklyBrief(json.data); setBriefMessage(null) } })
                      .catch(() => {})
                      .finally(() => setBriefLoading(false))
                  }}
                  disabled={briefLoading}
                >
                  {briefLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              )}
            </div>
            {weeklyBrief ? (
              <>
                <p className="text-sm text-ink-3 leading-relaxed mb-3">{weeklyBrief.brief}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="badge text-[10px] px-2 py-0.5 rounded">Most active: {weeklyBrief.patterns.mostActiveDay}</span>
                  <span className="badge text-[10px] px-2 py-0.5 rounded">Avg {weeklyBrief.patterns.avgActionsPerDay} actions/day</span>
                  {weeklyBrief.patterns.notificationActRate > 0 && (
                    <span className="badge text-[10px] px-2 py-0.5 rounded">{weeklyBrief.patterns.notificationActRate}% act rate</span>
                  )}
                  <span className="badge text-[10px] px-2 py-0.5 rounded">Top: {weeklyBrief.patterns.topAction}</span>
                  <span className="badge text-[10px] px-2 py-0.5 rounded">Trend: {weeklyBrief.patterns.trend}</span>
                </div>
                {weeklyBrief.generatedAt && (
                  <div className="text-[10px] text-ink-4 mt-2">
                    Generated {new Date(weeklyBrief.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-ink-4">
                {briefMessage ?? 'Keep using the app for a few more days \u2014 the brain is learning your patterns.'}
              </p>
            )}
          </div>

          {/* Section 3: This week's progress — actual vs recommended */}
          {growthActions.length > 0 && (() => {
            const weekStart = new Date()
            weekStart.setDate(weekStart.getDate() - weekStart.getDay())
            const weekStr = weekStart.toISOString().slice(0, 10)
            const allItems = Object.values(activityData).flat()
            const weekItems = allItems.filter(item => item.created_at.slice(0, 10) >= weekStr)
            const replies = weekItems.filter(i => i.action_type === 'reply' || i.action_type === 'reply_copy').length
            const posts = weekItems.filter(i => ['x_post', 'x_thread', 'x_quote', 'li_post', 'li_carousel', 'li_comment'].includes(i.action_type)).length
            const scrapes = weekItems.filter(i => i.action_type === 'scrape').length
            const dms = weekItems.filter(i => i.action_type === 'dm_send').length

            // Recommended weekly targets based on mode
            const targets = userMode === 'b2b_outbound'
              ? { replies: 35, posts: 2, scrapes: 3, dms: 5, label: 'B2B targets' }
              : { replies: 70, posts: 7, scrapes: 0, dms: 0, label: 'Growth targets' }

            const metrics = [
              { label: 'Replies', actual: replies, target: targets.replies, view: 'feed' as const },
              { label: 'Posts', actual: posts, target: targets.posts, view: 'create' as const },
              ...(targets.scrapes > 0 ? [{ label: 'Scrapes', actual: scrapes, target: targets.scrapes, view: 'feed' as const }] : []),
              ...(targets.dms > 0 ? [{ label: 'DMs', actual: dms, target: targets.dms, view: 'feed' as const }] : []),
            ]

            return (
              <div className="card p-4 mb-4">
                <div className="text-[11px] text-ink-4 mb-2">This week</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {metrics.map(m => {
                    const pct = m.target > 0 ? Math.min(100, Math.round((m.actual / m.target) * 100)) : 100
                    return (
                      <button
                        key={m.label}
                        onClick={() => setActiveView(m.view)}
                        className="text-left hover:bg-[var(--bg-warm)] rounded-lg p-2 transition-colors"
                      >
                        <div className="flex items-baseline gap-1">
                          <span className="font-head text-lg font-bold text-ink">{m.actual}</span>
                          <span className="text-[11px] text-ink-4">/{m.target}</span>
                        </div>
                        <div className="text-[11px] text-ink-4">{m.label}</div>
                        <div className="mt-1 h-1 rounded-full bg-[var(--rule-light)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct >= 100 ? 'var(--green)' : pct >= 50 ? 'var(--blue-bright)' : 'var(--accent-orange)',
                            }}
                          />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Recent Activity */}
          <div className="card p-4 mt-4">
            <button
              className="flex items-center justify-between w-full text-left"
              aria-expanded={activityOpen}
              onClick={() => setActivityOpen(prev => !prev)}
            >
              <span className="font-head text-sm font-bold text-ink">Recent activity</span>
              <span className="text-ink-4 text-xs">{activityOpen ? '▲' : '▼'}</span>
            </button>
            {activityOpen && (
              <div className="mt-3">
                {Object.keys(activityData).length === 0 ? (
                  <p className="text-xs text-ink-4">
                    No activity yet. Start by replying to posts in the Feed tab.
                  </p>
                ) : (
                  Object.entries(activityData).slice(0, 4).map(([group, items]) => (
                    <div key={group} className="mb-3">
                      <div className="text-[11px] font-head font-semibold text-ink-4 mb-1.5 uppercase tracking-wide">{group}</div>
                      <div className="space-y-1.5">
                        {items.slice(0, 20).map((item) => {
                          const icons: Record<string, string> = {
                            reply: '💬', reply_copy: '📋', dm_draft: '📝', dm_send: '✉️',
                            scrape: '🔍', x_thread: '🧵', x_quote: '🔁', x_post: '✏️',
                            li_comment: '💬', li_post: '📝', li_carousel: '🎠',
                            li_connection: '🤝', notification_skip: '⏭️',
                          }
                          const icon = icons[item.action_type] ?? '📌'
                          const ago = (() => {
                            const diff = Date.now() - new Date(item.created_at).getTime()
                            const mins = Math.floor(diff / 60000)
                            if (mins < 60) return `${mins}m ago`
                            const hrs = Math.floor(mins / 60)
                            if (hrs < 24) return `${hrs}h ago`
                            return `${Math.floor(hrs / 24)}d ago`
                          })()
                          return (
                            <div key={item.id} className="flex items-start gap-2 text-xs">
                              <span className="shrink-0" aria-hidden="true">{icon}</span>
                              <div className="flex-1 min-w-0">
                                <span className="text-ink">{item.label}</span>
                                {item.platform && (
                                  <span className="badge ml-1.5 text-[10px] px-1.5 py-0 rounded">{item.platform}</span>
                                )}
                                <span className="text-ink-4 ml-1.5">{ago}</span>
                                {item.content_preview && (
                                  <div className="text-[11px] text-ink-4 truncate mt-0.5">
                                    {item.content_preview}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ═══ CREATE VIEW ═══ */}
      {activeView === 'create' && (
        <div>
          <div className="mb-5">
            <h2 className="font-head text-lg font-bold text-ink">Create content</h2>
            <p className="text-xs text-ink-4 mt-0.5">AI-generated posts based on trending topics in your feed.</p>
          </div>
          <ContentCalendar />
        </div>
      )}

      {/* ═══ FEED VIEW ═══ */}
      {activeView === 'feed' && (
        <div>
          {/* Empty watchlist — new user experience */}
          {isNewUser && renderEmptyWatchlist()}

          {/* Feed section tabs — only show when user has watchlist entries */}
          {!isNewUser && <div className="flex items-center gap-0 mb-4 border-b border-rule">
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
                </button>
              )
            })}
            <div className="ml-auto pb-1.5">
              <button onClick={() => fetchFeed(true)} disabled={loadingFeed} className="btn-outline text-xs">
                {loadingFeed ? '...' : '\u21BB'}
              </button>
            </div>
          </div>}

      {/* ═══ POSTS ═══ */}
      {!isNewUser && (<>
      {loadingFeed && feed.length === 0 && currentSection?.key !== 'community' && (
        <div className="text-sm text-ink-4 py-8 text-center">
          <div className="mb-1">Loading posts from your watchlist...</div>
          <div className="text-[11px]">This can take 10-30 seconds (fetching from LinkedIn & X)</div>
        </div>
      )}
      {(feed.length > 0 || !loadingFeed || currentSection?.key === 'community') && (
        <>
          {/* Profile scoring status — hide on community tab */}
          {currentSection?.key !== 'community' && profileScoring && feed.length > 0 && (
            <div className="text-[11px] text-ink-4 text-center mb-2 animate-pulse">Scoring posts with your profile...</div>
          )}
          {currentSection?.key !== 'community' && !profileScoring && Object.keys(profileScores).length > 0 && (
            <div className="text-[11px] text-ink-4 text-center mb-2">Ranked by your profile graph</div>
          )}
          {/* ═══ UNIFIED FEED — sorted by ICP relevance + ROI (hidden on community tab) ═══ */}
          {currentSection?.key !== 'community' && (() => {
            // Build scoring config from user's ICP titles + topic insights
            const topicInsightsArr: Array<{ keyword: string; rate: number }> = []
            if (insights?.topics) {
              for (const t of insights.topics) {
                if (t.avg_icp_rate > 0) topicInsightsArr.push({ keyword: t.topic.toLowerCase(), rate: t.avg_icp_rate })
              }
            }
            if (roi?.topic_rates) {
              for (const [topic, rate] of Object.entries(roi.topic_rates)) {
                topicInsightsArr.push({ keyword: topic.toLowerCase(), rate })
              }
            }

            const scoringConfig: UserScoringConfig = {
              trackKeywords,
              icpTitles,
              topicInsights: topicInsightsArr,
            }

            const allScored = feed
              .filter(f => !tasks[f.url])
              .map(item => {
                const rec = getRecommendation(item)
                const likes = item.engagement?.likes ?? 0
                const comments = item.engagement?.replies ?? 0
                const rts = item.engagement?.retweets ?? 0
                const eng = likes + comments + rts

                // Use AI profile scores when available, fall back to keyword matching
                const ps = profileScores[item.url] as ProfileScoreOverride | undefined
                const icpRel = getIcpRelevance(item.text, scoringConfig, ps)

                const { ageHours } = getVelocity(item)

                // Playbook-informed scoring
                let score = 0

                // Topic relevance (highest weight)
                score += icpRel.score > 0 ? 200 * icpRel.score : 0

                // Action priority
                score += rec.actions[0]?.priority === 'high' ? 100 : rec.actions[0]?.priority === 'medium' ? 30 : 1

                // Engagement base
                score += eng * 0.1

                // Playbook bonuses (early window, like-to-reply ratio, framework/data content)
                score += getPlaybookBonus({ ageHours, likes, comments, text: item.text })

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

            const allDone = feed.filter(f => tasks[f.url] === 'done')

            if (allTodo.length === 0 && allDone.length === 0 && currentSection?.key !== 'community') {
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
                {currentSection && currentSection.key !== 'done' && currentSection.key !== 'community' && (
                  <div className="brain-nudge mb-4">
                    <div className="brain-nudge-icon">{currentSection.key === 'engage' ? '\u{1F4AC}' : currentSection.key === 'create' ? '\u270F\uFE0F' : '\u{1F50D}'}</div>
                    <div>
                      <div className="font-head text-sm font-semibold text-ink">{descs[currentSection.key] ?? 'Posts for you'}</div>
                      <div className="text-[11px] text-ink-4 mt-0.5">{allTodo.length} {allTodo.length === 1 ? 'post' : 'posts'} to act on</div>
                    </div>
                  </div>
                )}

                {/* ═══ COMMUNITY — Reddit & HN ═══ */}
                {currentSection?.key === 'community' && (
                  <div className="mb-4">
                    {loadingCommunity && (
                      <div className="space-y-3">
                        <div className="skeleton skeleton-card" />
                        <div className="skeleton skeleton-card" />
                        <div className="skeleton skeleton-card" />
                      </div>
                    )}
                    {!loadingCommunity && communityPosts.length === 0 && (
                      <div className="empty-state">
                        <div className="empty-state-icon">{'\u{1F30D}'}</div>
                        <div className="empty-state-title">No community posts found</div>
                        <div className="empty-state-desc">Add tracked keywords in Settings to discover relevant Reddit and Hacker News posts.</div>
                      </div>
                    )}
                    {!loadingCommunity && communityPosts.length > 0 && (
                      <div className="space-y-3">
                        {communityPosts.map((post, i) => (
                          <div key={i} className="card p-4">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`badge text-[10px] ${post.platform === 'reddit' ? 'badge-replied' : 'badge-icp'}`}>
                                {post.platform === 'reddit' ? `r/${post.subreddit}` : 'Hacker News'}
                              </span>
                              <span className="text-[10px] text-ink-4">
                                {post.score} pts &middot; {post.comments} comments
                                {post.time && (() => {
                                  const hrs = Math.round((Date.now() - new Date(post.time).getTime()) / 3600000)
                                  return ` \u00B7 ${hrs < 1 ? 'just now' : hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`}`
                                })()}
                              </span>
                            </div>
                            <div className="font-head text-sm font-semibold text-ink mb-1">{post.title}</div>
                            {post.text && (
                              <div className="text-xs text-ink-3 mb-2 line-clamp-2">{post.text}</div>
                            )}
                            <div className="flex gap-2">
                              <a href={post.commentsUrl} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs">
                                Reply in thread
                              </a>
                              {post.url !== post.commentsUrl && (
                                <a href={post.url} target="_blank" rel="noopener noreferrer" className="btn-outline text-xs">
                                  Open link
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ CONTENT CALENDAR — Create tab only ═══ */}
                {currentSection?.key === 'create' && (
                  <div className="mb-4">
                    <ContentCalendar />

                    {/* Secondary: paste a link */}
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-rule" />
                      <span className="text-[10px] text-ink-4 uppercase tracking-wider">Or paste a link</span>
                      <div className="flex-1 h-px bg-rule" />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input flex-1 py-2.5 px-3 text-sm"
                        placeholder="Paste any URL or text to find content angles..."
                        value={createInput}
                        onChange={e => { setCreateInput(e.target.value); setCreateError(''); setCreateAngles([]) }}
                        onKeyDown={e => { if (e.key === 'Enter' && createInput.trim()) handleAnalyzeAngles() }}
                      />
                      <button className="btn-accent" disabled={createAnalyzing || !createInput.trim()} onClick={() => handleAnalyzeAngles()}>
                        {createAnalyzing ? '...' : 'Find angles'}
                      </button>
                    </div>
                    {createShowText && (
                      <div className="mt-3">
                        <div className="text-xs text-ink-3 mb-1.5">Couldn&apos;t fetch that URL. Paste the content:</div>
                        <textarea className="input w-full min-h-[80px] text-xs leading-relaxed mb-2" placeholder="Paste text here..." id="create-fallback" />
                        <button className="btn-accent" disabled={createAnalyzing} onClick={() => {
                          const el = document.getElementById('create-fallback') as HTMLTextAreaElement
                          if (el?.value.trim()) handleAnalyzeAngles(el.value.trim())
                        }}>{createAnalyzing ? '...' : 'Find angles'}</button>
                      </div>
                    )}
                    {createError && <div className="text-xs text-orange mt-2">{createError}</div>}
                    {createAngles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {createAngles.map(angle => {
                          const icons: Record<string, string> = { key_insight: '\u{1F4A1}', story: '\u{1F4D6}', data_point: '\u{1F4CA}', framework: '\u{1F9E9}', contrarian_take: '\u{1F525}', how_to: '\u{1F4CB}', quote: '\u{1F4AC}' }
                          const generated = createResults[angle.id]
                          return (
                            <div key={angle.id} className="card p-3">
                              <div className="flex items-start gap-2 mb-2">
                                <span className="text-base">{icons[angle.type] ?? '\u{1F4DD}'}</span>
                                <div className="flex-1">
                                  <div className="font-head text-sm font-semibold text-ink">{angle.title}</div>
                                  <div className="text-xs text-ink-3 mt-0.5">{angle.summary}</div>
                                  <div className="flex gap-1.5 mt-2">
                                    {angle.platforms.map(p => (
                                      <button key={p} className={`badge ${p === 'linkedin' ? 'badge-icp' : 'badge-replied'} cursor-pointer hover:opacity-80`}
                                        disabled={createGenerating === angle.id}
                                        onClick={() => handleGenerateFromAngle(angle.id, p)}>
                                        {createGenerating === angle.id ? '...' : p === 'linkedin' ? 'LinkedIn' : 'X thread'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              {generated && Object.entries(generated).filter(([,v]) => v).map(([fmt, text]) => (
                                <div key={fmt} className="mt-2 pt-2 border-t border-rule-light">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className={`badge ${fmt === 'linkedin' ? 'badge-icp' : 'badge-replied'}`}>
                                      {fmt === 'quote' ? 'Quote' : fmt === 'thread' ? 'Thread' : 'LinkedIn'}
                                    </span>
                                    <button className="btn-accent text-xs" onClick={() => navigator.clipboard.writeText(text)}>Copy</button>
                                  </div>
                                  <div className="text-xs text-ink leading-relaxed whitespace-pre-wrap bg-[var(--bg-warm)] rounded-lg p-2.5">{text}</div>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Hide feed posts on Create tab — calendar replaces them */}

                <div className="flex flex-col gap-2">
                  {currentSection?.key === 'create' ? null : allTodo.map(({ item, rec, icpRelevance }, i) => {
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
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                icpRelevance.score >= 0.1 ? 'bg-[var(--green-tint)] text-[var(--green)]' : 'bg-[var(--rule-light)] text-ink-4'
                              }`}
                              title={profileScores[item.url]?.reason || undefined}
                            >
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
                        <div className="text-sm text-ink-2 leading-relaxed mb-2">{item.text}</div>

                        {/* ROI for the relevant action (mode-aware) */}
                        <div className="text-[11px] text-ink-4 mb-2">
                          {(effectiveFilter === 'scrape' || (actionFilter === 'all' && primaryAction?.type === 'scrape')) && <span>{p}{est.scrape.icpLeads} est. ICP leads → {p}{est.scrape.meetings} meetings</span>}
                          {(effectiveFilter === 'reply' || (actionFilter === 'all' && primaryAction?.type === 'reply')) && <span>{p}{est.reply.impressions} est. impressions → {p}{est.reply.followers} followers</span>}
                          {(effectiveFilter === 'content' || (actionFilter === 'all' && primaryAction?.type === 'content')) && <span>{est.content.icpRate}% ICP topic match</span>}
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
                            {isLinkedIn ? 'Open on LinkedIn' : 'Open on X'}
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
                                            <span className="badge badge-replied">
                                              {formatLabel} · {tweets.length} tweets
                                            </span>
                                            {isPosted && <span className="text-[9px] text-[var(--green)] font-semibold">Posted</span>}
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
                                                  <div className={`text-[10px] mt-1 ${tweet.length > 270 ? 'text-[var(--status-error)] font-semibold' : 'text-ink-4'}`}>
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
                                          {isPosted && <span className="text-[9px] text-[var(--green)] font-semibold">Posted</span>}
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
                              <button className="btn-primary" onClick={() => { copyAndOpen(draftReply, item.url, item.platform); markDone(item.url, 'reply', item.platform) }}>
                                {copied === item.url ? 'Copied!' : isLinkedIn ? 'Copy & Open on LinkedIn' : 'Copy & Open tweet'}
                              </button>
                              <button className="btn-outline" onClick={() => handleDraftReply(item)} disabled={draftingUrl === item.url}>
                                {draftingUrl === item.url ? '...' : '\u21BB Regenerate'}
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
                        <span>✓</span>
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
      </>)}
        </div>
      )}
    </div>
  )
}
