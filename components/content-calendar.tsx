'use client'

import { useState, useEffect } from 'react'

interface CalendarSlot {
  time: string
  platform: 'x' | 'linkedin'
  format: 'thread' | 'quote' | 'post' | 'carousel'
  topic: string
  angle: string
  draft: string
  signalEvidence: string
  authors: string[]
  sourcePosts?: Array<{ author: string; text: string; engagement: number; url?: string }>
}

interface CalendarData {
  date: string
  dayName: string
  slots: CalendarSlot[]
}

interface ReplyToRepurpose {
  text: string
  fullText: string
  url: string
  replyTo: string | null
  engagement: number
  likes: number
  retweets: number
  replies: number
  time: string
}

interface TrendingTopic {
  topic: string
  postCount: number
  totalEngagement: number
  authors: string[]
  suggestedAngle: string
  source?: 'network' | 'trending' | 'both'
  samplePosts?: Array<{ author: string; text: string; engagement: number; url: string }>
}

const ANGLE_ICONS: Record<string, string> = {
  trending: '\u{1F525}',
  data_point: '\u{1F4CA}',
  framework: '\u{1F9E9}',
  key_insight: '\u{1F4A1}',
  contrarian_take: '\u{1F525}',
  how_to: '\u{1F4CB}',
}

const FORMAT_LABELS: Record<string, string> = {
  thread: 'X Thread',
  quote: 'Quote Tweet',
  post: 'LinkedIn Post',
  carousel: 'LinkedIn Carousel',
}

interface PublishedItem {
  id: string
  action_type: string
  platform: string | null
  metadata: { content?: string; topic?: string; source?: string; format?: string; [key: string]: unknown }
  created_at: string
}

type TabKey = 'calendar' | 'replies' | 'topics' | 'published'

