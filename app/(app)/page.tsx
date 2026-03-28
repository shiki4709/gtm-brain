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

interface TaskState {
  [url: string]: 'done' | 'skipped'
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
  const [tasks, setTasks] = useState<TaskState>({})

  // Draft reply state
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

  function markDone(url: string) {
    setTasks(prev => ({ ...prev, [url]: 'done' }))
  }

  function markSkipped(url: string) {
    setTasks(prev => ({ ...prev, [url]: 'skipped' }))
  }

  function undoTask(url: string) {
    setTasks(prev => {
      const next = { ...prev }
      delete next[url]
      return next
    })
  }

  function getRecommendation(item: FeedItem): { actions: Array<{ label: string; type: 'scrape' | 'reply' | 'content' | 'skip'; priority: 'high' | 'medium' | 'low' }>; reason: string } {
    const likes = item.engagement?.likes ?? 0
    const comments = item.engagement?.replies ?? 0
    const rts = item.engagement?.retweets ?? 0
    const totalEngagement = likes + comments + rts

    if (item.platform === 'linkedin') {
      const textLower = item.text.toLowerCase()
      const matchedTopic = insights?.topics?.find(t => textLower.includes(t.topic.toLowerCase()))
      const hasQuestion = item.text.includes('?')
      const actions: Array<{ label: string; type: 'scrape' | 'reply' | 'content' | 'skip'; priority: 'high' | 'medium' | 'low' }> = []

      // High comments = highest quality leads (comments have 15x weight of likes)
      if (comments >= 10) {
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'high' })
        if (matchedTopic) {
          return { actions, reason: `${comments} comments (15x more valuable than likes). Topic "${matchedTopic.topic}" yields ${Math.round(matchedTopic.avg_icp_rate * 100)}% ICP match.` }
        }
        return { actions, reason: `${comments} comments — commenters are the highest-quality leads to DM. They've already shown interest.` }
      }

