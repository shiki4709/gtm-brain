'use client'

import { useState, useEffect, useCallback } from 'react'

interface ContentSource {
  id: string
  platform: string
  source_type: string
  name: string
  feed_url: string | null
  profile_url: string | null
  is_own_content: boolean
  auto_repurpose: boolean
  target_platforms: string[]
  last_ingested_at: string | null
  created_at: string
  sb_content_items: Array<{ count: number }>
}

interface ContentItem {
  id: string
  title: string
  content: string
  url: string
  platform: string
  published_at: string
  takes_extracted: boolean
  repurposed: boolean
  repurposed_content: Record<string, string>
  ingested_at: string
}

interface PlatformCapabilities {
  supportsRss: boolean
  displayName: string
  repurposeTo: string[]
}

type ViewMode = 'sources' | 'items'

const PLATFORM_ICONS: Record<string, string> = {
  substack: 'S',
  medium: 'M',
  ghost: 'G',
  blog: 'B',
  linkedin: 'in',
  x: 'X',
}

const PLATFORM_COLORS: Record<string, string> = {
  substack: 'bg-[#FF6719]',
  medium: 'bg-[#000000]',
  ghost: 'bg-[#15171A]',
  blog: 'bg-[#4A90D9]',
  linkedin: 'bg-[#0A66C2]',
  x: 'bg-[#1DA1F2]',
}

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

