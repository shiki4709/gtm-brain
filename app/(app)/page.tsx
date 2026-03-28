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

export default function WatchlistFeed() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [insights, setInsights] = useState<LinkedInInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [addPlatform, setAddPlatform] = useState<'linkedin' | 'x'>('linkedin')
  const [adding, setAdding] = useState(false)

  // Draft reply state for inline X replies
  const [draftingUrl, setDraftingUrl] = useState<string | null>(null)
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/watchlist').then(r => r.json()),
      fetch('/api/insights/linkedin').then(r => r.json()),
    ]).then(([wlJson, liJson]) => {
      if (wlJson.success) setWatchlist(wlJson.data ?? [])
      if (liJson.success) setInsights(liJson.data)
      if (wlJson.data?.length > 0) fetchFeed()
    }).catch(() => {}).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchFeed() {
    setLoadingFeed(true)
    try {
      const res = await fetch('/api/watchlist/feed')
      const json = await res.json()
      if (json.success) setFeed(json.items ?? [])
    } catch { /* silently fail */ }
    finally { setLoadingFeed(false) }
  }

  async function addToWatchlist() {
    if (!addInput.trim()) return
    setAdding(true)

    // Auto-detect platform from input
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
        fetchFeed()
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
        }),
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

  function getTopicNudge(text: string): string | null {
    if (!insights?.topics) return null
    const textLower = text.toLowerCase()
    for (const t of insights.topics) {
      if (textLower.includes(t.topic.toLowerCase())) {
        return `Posts about "${t.topic}" yield ${Math.round(t.avg_icp_rate * 100)}% ICP match`
      }
    }
    return null
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

  // ═══ NEW USER — no watch list ═══
  if (watchlist.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10 pt-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full gradient-dot" />
            <span className="font-head text-xl font-bold text-ink">GTM Brain</span>
          </div>
          <h1 className="font-head text-2xl font-bold text-ink mb-3">
            Your GTM starts with people
          </h1>
          <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed">
            Add influencers and thought leaders your ICP follows. When they post, you&apos;ll see it here with one-click actions.
          </p>
        </div>

        {/* Add person */}
        <div className="bg-white border border-rule rounded-[var(--radius)] p-6 mb-6">
          <div className="flex gap-3 mb-3">
            <input
              type="text"
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
              placeholder="Paste a LinkedIn profile URL or @handle..."
              className="input flex-1 py-3 px-4 text-sm"
              onKeyDown={e => { if (e.key === 'Enter') addToWatchlist() }}
            />
            <button onClick={addToWatchlist} disabled={adding || !addInput.trim()} className="btn-primary px-6 py-3">
              {adding ? '...' : 'Watch'}
            </button>
          </div>
          <div className="text-[11px] text-ink-4">
            Examples: linkedin.com/in/markroberge · @GergelyOrosz · linkedin.com/in/landon-tracy
          </div>
        </div>

        {/* How it works */}
        <div className="brain-card">
          <div className="section-label mb-4">How it works</div>
          <div className="flex flex-col gap-5">
            <div className="flex gap-4">
              <div className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
              <div className="text-xs text-ink-3 leading-relaxed">
                <strong className="text-ink">They post</strong> → you see it here instantly
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
              <div className="text-xs text-ink-3 leading-relaxed">
                <strong className="text-ink">LinkedIn post</strong> → scrape engagers → find ICP leads → draft DMs
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: 'var(--accent-orange)' }}>3</div>
              <div className="text-xs text-ink-3 leading-relaxed">
                <strong className="text-ink">X tweet</strong> → draft reply → build visibility with their audience
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: 'var(--gradient-main)', color: '#fff' }}>B</div>
              <div className="text-xs text-ink-3 leading-relaxed">
                <strong className="text-ink">Brain learns</strong> → which topics, DM styles, and reply approaches work for your ICP
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══ RETURNING USER — feed ═══
  return (
    <div className="max-w-2xl mx-auto">
      {/* Add person (compact) */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={addInput}
          onChange={e => setAddInput(e.target.value)}
          placeholder="Add person: LinkedIn URL or @handle..."
          className="input flex-1 py-2.5 px-4 text-sm"
          onKeyDown={e => { if (e.key === 'Enter') addToWatchlist() }}
        />
        <button onClick={addToWatchlist} disabled={adding || !addInput.trim()} className="btn-accent">
          {adding ? '...' : '+ Watch'}
        </button>
      </div>

      {/* Watching */}
      <div className="flex flex-wrap gap-2 mb-6">
        {watchlist.map(w => (
          <span key={w.id} className={`badge flex items-center gap-1.5 text-xs py-1.5 px-3 ${
            w.platform === 'linkedin'
              ? 'badge-icp'
              : ''
          }`} style={w.platform === 'x' ? { background: '#fff3e0', color: 'var(--accent-orange-deep)' } : undefined}>
            {w.platform === 'x' ? '@' : ''}{w.display_name ?? w.username}
            <button onClick={() => removeFromWatchlist(w.id)} className="hover:text-ink ml-0.5 text-[10px]">×</button>
          </span>
        ))}
      </div>

      {/* Feed */}
      {loadingFeed ? (
        <div className="text-sm text-ink-4 py-8 text-center">Loading feed...</div>
      ) : feed.length > 0 ? (
        <div className="flex flex-col gap-3">
          {feed.map((item, i) => {
            const nudge = getTopicNudge(item.text)
            const draftReply = draftReplies[item.url]
            return (
              <div key={i} className="bg-white border border-rule rounded-[var(--radius)] p-4 hover:border-accent transition-colors">
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${item.platform === 'linkedin' ? 'bg-accent' : ''}`}
                    style={item.platform === 'x' ? { background: 'var(--accent-orange)' } : undefined} />
                  <span className="font-head text-sm font-semibold text-ink">{item.author}</span>
                  <span className="text-[11px] text-ink-4">
                    {item.platform === 'linkedin' ? 'LinkedIn' : 'X'} · {timeAgo(item.time)}
                  </span>
                </div>

                {/* Content */}
                <div className="text-sm text-ink-2 leading-relaxed mb-3">
                  {item.text}
                </div>

                {/* Engagement (X only) */}
                {item.engagement && (
                  <div className="text-[11px] text-ink-4 mb-3">
                    {item.engagement.likes?.toLocaleString()} likes · {item.engagement.replies} replies · {item.engagement.retweets} RTs
                  </div>
                )}

                {/* Brain nudge */}
                {nudge && (
                  <div className="text-[11px] text-accent mb-3">
                    Brain: {nudge}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {item.platform === 'linkedin' && (
                    <>
                      <Link href={`/find-leads?scrape=${encodeURIComponent(item.url)}`} className="btn-primary">
                        Scrape engagers
                      </Link>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-outline">
                        View post
                      </a>
                    </>
                  )}
                  {item.platform === 'x' && (
                    <>
                      <button
                        onClick={() => handleDraftReply(item)}
                        disabled={draftingUrl === item.url}
                        className="btn-accent"
                      >
                        {draftingUrl === item.url ? '...' : 'Draft reply'}
                      </button>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-outline">
                        Open on X
                      </a>
                    </>
                  )}
                </div>

                {/* Draft reply (inline) */}
                {draftReply && (
                  <div className="mt-3 pt-3 border-t border-rule-light">
                    <div className="text-sm text-ink bg-[var(--bg-warm)] rounded-lg px-3 py-2 mb-2 leading-relaxed">
                      {draftReply}
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-primary" onClick={() => copyAndOpen(draftReply, item.url)}>
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
      ) : (
        <div className="text-center py-12 text-ink-4">
          <div className="text-sm mb-2">No recent posts from your watch list</div>
          <div className="text-xs">Add more people above, or check back later</div>
          <div className="mt-4">
            <Link href="/find-leads" className="btn-outline">Search for posts manually →</Link>
          </div>
        </div>
      )}
    </div>
  )
}
