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
      <div className="flex flex-col gap-2">
        {sorted.map(item => {
          const eng = totalEngagement(item)
          const isHot = eng >= 10
          const platformLabel = item.platform === 'linkedin' ? 'LinkedIn' : 'X'

          return (
            <div key={item.id} className={`card p-3 ${isHot ? 'border-[var(--blue-bright)]' : ''}`}>
              {/* Header: badge + meta + engagement + link */}
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  item.type === 'reply' ? 'badge-icp' : item.type === 'quote' ? 'badge-replied' : 'badge-sent'
                }`}>{item.type}</span>
                <span className="text-[10px] text-ink-4">{platformLabel} · {relativeTime(item.createdAt)}</span>
                {item.fromBrain && <span className="text-[9px] font-semibold text-[var(--accent-blue)]">via Brain</span>}
                {isHot && <span className="text-[9px] font-bold text-[var(--accent-orange)]">Top</span>}
                <span className="ml-auto text-[10px] text-ink-4 flex items-center gap-2">
                  {item.engagement.likes > 0 && <span>{item.engagement.likes} {item.engagement.likes === 1 ? 'like' : 'likes'}</span>}
                  {item.engagement.replies > 0 && <span>{item.engagement.replies} {item.engagement.replies === 1 ? 'reply' : 'replies'}</span>}
                  {item.engagement.retweets > 0 && <span>{item.engagement.retweets} RT</span>}
                  {item.engagement.views != null && item.engagement.views > 0 && <span>{item.engagement.views.toLocaleString()} views</span>}
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Open</a>
                </span>
              </div>

              {/* Reply context */}
              {item.replyTo && (
                <a href={item.replyTo.url} target="_blank" rel="noopener noreferrer"
                  className="block mb-1.5 px-2 py-1 rounded bg-[var(--bg-warm)] text-[11px] text-ink-4 truncate hover:text-ink-3">
                  <span className="font-semibold">@{item.replyTo.author.replace('@', '')}</span> {item.replyTo.text}
                </a>
              )}

              {/* Your text */}
              <p className="text-sm text-ink leading-relaxed line-clamp-3">{item.text}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