export default function ContentSourcesPage() {
  const [sources, setSources] = useState<ContentSource[]>([])
  const [platforms, setPlatforms] = useState<Record<string, PlatformCapabilities>>({})
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('sources')
  const [selectedSource, setSelectedSource] = useState<ContentSource | null>(null)

  // Add source form
  const [showAdd, setShowAdd] = useState(false)
  const [addPlatform, setAddPlatform] = useState('substack')
  const [addName, setAddName] = useState('')
  const [addIdentifier, setAddIdentifier] = useState('')
  const [addOwnContent, setAddOwnContent] = useState(true)
  const [addAutoRepurpose, setAddAutoRepurpose] = useState(true)
  const [adding, setAdding] = useState(false)

  // Ingest state
  const [ingesting, setIngesting] = useState<string | null>(null)
  const [ingestResult, setIngestResult] = useState<{ ingested: number; processed: Array<{ takesExtracted: number; repurposedTo: string[] }> } | null>(null)

  const fetchSources = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/content-sources')
      const json = await res.json()
      if (json.success) {
        setSources(json.sources ?? [])
        setPlatforms(json.platforms ?? {})
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSources() }, [fetchSources])

  async function addSource() {
    if (!addName || !addIdentifier) return
    setAdding(true)
    try {
      const res = await fetch('/api/content-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: addPlatform,
          name: addName,
          identifier: addIdentifier,
          isOwnContent: addOwnContent,
          autoRepurpose: addAutoRepurpose,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setSources(prev => [json.source, ...prev])
        setShowAdd(false)
        setAddName('')
        setAddIdentifier('')
      }
    } catch {
      // silently fail
    } finally {
      setAdding(false)
    }
  }

  async function deleteSource(id: string) {
    await fetch(`/api/content-sources?id=${id}`, { method: 'DELETE' })
    setSources(prev => prev.filter(s => s.id !== id))
    if (selectedSource?.id === id) {
      setSelectedSource(null)
      setView('sources')
    }
  }

  async function ingestSource(source: ContentSource) {
    setIngesting(source.id)
    setIngestResult(null)
    try {
      const res = await fetch('/api/content-sources/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: source.id }),
      })
      const json = await res.json()
      if (json.success) {
        setIngestResult({ ingested: json.ingested, processed: json.processed ?? [] })
        fetchSources() // refresh counts
      }
    } catch {
      // silently fail
    } finally {
      setIngesting(null)
    }
  }

  async function viewSourceItems(source: ContentSource) {
    setSelectedSource(source)
    setView('items')
    try {
      const res = await fetch(`/api/content-sources/ingest?sourceId=${source.id}`)
      const json = await res.json()
      if (json.success) {
        setItems(json.items ?? [])
      }
    } catch {
      setItems([])
    }
  }

  const itemCount = (source: ContentSource): number => {
    return source.sb_content_items?.[0]?.count ?? 0
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-head font-bold text-ink">Content Sources</h1>
          <p className="text-xs text-ink-4 mt-0.5">
            Connect your content from any platform. Auto-extract takes and repurpose everywhere.
          </p>
        </div>
        <div className="flex gap-2">
          {view === 'items' && (
            <button
              onClick={() => { setView('sources'); setSelectedSource(null) }}
              className="btn-outline text-xs"
            >
              ← Back
            </button>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="btn-primary text-xs"
          >
            + Add Source
          </button>
        </div>
      </div>

      {/* Add source form */}
      {showAdd && (
        <div className="card p-4 mb-4">
          <div className="text-xs font-semibold text-ink mb-3">Add Content Source</div>

          {/* Platform selector */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {Object.entries(platforms).map(([key, cap]) => (
              <button
                key={key}
                onClick={() => setAddPlatform(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  addPlatform === key
                    ? 'text-ink bg-[var(--blue-tint)]'
                    : 'text-ink-4 hover:text-ink-3 hover:bg-[var(--rule-light)]'
                }`}
              >
                <span className={`w-4 h-4 rounded text-[8px] font-bold text-white flex items-center justify-center ${PLATFORM_COLORS[key] ?? 'bg-ink-4'}`}>
                  {PLATFORM_ICONS[key] ?? key[0].toUpperCase()}
                </span>
                {cap.displayName}
                {cap.supportsRss && <span className="text-[9px] opacity-50">RSS</span>}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-2 mb-3">
            <input
              type="text"
              placeholder="Display name (e.g. Almost Technical)"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              className="input text-xs"
            />
            <input
              type="text"
              placeholder={
                platforms[addPlatform]?.supportsRss
                  ? 'Subdomain or feed URL (e.g. almosttechnicalai)'
                  : 'Handle or profile URL (e.g. @harukatakamori)'
              }
              value={addIdentifier}
              onChange={e => setAddIdentifier(e.target.value)}
              className="input text-xs"
            />
          </div>

          {/* Options */}
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-1.5 text-xs text-ink-3 cursor-pointer">
              <input
                type="checkbox"
                checked={addOwnContent}
                onChange={e => setAddOwnContent(e.target.checked)}
                className="rounded"
              />
              My own content
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-3 cursor-pointer">
              <input
                type="checkbox"
                checked={addAutoRepurpose}
                onChange={e => setAddAutoRepurpose(e.target.checked)}
                className="rounded"
              />
              Auto-repurpose new posts
            </label>
          </div>

          {/* Repurpose targets preview */}
          {addAutoRepurpose && platforms[addPlatform] && (
            <div className="text-[10px] text-ink-4 mb-3">
              Will repurpose to: {platforms[addPlatform].repurposeTo.filter(p => p !== addPlatform).map(p =>
                platforms[p]?.displayName ?? p
              ).join(', ')}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={addSource}
              disabled={adding || !addName || !addIdentifier}
              className="btn-primary text-xs"
            >
              {adding ? 'Adding...' : 'Add Source'}
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-outline text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ingest result toast */}
      {ingestResult && (
        <div className="card p-3 mb-4 border-[var(--accent-green)] bg-[var(--green-tint)]">
          <div className="text-xs font-semibold text-ink">
            Ingested {ingestResult.ingested} new {ingestResult.ingested === 1 ? 'item' : 'items'}
          </div>
          {ingestResult.processed.length > 0 && (
            <div className="text-[10px] text-ink-4 mt-1">
              {ingestResult.processed.reduce((sum, p) => sum + p.takesExtracted, 0)} takes extracted
              {' · '}
              {ingestResult.processed.filter(p => p.repurposedTo.length > 0).length} items repurposed
            </div>
          )}
          <button
            onClick={() => setIngestResult(null)}
            className="text-[10px] text-ink-4 hover:text-ink mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Sources list */}
      {view === 'sources' && (
        <>
          {loading && sources.length === 0 && (
            <div className="card p-8 text-center text-ink-4 text-sm">Loading sources...</div>
          )}

          {!loading && sources.length === 0 && !showAdd && (
            <div className="card p-8 text-center">
              <div className="text-sm text-ink-4 mb-2">No content sources yet</div>
              <div className="text-xs text-ink-4 mb-4">
                Connect your Substack, LinkedIn, X, or blog to auto-repurpose content across platforms.
              </div>
              <button onClick={() => setShowAdd(true)} className="btn-primary text-xs">
                + Add Your First Source
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {sources.map(source => (
              <div key={source.id} className="card p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  {/* Platform icon */}
                  <span className={`w-6 h-6 rounded text-[10px] font-bold text-white flex items-center justify-center shrink-0 ${PLATFORM_COLORS[source.platform] ?? 'bg-ink-4'}`}>
                    {PLATFORM_ICONS[source.platform] ?? source.platform[0].toUpperCase()}
                  </span>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">{source.name}</div>
                    <div className="text-[10px] text-ink-4 flex items-center gap-2">
                      <span>{platforms[source.platform]?.displayName ?? source.platform}</span>
                      {source.source_type === 'rss' && <span className="opacity-60">RSS</span>}
                      <span>{itemCount(source)} {itemCount(source) === 1 ? 'item' : 'items'}</span>
                      {source.last_ingested_at && (
                        <span>Last pulled {relativeTime(source.last_ingested_at)}</span>
                      )}
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {source.is_own_content && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded badge-icp">Mine</span>
                    )}
                    {source.auto_repurpose && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded badge-sent">Auto</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {source.source_type === 'rss' && (
                      <button
                        onClick={() => ingestSource(source)}
                        disabled={ingesting === source.id}
                        className="btn-primary text-[10px] px-2 py-1"
                      >
                        {ingesting === source.id ? 'Pulling...' : 'Pull'}
                      </button>
                    )}
                    <button
                      onClick={() => viewSourceItems(source)}
                      className="btn-outline text-[10px] px-2 py-1"
                    >
                      View
                    </button>
                    <button
                      onClick={() => deleteSource(source.id)}
                      className="text-[10px] text-ink-4 hover:text-[var(--accent-red)] px-1 py-1 transition-colors"
                      title="Remove source"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>

                {/* Target platforms */}
                {source.auto_repurpose && source.target_platforms && (
                  <div className="text-[10px] text-ink-4 mt-1 pl-8">
                    Repurposes to: {source.target_platforms.filter(p => p !== source.platform).map(p =>
                      platforms[p]?.displayName ?? p
                    ).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Items view for a selected source */}
      {view === 'items' && selectedSource && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className={`w-6 h-6 rounded text-[10px] font-bold text-white flex items-center justify-center ${PLATFORM_COLORS[selectedSource.platform] ?? 'bg-ink-4'}`}>
              {PLATFORM_ICONS[selectedSource.platform] ?? selectedSource.platform[0].toUpperCase()}
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">{selectedSource.name}</div>
              <div className="text-[10px] text-ink-4">{items.length} items ingested</div>
            </div>
          </div>

          {items.length === 0 && (
            <div className="card p-8 text-center">
              <div className="text-sm text-ink-4 mb-2">No content ingested yet</div>
              <div className="text-xs text-ink-4 mb-4">Pull content from this source to get started.</div>
              {selectedSource.source_type === 'rss' && (
                <button
                  onClick={() => ingestSource(selectedSource)}
                  disabled={ingesting === selectedSource.id}
                  className="btn-primary text-xs"
                >
                  {ingesting === selectedSource.id ? 'Pulling...' : 'Pull Now'}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {items.map(item => (
              <div key={item.id} className="card p-3">
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  {/* Status badges */}
                  {item.takes_extracted && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded badge-icp">Takes</span>
                  )}
                  {item.repurposed && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded badge-sent">Repurposed</span>
                  )}
                  <span className="text-[10px] text-ink-4">
                    {item.published_at ? relativeTime(item.published_at) : relativeTime(item.ingested_at)}
                  </span>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline ml-auto">
                      Open
                    </a>
                  )}
                </div>

                {/* Title */}
                {item.title && (
                  <div className="text-sm font-semibold text-ink mb-1">{item.title}</div>
                )}

                {/* Content preview */}
                <p className="text-xs text-ink-3 leading-relaxed line-clamp-3">
                  {item.content.slice(0, 300)}{item.content.length > 300 ? '...' : ''}
                </p>

                {/* Repurposed content preview */}
                {item.repurposed && item.repurposed_content && Object.keys(item.repurposed_content).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-rule">
                    <div className="text-[10px] font-semibold text-ink-4 mb-1">Repurposed versions:</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {Object.entries(item.repurposed_content).map(([platform, content]) => (
                        content && (
                          <details key={platform} className="group">
                            <summary className="text-[10px] font-semibold text-accent cursor-pointer hover:underline">
                              {platforms[platform]?.displayName ?? platform}
                            </summary>
                            <div className="mt-1 p-2 rounded bg-[var(--bg-warm)] text-xs text-ink-3 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {content}
                            </div>
                          </details>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
