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

export default function ContentCalendar() {
  const [calendar, setCalendar] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [editDrafts, setEditDrafts] = useState<Record<number, string>>({})

  async function generateCalendar() {
    setLoading(true)
    try {
      // Step 1: Get trending topics
      const topicsRes = await fetch('/api/topics')
      const topicsJson = await topicsRes.json()
      if (!topicsJson.success || !topicsJson.data?.topics?.length) {
        setLoading(false)
        return
      }

      // Step 2: Generate calendar from topics
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
    } catch { /* */ }
    finally { setLoading(false) }
  }

  function handleCopy(index: number, text: string) {
    navigator.clipboard.writeText(text)
    setCopied(index)
    setTimeout(() => setCopied(null), 2000)

    // Log the action
    const slot = calendar?.slots[index]
    if (slot) {
      const actionMap: Record<string, string> = { thread: 'x_thread', quote: 'x_quote', post: 'li_post', carousel: 'li_carousel' }
      const actionType = actionMap[slot.format]
      if (actionType) {
        fetch('/api/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_type: actionType }),
        }).catch(() => {})
      }
    }
  }

  // Auto-generate on mount
  useEffect(() => {
    if (!generated) generateCalendar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return (
    <div className="space-y-3">
      <div className="section-label">Generating your content calendar...</div>
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
    </div>
  )

  if (!calendar || calendar.slots.length === 0) {
    if (generated) return (
      <div className="empty-state">
        <div className="empty-state-icon">{'\u{1F4DD}'}</div>
        <div className="empty-state-title">No content ideas yet</div>
        <div className="empty-state-desc">Your feed needs more posts to find trending topics. Check back after your watched people post today.</div>
      </div>
    )

    return (
      <div className="brain-card text-center py-6">
        <div className="text-sm text-ink-3 mb-3">Generate today&apos;s content calendar based on trending topics in your feed</div>
        <button className="btn-primary" onClick={generateCalendar} disabled={loading}>
          {loading ? 'Generating...' : 'Generate content calendar'}
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Day header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="section-label !mb-0">TODAY &middot; {calendar.dayName}</div>
          <div className="text-xs text-ink-4">{calendar.slots.length - skipped.size} posts planned</div>
        </div>
        <button className="btn-outline text-xs" onClick={generateCalendar} disabled={loading}>
          {loading ? '...' : '\u21BB Regenerate'}
        </button>
      </div>

      {/* Slot cards */}
      <div className="space-y-3 mb-6">
        {calendar.slots.map((slot, i) => {
          if (skipped.has(i)) return null
          const isEditing = editing === i
          const currentDraft = editDrafts[i] ?? slot.draft
          const isCopied = copied === i
          const isThread = slot.format === 'thread'

          return (
            <div key={i} className="card p-4">
              {/* Header */}
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

              {/* Topic + signal */}
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

              {/* Source posts */}
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
                          <a href={sp.url} target="_blank" rel="noopener noreferrer" className="btn-outline text-[10px] py-0.5 px-2 shrink-0">Open post</a>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Draft */}
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

              {/* Actions */}
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
    </div>
  )
}