export default function ContentCalendar() {
  const [activeTab, setActiveTab] = useState<TabKey>('calendar')

  // Calendar state
  const [calendar, setCalendar] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [editDrafts, setEditDrafts] = useState<Record<number, string>>({})

  // Published content state
  const [published, setPublished] = useState<PublishedItem[]>([])
  const [loadingPublished, setLoadingPublished] = useState(false)
  const [repurposing, setRepurposing] = useState<string | null>(null) // id being repurposed
  const [repurposeResults, setRepurposeResults] = useState<Record<string, { format: string; content: string }>>({})
  const [copiedPublished, setCopiedPublished] = useState<string | null>(null)

  // Repurpose replies state
  const [repurposeReplies, setRepurposeReplies] = useState<ReplyToRepurpose[]>([])
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [expandingReply, setExpandingReply] = useState<string | null>(null) // url of reply being expanded
  const [expandedContent, setExpandedContent] = useState<Record<string, string>>({}) // url → expanded content
  const [expandFormat, setExpandFormat] = useState<Record<string, string>>({}) // url → format
  const [copiedReply, setCopiedReply] = useState<string | null>(null)

  // Hot topics state
  const [hotTopics, setHotTopics] = useState<TrendingTopic[]>([])
  const [loadingTopics, setLoadingTopics] = useState(false)

  // Load calendar on mount
  useEffect(() => {
    if (!generated) generateCalendar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load replies when tab switches
  useEffect(() => {
    if (activeTab === 'replies' && repurposeReplies.length === 0 && !loadingReplies) {
      loadReplies()
    }
    if (activeTab === 'topics' && hotTopics.length === 0 && !loadingTopics) {
      loadTopics()
    }
    if (activeTab === 'published' && published.length === 0 && !loadingPublished) {
      loadPublished()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  async function generateCalendar() {
    setLoading(true)
    try {
      const topicsRes = await fetch('/api/topics')
      const topicsJson = await topicsRes.json()
      if (!topicsJson.success || !topicsJson.data?.topics?.length) {
        setLoading(false)
        setGenerated(true)
        return
      }

      // Also save topics for the hot topics tab
      setHotTopics(topicsJson.data.topics)

      const calRes = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: topicsJson.data.topics }),
      })
      const calJson = await calRes.json()
      if (calJson.success && calJson.data?.slots?.length) {
        setCalendar(calJson.data)
        setGenerated(true)
      }
    } catch {
      setGenerated(true) // show empty state instead of infinite loading
    }
    finally { setLoading(false) }
  }

  async function loadReplies() {
    setLoadingReplies(true)
    try {
      const res = await fetch('/api/repurpose-replies')
      const json = await res.json()
      if (json.success) setRepurposeReplies(json.replies ?? [])
    } catch { /* show empty state */ }
    finally { setLoadingReplies(false) }
  }

  async function loadTopics() {
    if (hotTopics.length > 0) return // already loaded from calendar generation
    setLoadingTopics(true)
    try {
      const res = await fetch('/api/topics')
      const json = await res.json()
      if (json.success) setHotTopics(json.data?.topics ?? [])
    } catch { /* show empty state */ }
    finally { setLoadingTopics(false) }
  }

  async function loadPublished() {
    setLoadingPublished(true)
    try {
      const res = await fetch('/api/actions')
      const json = await res.json()
      if (json.success) setPublished(json.items ?? [])
    } catch { /* show empty state */ }
    finally { setLoadingPublished(false) }
  }

  async function repurposeTo(item: PublishedItem, targetFormat: string) {
    const content = item.metadata?.content
    if (!content) return

    setRepurposing(`${item.id}-${targetFormat}`)
    try {
      const res = await fetch('/api/repurpose-cross', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          sourceFormat: item.action_type,
          targetFormat,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setRepurposeResults(prev => ({ ...prev, [item.id]: { format: targetFormat, content: json.content } }))
      }
    } catch { /* */ }
    finally { setRepurposing(null) }
  }

  function handleCopyPublished(id: string, text: string, format: string) {
    navigator.clipboard.writeText(text)
    setCopiedPublished(id)
    setTimeout(() => setCopiedPublished(null), 2000)

    fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: format, metadata: { content: text, source: 'repurpose_cross' } }),
    }).catch(() => {})
  }

  async function expandReply(reply: ReplyToRepurpose, format: 'thread' | 'post' | 'quote') {
    setExpandingReply(reply.url)
    setExpandFormat(prev => ({ ...prev, [reply.url]: format }))
    try {
      const res = await fetch('/api/repurpose-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText: reply.text, format }),
      })
      const json = await res.json()
      if (json.success) {
        setExpandedContent(prev => ({ ...prev, [reply.url]: json.content }))
      }
    } catch { /* show unexpanded state */ }
    finally { setExpandingReply(null) }
  }

  function handleCopy(index: number, text: string) {
    navigator.clipboard.writeText(text)
    setCopied(index)
    setTimeout(() => setCopied(null), 2000)

    const slot = calendar?.slots[index]
    if (slot) {
      const actionMap: Record<string, string> = { thread: 'x_thread', quote: 'x_quote', post: 'li_post', carousel: 'li_carousel' }
      const actionType = actionMap[slot.format]
      if (actionType) {
        fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action_type: actionType,
            platform: slot.platform,
            metadata: { content: text, topic: slot.topic, source: 'calendar', format: slot.format },
          }),
        }).catch(() => {})
      }
    }
  }

  function handleCopyReply(url: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopiedReply(url)
    setTimeout(() => setCopiedReply(null), 2000)

    const format = expandFormat[url] ?? 'thread'
    const actionMap: Record<string, string> = { thread: 'x_thread', quote: 'x_quote', post: 'li_post' }

    fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action_type: actionMap[format] ?? 'x_post',
        platform: format === 'post' ? 'linkedin' : 'x',
        metadata: { content: text, source: 'repurpose_reply', format },
      }),
    }).catch(() => {})
  }

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'calendar', label: 'Post today', count: calendar?.slots ? calendar.slots.length - skipped.size : 0 },
    { key: 'replies', label: 'From your replies', count: repurposeReplies.length },
    { key: 'topics', label: 'Hot topics', count: hotTopics.length },
    { key: 'published', label: 'Published', count: published.length },
  ]

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-0 mb-4 border-b border-rule">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`text-xs font-semibold px-3 py-2 border-b-[2px] transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--accent)] text-ink'
                : 'border-transparent text-ink-4 hover:text-ink-3'
            }`}
          >
            {tab.label}
            {(tab.count ?? 0) > 0 && (
              <span className="ml-1.5 text-[10px] bg-[var(--rule-light)] rounded-full px-1.5 py-0.5">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Post today (calendar) ═══ */}
      {activeTab === 'calendar' && (
        <>
          {loading && (
            <div className="space-y-3">
              <div className="section-label">Generating your content calendar...</div>
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
            </div>
          )}

          {!loading && (!calendar || calendar.slots.length === 0) && generated && (
            <div className="empty-state">
              <div className="empty-state-icon">{'\u{1F4DD}'}</div>
              <div className="empty-state-title">No content ideas yet</div>
              <div className="empty-state-desc">Your feed needs more posts to find trending topics. Check back after your watched people post today.</div>
            </div>
          )}

          {!loading && calendar && calendar.slots.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="section-label !mb-0">TODAY &middot; {calendar.dayName}</div>
                  <div className="text-xs text-ink-4">{calendar.slots.length - skipped.size} posts planned</div>
                </div>
                <button className="btn-outline text-xs" onClick={generateCalendar} disabled={loading}>
                  {loading ? '...' : '\u21BB Regenerate'}
                </button>
              </div>

              <div className="space-y-3 mb-6">
                {calendar.slots.map((slot, i) => {
                  if (skipped.has(i)) return null
                  const isEditing = editing === i
                  const currentDraft = editDrafts[i] ?? slot.draft
                  const isCopied = copied === i
                  const isThread = slot.format === 'thread'

                  return (
                    <div key={i} className="card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-head text-xs font-semibold text-ink-3">{slot.time}</span>
                          <span className={`badge ${slot.platform === 'linkedin' ? 'badge-icp' : 'badge-replied'}`}>
                            {FORMAT_LABELS[slot.format] ?? slot.format}
                          </span>
                        </div>
                        <button className="text-[11px] text-ink-4 hover:text-ink" onClick={() => setSkipped(prev => new Set([...prev, i]))}>
                          Skip
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">{ANGLE_ICONS[slot.angle] ?? '\u{1F4A1}'}</span>
                        <span className="font-head text-sm font-semibold text-ink">{slot.topic}</span>
                      </div>
                      <div className="text-[11px] text-ink-4 mb-3">
                        {slot.signalEvidence}
                        {slot.authors.length > 0 && (
                          <span className="ml-1">
                            &middot; {slot.authors.slice(0, 3).map(a => `@${a}`).join(', ')}
                          </span>
                        )}
                      </div>

                      {slot.sourcePosts && slot.sourcePosts.length > 0 && !isEditing && (
                        <details className="mb-2">
                          <summary className="text-[11px] text-accent cursor-pointer hover:underline">
                            Based on {slot.sourcePosts.length} posts from your feed
                          </summary>
                          <div className="mt-1.5 space-y-1.5">
                            {slot.sourcePosts.map((sp, si) => (
                              <div key={si} className="text-[11px] text-ink-3 bg-[var(--bg-warm)] rounded px-2.5 py-1.5 flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <span className="font-semibold text-ink-2">@{sp.author}</span>
                                  <span className="text-ink-4 ml-1">{sp.engagement.toLocaleString()} eng</span>
                                  <div className="mt-0.5 truncate">{sp.text}</div>
                                </div>
                                {sp.url && (
                                  <a href={sp.url} target="_blank" rel="noopener noreferrer" className="btn-outline text-[10px] py-0.5 px-2 shrink-0">Open</a>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {isEditing ? (
                        <textarea
                          className="input w-full min-h-[120px] text-xs leading-relaxed mb-2"
                          value={currentDraft}
                          onChange={e => setEditDrafts(prev => ({ ...prev, [i]: e.target.value }))}
                          autoFocus
                        />
                      ) : isThread ? (
                        <div className="flex flex-col gap-1.5 mb-2">
                          {currentDraft.split(/\n---\n/).map((tweet, ti) => (
                            <div key={ti} className="text-xs text-ink leading-relaxed bg-[var(--bg-warm)] rounded px-2.5 py-2">
                              <span className="text-ink-4 text-[10px] mr-1">{ti + 1}.</span>{tweet.trim()}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-ink leading-relaxed bg-[var(--bg-warm)] rounded-lg px-3 py-2.5 mb-2 whitespace-pre-wrap">
                          {currentDraft.length > 300 ? currentDraft.substring(0, 300) + '...' : currentDraft}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={() => handleCopy(i, currentDraft)}>
                          {isCopied ? 'Copied!' : 'Copy & post'}
                        </button>
                        <button className="btn-outline" onClick={() => setEditing(isEditing ? null : i)}>
                          {isEditing ? 'Done editing' : 'Edit draft'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ TAB: From your replies ═══ */}
      {activeTab === 'replies' && (
        <>
          {loadingReplies && (
            <div className="space-y-3">
              <div className="section-label">Finding your best replies...</div>
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
            </div>
          )}

          {!loadingReplies && repurposeReplies.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">{'\u{1F4AC}'}</div>
              <div className="empty-state-title">No replies to repurpose yet</div>
              <div className="empty-state-desc">Connect your X handle in Settings, then reply to posts from the Reply tab. Replies with 3+ engagement will appear here.</div>
            </div>
          )}

          {!loadingReplies && repurposeReplies.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-ink-4 mb-2">Your replies that got engagement — expand them into full posts.</div>
              {repurposeReplies.map(reply => {
                const expanded = expandedContent[reply.url]
                const isExpanding = expandingReply === reply.url
                const format = expandFormat[reply.url] ?? 'thread'
                const isCopied = copiedReply === reply.url

                return (
                  <div key={reply.url} className="card p-4">
                    {/* Reply preview */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-ink-4">replied to @{reply.replyTo}</span>
                      <span className="text-[10px] text-ink-4">&middot;</span>
                      <span className="text-[10px] text-ink-4">{reply.likes} likes, {reply.retweets} RTs</span>
                    </div>
                    <div className="text-xs text-ink leading-relaxed bg-[var(--bg-warm)] rounded-lg px-3 py-2.5 mb-3">
                      {reply.text}
                    </div>

                    {/* Expand controls */}
                    {!expanded && (
                      <div className="flex gap-2">
                        <button
                          className="btn-primary text-xs"
                          disabled={isExpanding}
                          onClick={() => expandReply(reply, 'thread')}
                        >
                          {isExpanding && format === 'thread' ? 'Expanding...' : 'X Thread'}
                        </button>
                        <button
                          className="btn-outline text-xs"
                          disabled={isExpanding}
                          onClick={() => expandReply(reply, 'post')}
                        >
                          {isExpanding && format === 'post' ? 'Expanding...' : 'LinkedIn Post'}
                        </button>
                        <button
                          className="btn-outline text-xs"
                          disabled={isExpanding}
                          onClick={() => expandReply(reply, 'quote')}
                        >
                          {isExpanding && format === 'quote' ? 'Expanding...' : 'Standalone tweet'}
                        </button>
                      </div>
                    )}

                    {/* Expanded content */}
                    {expanded && (
                      <div className="mt-2">
                        <div className="text-[10px] text-ink-4 mb-1 uppercase tracking-wider">
                          {FORMAT_LABELS[format] ?? format}
                        </div>
                        {format === 'thread' ? (
                          <div className="flex flex-col gap-1.5 mb-2">
                            {expanded.split(/\n---\n/).map((tweet, ti) => (
                              <div key={ti} className="text-xs text-ink leading-relaxed bg-[var(--bg-warm)] rounded px-2.5 py-2">
                                <span className="text-ink-4 text-[10px] mr-1">{ti + 1}.</span>{tweet.trim()}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-ink leading-relaxed bg-[var(--bg-warm)] rounded-lg px-3 py-2.5 mb-2 whitespace-pre-wrap">
                            {expanded}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button className="btn-primary text-xs" onClick={() => handleCopyReply(reply.url, expanded)}>
                            {isCopied ? 'Copied!' : 'Copy & post'}
                          </button>
                          <button className="btn-outline text-xs" onClick={() => setExpandedContent(prev => {
                            const next = { ...prev }
                            delete next[reply.url]
                            return next
                          })}>
                            Try different format
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ TAB: Hot topics ═══ */}
      {activeTab === 'topics' && (
        <>
          {loadingTopics && (
            <div className="space-y-3">
              <div className="section-label">Finding trending topics...</div>
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
            </div>
          )}

          {!loadingTopics && hotTopics.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">{'\u{1F525}'}</div>
              <div className="empty-state-title">No trending topics yet</div>
              <div className="empty-state-desc">Add tracked keywords in Settings and watch more people to discover trending topics.</div>
            </div>
          )}

          {!loadingTopics && hotTopics.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-ink-4 mb-2">What people in your niche are talking about right now.</div>
              {hotTopics.map((topic, i) => (
                <div key={i} className="card p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">{ANGLE_ICONS[topic.suggestedAngle] ?? '\u{1F525}'}</span>
                    <span className="font-head text-sm font-semibold text-ink">{topic.topic}</span>
                    <span className={`badge text-[10px] ${
                      topic.source === 'both' ? 'badge-icp' :
                      topic.source === 'trending' ? 'badge-replied' :
                      'badge-drafted'
                    }`}>
                      {topic.source === 'both' ? 'network + trending' :
                       topic.source === 'trending' ? 'trending on X' :
                       'your network'}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-4 mb-2">
                    {topic.postCount} posts &middot; {topic.totalEngagement.toLocaleString()} engagement
                    {topic.authors.length > 0 && (
                      <span className="ml-1">&middot; {topic.authors.slice(0, 3).map(a => `@${a}`).join(', ')}</span>
                    )}
                  </div>

                  {/* Sample posts */}
                  {topic.samplePosts && topic.samplePosts.length > 0 && (
                    <details className="mb-2">
                      <summary className="text-[11px] text-accent cursor-pointer hover:underline">
                        {topic.samplePosts.length} posts about this
                      </summary>
                      <div className="mt-1.5 space-y-1.5">
                        {topic.samplePosts.map((sp, si) => (
                          <div key={si} className="text-[11px] text-ink-3 bg-[var(--bg-warm)] rounded px-2.5 py-1.5 flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-ink-2">@{sp.author}</span>
                              <span className="text-ink-4 ml-1">{sp.engagement.toLocaleString()} eng</span>
                              <div className="mt-0.5 truncate">{sp.text}</div>
                            </div>
                            {sp.url && (
                              <a href={sp.url} target="_blank" rel="noopener noreferrer" className="btn-outline text-[10px] py-0.5 px-2 shrink-0">Open</a>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  <a
                    href={`https://x.com/search?q=${encodeURIComponent(topic.topic)}&src=typed_query&f=live`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-accent hover:underline"
                  >
                    View on X &rarr;
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ TAB: Published ═══ */}
      {activeTab === 'published' && (
        <>
          {loadingPublished && (
            <div className="space-y-3">
              <div className="section-label">Loading your content...</div>
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
            </div>
          )}

          {!loadingPublished && published.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">{'\u{1F4CB}'}</div>
              <div className="empty-state-title">No published content yet</div>
              <div className="empty-state-desc">Content you create and copy from the Post today or From your replies tabs will appear here for cross-platform repurposing.</div>
            </div>
          )}

          {!loadingPublished && published.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-ink-4 mb-2">Your created content — repurpose to any platform.</div>
              {published.map(item => {
                const content = item.metadata?.content ?? ''
                const repurposed = repurposeResults[item.id]
                const isRepurposing = repurposing?.startsWith(item.id)
                const isCopied = copiedPublished === item.id

                // Determine available target formats (exclude current format)
                const currentFormat = item.action_type
                const allFormats = [
                  { key: 'x_thread', label: 'X Thread', icon: '\u{1F9F5}' },
                  { key: 'x_post', label: 'X Post', icon: '\u270F\uFE0F' },
                  { key: 'li_post', label: 'LinkedIn Post', icon: '\u{1F4DD}' },
                  { key: 'li_carousel', label: 'Carousel Outline', icon: '\u{1F3A0}' },
                ]
                const targetFormats = allFormats.filter(f => f.key !== currentFormat)

                return (
                  <div key={item.id} className="card p-4">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`badge text-[10px] ${
                        item.action_type.startsWith('x_') || item.action_type === 'reply' ? 'badge-replied' : 'badge-icp'
                      }`}>
                        {FORMAT_LABELS[item.action_type] ?? item.action_type}
                      </span>
                      {item.metadata?.topic && (
                        <span className="text-[11px] text-ink-4">{item.metadata.topic as string}</span>
                      )}
                      <span className="text-[10px] text-ink-4 ml-auto">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Content preview */}
                    <div className="text-xs text-ink leading-relaxed bg-[var(--bg-warm)] rounded-lg px-3 py-2.5 mb-3 whitespace-pre-wrap">
                      {content.length > 300 ? content.substring(0, 300) + '...' : content}
                    </div>

                    {/* Repurpose buttons */}
                    {!repurposed && (
                      <div className="flex flex-wrap gap-2">
                        {targetFormats.map(fmt => (
                          <button
                            key={fmt.key}
                            className="btn-outline text-xs"
                            disabled={isRepurposing}
                            onClick={() => repurposeTo(item, fmt.key)}
                          >
                            {repurposing === `${item.id}-${fmt.key}` ? '...' : `${fmt.icon} ${fmt.label}`}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Repurposed result */}
                    {repurposed && (
                      <div className="mt-2">
                        <div className="text-[10px] text-ink-4 mb-1 uppercase tracking-wider">
                          {FORMAT_LABELS[repurposed.format] ?? repurposed.format}
                        </div>
                        {repurposed.format === 'x_thread' ? (
                          <div className="flex flex-col gap-1.5 mb-2">
                            {repurposed.content.split(/\n---\n/).map((tweet, ti) => (
                              <div key={ti} className="text-xs text-ink leading-relaxed bg-[var(--bg-warm)] rounded px-2.5 py-2">
                                <span className="text-ink-4 text-[10px] mr-1">{ti + 1}.</span>{tweet.trim()}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-ink leading-relaxed bg-[var(--bg-warm)] rounded-lg px-3 py-2.5 mb-2 whitespace-pre-wrap">
                            {repurposed.content}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            className="btn-primary text-xs"
                            onClick={() => handleCopyPublished(item.id, repurposed.content, repurposed.format)}
                          >
                            {isCopied ? 'Copied!' : 'Copy & post'}
                          </button>
                          <button
                            className="btn-outline text-xs"
                            onClick={() => setRepurposeResults(prev => {
                              const next = { ...prev }
                              delete next[item.id]
                              return next
                            })}
                          >
                            Try different format
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