      // High engagement + topic match = scrape
      if (totalEngagement >= 20 && matchedTopic) {
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'high' })
        return { actions, reason: `${totalEngagement} engagers + topic "${matchedTopic.topic}" matches your best-performing ICP topic (${Math.round(matchedTopic.avg_icp_rate * 100)}%).` }
      }

      // Question posts get 40-60% more comments = great for scraping
      if (hasQuestion && totalEngagement >= 10) {
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'high' })
        return { actions, reason: `Question post with ${totalEngagement} engagers. Question posts get 40-60% more comments — great lead quality.` }
      }

      // Good engagement = scrape + consider content regen
      if (totalEngagement >= 20) {
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'medium' })
        actions.push({ label: 'Use as content idea', type: 'content', priority: 'low' })
        return { actions, reason: `${totalEngagement} engagers. Scrape for ICP leads. This topic resonates — consider writing your own take.` }
      }

      // Moderate engagement = still worth scraping
      if (totalEngagement >= 5) {
        actions.push({ label: 'Scrape engagers', type: 'scrape', priority: 'medium' })
        return { actions, reason: `${totalEngagement} engagers — worth scraping for ICP leads.` }
      }

      // Low engagement = maybe use as content idea
      actions.push({ label: 'Use as content idea', type: 'content', priority: 'low' })
      actions.push({ label: 'Skip', type: 'skip', priority: 'low' })
      return { actions, reason: `Low engagement (${totalEngagement}). Not worth scraping, but the topic might inspire your own post.` }
    }

    // ═══ X ═══
    const actions: Array<{ label: string; type: 'scrape' | 'reply' | 'content' | 'skip'; priority: 'high' | 'medium' | 'low' }> = []

    // Viral tweet = reply ASAP for maximum visibility
    if (likes >= 100 || comments >= 20) {
      actions.push({ label: 'Reply now', type: 'reply', priority: 'high' })
      return { actions, reason: `🔥 Viral — ${likes} likes, ${comments} replies. First 60-90 min matter most. Your reply gets seen by everyone in the thread.` }
    }

    // High likes but low replies = underserved thread, your reply stands out
    if (likes >= 30 && comments < 5) {
      actions.push({ label: 'Reply — you\'ll stand out', type: 'reply', priority: 'high' })
      return { actions, reason: `${likes} likes but only ${comments} replies. Underserved thread — your reply will be one of few and get disproportionate visibility.` }
    }

    // Good engagement = worth replying
    if (likes >= 10 || comments >= 5) {
      actions.push({ label: 'Draft reply', type: 'reply', priority: 'medium' })
      return { actions, reason: `${totalEngagement} total engagement. Replying builds visibility with ${item.author}'s audience.` }
    }

    // Low engagement = skip or low priority
    actions.push({ label: 'Draft reply', type: 'reply', priority: 'low' })
    actions.push({ label: 'Skip', type: 'skip', priority: 'low' })
    return { actions, reason: `Low engagement (${totalEngagement}). Reply if you have something genuinely valuable to add, otherwise skip.` }
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
            <span className="font-head text-xl font-bold text-ink">GTM Brain</span>
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

  // ═══ RETURNING USER — TASK QUEUE ═══
  return (
    <div className="max-w-2xl mx-auto">
      {/* Compact add */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={addInput}
          onChange={e => setAddInput(e.target.value)}
          placeholder="Watch someone: LinkedIn URL or @handle..."
          className="input flex-1 py-2 px-3 text-sm"
          onKeyDown={e => { if (e.key === 'Enter') addToWatchlist() }}
        />
        <button onClick={addToWatchlist} disabled={adding || !addInput.trim()} className="btn-accent">
          {adding ? '...' : '+ Watch'}
        </button>
      </div>

      {loadingFeed ? (
        <div className="text-sm text-ink-4 py-8 text-center">Loading your tasks...</div>
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
                      </div>
                      {item.engagement && (
                        <div className="flex gap-3 text-[11px] text-ink-4 mb-2">
                          {(item.engagement.likes ?? 0) > 0 && <span>{item.engagement.likes} likes</span>}
                          {(item.engagement.replies ?? 0) > 0 && <span className="font-semibold text-accent">{item.engagement.replies} comments</span>}
                          {(item.engagement.retweets ?? 0) > 0 && <span>{item.engagement.retweets} shares</span>}
                        </div>
                      )}
                      <div className="text-xs text-ink-2 leading-relaxed mb-2">{item.text}</div>
                      <div className="text-[11px] text-accent leading-relaxed mb-3">→ {rec.reason}</div>
                      <div className="flex flex-wrap gap-2">
                        {rec.actions.map((a, j) => {
                          if (a.type === 'scrape') return (
                            <Link key={j} href={`/find-leads?scrape=${encodeURIComponent(item.url)}`}
                              className={a.priority === 'high' ? 'btn-primary' : 'btn-accent'}
                              onClick={() => markDone(item.url)}>
                              {a.label}
                            </Link>
                          )
                          if (a.type === 'content') return (
                            <Link key={j} href={`/build-presence?topic=${encodeURIComponent(item.text.slice(0, 100))}`}
                              className="btn-outline" onClick={() => markDone(item.url)}>
                              {a.label}
                            </Link>
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
              <div className="text-center py-6 text-xs text-ink-4">No new LinkedIn posts. Check back later.</div>
            ) : (
              <div className="border border-dashed border-rule rounded-[var(--radius)] p-4 text-center">
                <div className="text-xs text-ink-4 mb-2">Add LinkedIn profiles to watch</div>
                <input
                  type="text"
                  placeholder="linkedin.com/in/markroberge"
                  className="input py-2 px-3 text-sm max-w-sm mx-auto"
                  onKeyDown={e => { if (e.key === 'Enter') { setAddPlatform('linkedin'); setAddInput((e.target as HTMLInputElement).value); addToWatchlist() } }}
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
                      <div className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--accent-orange)' }}>→ {rec.reason}</div>
                      <div className="flex gap-2">
                        <button onClick={() => handleDraftReply(item)} disabled={draftingUrl === item.url}
                          className={rec.actions[0]?.priority === 'high' ? 'btn-primary' : 'btn-accent'}>
                          {draftingUrl === item.url ? 'Drafting...' : rec.actions[0]?.label ?? 'Draft reply'}
                        </button>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-outline">Open on X</a>
                        <button onClick={() => markSkipped(item.url)} className="text-[11px] text-ink-4 hover:text-ink ml-auto">Skip</button>
                      </div>

                      {draftReply && (
                        <div className="mt-3 pt-3 border-t border-rule-light">
                          <div className="text-sm text-ink bg-[var(--bg-warm)] rounded-lg px-3 py-2 mb-2 leading-relaxed">{draftReply}</div>
                          <div className="flex gap-2">
                            <button className="btn-primary" onClick={() => { copyAndOpen(draftReply, item.url); markDone(item.url) }}>
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
              <div className="text-center py-6 text-xs text-ink-4">No new tweets. Check back later.</div>
            ) : (
              <div className="border border-dashed border-rule rounded-[var(--radius)] p-4 text-center">
                <div className="text-xs text-ink-4 mb-2">Add X accounts to watch</div>
                <input
                  type="text"
                  placeholder="@markroberge"
                  className="input py-2 px-3 text-sm max-w-sm mx-auto"
                  onKeyDown={e => { if (e.key === 'Enter') { setAddPlatform('x'); setAddInput((e.target as HTMLInputElement).value); addToWatchlist() } }}
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
