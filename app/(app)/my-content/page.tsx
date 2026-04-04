'use client'
import { useState, useEffect, useCallback } from 'react'

interface MyContentItem {
  id: string
  type: 'reply' | 'thread' | 'quote' | 'post'
  platform: 'x' | 'linkedin'
  text: string
  url: string
  createdAt: string
  engagement: { likes: number; replies: number; retweets: number; views?: number }
  replyTo?: { author: string; text: string; url: string }
  fromBrain: boolean
}

type FilterTab = 'all' | 'replies' | 'posts' | 'threads'
type SortMode = 'engagement' | 'recency'

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

function totalEngagement(item: MyContentItem): number {
  return item.engagement.likes + item.engagement.replies + item.engagement.retweets
}

export default function MyContentPage() {
  const [items, setItems] = useState<MyContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [platform, setPlatform] = useState<'all' | 'x' | 'linkedin'>('all')
  const [sort, setSort] = useState<SortMode>('recency')

  const fetchContent = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/my-content')
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? json.message ?? 'Failed to load content')
        setItems([])
        return
      }
      setItems(json.items ?? [])
    } catch {
      setError('Failed to fetch content')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchContent() }, [fetchContent])

  // Filter by platform then type
  const filtered = items.filter(item => {
    if (platform !== 'all' && item.platform !== platform) return false
    if (filter === 'all') return true
    if (filter === 'replies') return item.type === 'reply'
    if (filter === 'posts') return item.type === 'post' || item.type === 'quote'
    if (filter === 'threads') return item.type === 'thread'
    return true
  })

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'engagement') return totalEngagement(b) - totalEngagement(a)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const tabs: Array<{ key: FilterTab; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'replies', label: 'Replies' },
    { key: 'posts', label: 'Posts' },
    { key: 'threads', label: 'Threads' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-head text-xl font-bold text-ink">My Content</h1>
        <button
          onClick={fetchContent}
          disabled={loading}
          className="btn-outline text-xs"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Platform toggle */}
      <div className="flex gap-1 mb-3">
        {([
          { key: 'all' as const, label: 'All platforms' },
          { key: 'x' as const, label: 'X / Twitter' },
          { key: 'linkedin' as const, label: 'LinkedIn' },
        ]).map(p => (
          <button
            key={p.key}
            onClick={() => setPlatform(p.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              platform === p.key
                ? 'text-ink bg-[var(--blue-tint)]'
                : 'text-ink-4 hover:text-ink-3 hover:bg-[var(--rule-light)]'
            }`}
          >
            {p.label}
            {p.key !== 'all' && (
              <span className="ml-1 text-[10px] opacity-60">
                {items.filter(i => i.platform === p.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filter tabs + sort toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filter === tab.key
                  ? 'text-ink bg-[var(--blue-tint)]'
                  : 'text-ink-4 hover:text-ink-3 hover:bg-[var(--rule-light)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSort(prev => prev === 'recency' ? 'engagement' : 'recency')}
          className="text-xs text-ink-4 hover:text-ink transition-colors"
        >
          Sort: {sort === 'recency' ? 'Newest' : 'Top engagement'}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="card p-4 mb-4 text-sm text-ink-4">{error}</div>
      )}

      {/* Loading state */}
      {loading && items.length === 0 && (
        <div className="card p-8 text-center text-ink-4 text-sm">
          Loading your content...
        </div>
      )}

      {/* Empty state */}
      {!loading && sorted.length === 0 && !error && (
        <div className="card p-8 text-center text-ink-4 text-sm">
          No content found. Make sure your X handle is set in Settings.
        </div>
      )}

      {/* Content list */}
      <div className="flex flex-col gap-3">
        {sorted.map(item => (
          <div key={item.id} className="card p-4">
            {/* Header: type badge + timestamp + via Brain badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                item.type === 'reply'
                  ? 'bg-[var(--blue-tint)] text-[var(--accent)]'
                  : item.type === 'quote'
                  ? 'bg-[var(--purple-tint,rgba(139,92,246,0.1))] text-[var(--purple,#8b5cf6)]'
                  : 'bg-[var(--green-tint,rgba(34,197,94,0.1))] text-[var(--green,#22c55e)]'
              }`}>
                {item.type}
              </span>
              <span className="text-[11px] text-ink-4">{relativeTime(item.createdAt)}</span>
              {item.fromBrain && (
                <span className="badge text-[10px]">via Brain</span>
              )}
            </div>

            {/* Reply context */}
            {item.replyTo && (
              <div className="mb-2 px-3 py-2 rounded-md bg-[var(--rule-light)] text-xs text-ink-4">
                <span className="font-semibold text-ink-3">In reply to {item.replyTo.author}:</span>{' '}
                <span className="line-clamp-2">{item.replyTo.text}</span>
                <a
                  href={item.replyTo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline ml-1"
                >
                  View
                </a>
              </div>
            )}

            {/* Your text */}
            <p className="text-sm text-ink mb-3 whitespace-pre-wrap line-clamp-4">
              {item.text}
            </p>

            {/* Engagement row */}
            <div className="flex items-center gap-4 text-xs text-ink-4">
              <span title="Likes">
                <svg className="inline w-3.5 h-3.5 mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                {item.engagement.likes}
              </span>
              <span title="Replies">
                <svg className="inline w-3.5 h-3.5 mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                {item.engagement.replies}
              </span>
              <span title="Retweets">
                <svg className="inline w-3.5 h-3.5 mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                {item.engagement.retweets}
              </span>
              {item.engagement.views !== undefined && item.engagement.views !== null && (
                <span title="Views">
                  <svg className="inline w-3.5 h-3.5 mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  {item.engagement.views.toLocaleString()}
                </span>
              )}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[var(--accent)] hover:underline text-xs"
              >
                Open on X &rarr;
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
