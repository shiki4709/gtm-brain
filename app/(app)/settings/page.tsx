'use client'

import { useState, useEffect } from 'react'

interface UserData {
  id: string
  email: string
  name: string
  icp_config: { titles: string[]; exclude: string[]; track_keywords?: string[] }
  x_accounts: string[]
  x_topics: string[]
}

interface WatchlistEntry {
  id: string
  platform: string
  username: string
  display_name: string
  profile_url: string
}

interface Suggestion {
  platform: string
  username: string
  name: string
  reason: string
  headline?: string
  followers?: number
}

export default function Settings() {
  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // ICP
  const [titles, setTitles] = useState<string[]>([])
  const [titleInput, setTitleInput] = useState('')
  const [excludes, setExcludes] = useState<string[]>([])
  const [excludeInput, setExcludeInput] = useState('')

  // Topic keywords for ICP relevance
  const [trackKeywords, setTrackKeywords] = useState<string[]>([])
  const [trackKeywordInput, setTrackKeywordInput] = useState('')


  // Watchlist
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'brain'; text: string; suggestions?: Suggestion[] }>>([])
  const [watchingInProgress, setWatchingInProgress] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/user').then(r => r.json()),
      fetch('/api/watchlist').then(r => r.json()),
    ]).then(([userJson, wlJson]) => {
      if (userJson.success && userJson.data) {
        const u = userJson.data as UserData
        setUser(u)
        setTitles(u.icp_config?.titles ?? [])
        setExcludes(u.icp_config?.exclude ?? [])
        setTrackKeywords(u.icp_config?.track_keywords ?? [])
      }
      if (wlJson.success) setWatchlist(wlJson.data ?? [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function chatFindPeople(query: string) {
    setChatMessages(prev => [...prev, { role: 'user', text: query }])
    setChatInput('')
    setChatLoading(true)
    try {
      const res = await fetch('/api/suggest-watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const json = await res.json()
      if (json.success && json.suggestions?.length > 0) {
        setChatMessages(prev => [...prev, { role: 'brain', text: `Found ${json.suggestions.length} people:`, suggestions: json.suggestions }])
      } else {
        setChatMessages(prev => [...prev, { role: 'brain', text: 'No results — try being more specific or describing a different niche.' }])
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'brain', text: 'Something went wrong. Try again.' }])
    }
    finally { setChatLoading(false) }
  }

  async function addToWatchlist(platform: string, username: string, displayName: string) {
    setWatchingInProgress(username)
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, username, display_name: displayName }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setWatchlist(prev => [json.data, ...prev])
      }
    } catch { /* silently fail */ }
    finally { setWatchingInProgress(null) }
  }

  async function removeFromWatchlist(id: string) {
    await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' })
    setWatchlist(prev => prev.filter(w => w.id !== id))
  }

  function addToList(value: string, list: string[], setList: (v: string[]) => void, setInput: (v: string) => void) {
    const trimmed = value.trim().replace(/^@/, '')
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed])
    }
    setInput('')
  }

  function removeFromList(value: string, list: string[], setList: (v: string[]) => void) {
    setList(list.filter(v => v !== value))
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      // Save ICP
      await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icp_titles: titles, icp_exclude: excludes, track_keywords: trackKeywords }),
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // Failed silently
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sm text-ink-4 py-8 text-center">Loading...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-head text-2xl font-bold text-ink mb-2">Settings</h1>
      <p className="text-sm text-ink-3 mb-8">
        Configure your ICP, X engagement accounts, and preferences.
      </p>

      {/* Account */}
      <div className="mb-10">
        <div className="section-label mb-3">Account</div>
        <div className="border-l-2 border-rule pl-4">
          <div className="text-sm text-ink">{user?.name}</div>
          <div className="text-xs text-ink-4">{user?.email}</div>
        </div>
      </div>

      {/* People you watch */}
      <div className="mb-10">
        <div className="section-label mb-1">People you watch</div>
        <p className="text-xs text-ink-4 mb-3">Tell the brain who you want to follow. It finds real influencers on LinkedIn and X.</p>

        {/* Current watchlist */}
        {watchlist.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {watchlist.map(w => (
              <span key={w.id} className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-full ${
                w.platform === 'linkedin' ? 'bg-accent/10 text-accent' : 'bg-[var(--accent-orange)]/10'
              }`} style={w.platform === 'x' ? { color: 'var(--accent-orange)' } : undefined}>
                {w.platform === 'x' ? '@' : ''}{w.display_name ?? w.username}
                <button onClick={() => removeFromWatchlist(w.id)} className="hover:opacity-60 ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}

        {/* Chat */}
        <div className="border border-rule rounded-[var(--radius)] overflow-hidden">
          {/* Messages */}
          {chatMessages.length > 0 && (
            <div className="max-h-[400px] overflow-y-auto p-4 flex flex-col gap-3">
              {chatMessages.map((msg, i) => (
                <div key={i}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="bg-accent text-white text-sm px-3 py-2 rounded-2xl rounded-br-md max-w-[80%]">
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs text-ink-3 mb-2">{msg.text}</div>
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          {msg.suggestions.map((s, j) => {
                            const isAdding = watchingInProgress === s.username
                            const alreadyWatched = watchlist.some(w => w.username.toLowerCase() === s.username.toLowerCase())
                            return (
                              <div key={j} className="bg-[var(--bg-warm)] rounded-lg px-3 py-2.5 flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded ${
                                      s.platform === 'linkedin' ? 'bg-accent/10 text-accent' : 'bg-[var(--accent-orange)]/10'
                                    }`} style={s.platform === 'x' ? { color: 'var(--accent-orange)' } : undefined}>
                                      {s.platform === 'linkedin' ? 'in' : 'X'}
                                    </span>
                                    <span className="text-sm font-semibold text-ink">{s.name}</span>
                                    {s.followers && s.followers > 0 && (
                                      <span className="text-[10px] text-ink-4">{s.followers >= 1000 ? `${Math.round(s.followers / 1000)}K` : s.followers}</span>
                                    )}
                                  </div>
                                  {s.headline && <div className="text-[10px] text-ink-3 truncate">{s.headline}</div>}
                                </div>
                                {alreadyWatched ? (
                                  <span className="text-[10px] text-green-600 shrink-0 ml-2">Watching</span>
                                ) : (
                                  <button
                                    className="text-[11px] text-accent font-semibold hover:underline shrink-0 ml-2"
                                    disabled={isAdding}
                                    onClick={() => addToWatchlist(s.platform, s.username, s.name)}
                                  >
                                    {isAdding ? '...' : '+ Watch'}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div className="text-xs text-ink-4">Searching...</div>
              )}
            </div>
          )}

          {/* Input */}
          <div className={`flex gap-2 p-3 ${chatMessages.length > 0 ? 'border-t border-rule' : ''}`}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={chatMessages.length === 0 ? 'e.g. "SaaS sales leaders" or "DevTools founders who post about PLG"' : 'Try another search...'}
              className="flex-1 py-2 px-3 text-sm bg-transparent outline-none placeholder:text-ink-4"
              onKeyDown={e => { if (e.key === 'Enter' && chatInput.trim() && !chatLoading) chatFindPeople(chatInput.trim()) }}
            />
            <button onClick={() => chatFindPeople(chatInput.trim())} disabled={chatLoading || !chatInput.trim()}
              className="text-accent font-semibold text-sm hover:underline disabled:opacity-30 disabled:no-underline">
              {chatLoading ? '...' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      <hr className="border-rule-light my-10" />

      {/* ICP Config */}
      <div className="mb-10">
        <div className="section-label mb-1">ICP — Target titles</div>
        <p className="text-xs text-ink-4 mb-3">Job titles you want to reach. Used to filter leads from every scrape.</p>

        {titles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {titles.map(t => (
              <span key={t} className="badge badge-icp flex items-center gap-1.5 text-xs py-1.5 px-3">
                {t}
                <button onClick={() => removeFromList(t, titles, setTitles)} className="text-accent hover:text-accent-deep ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="input flex-1 py-2.5 px-4 text-sm"
            placeholder="Add a title..."
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToList(titleInput, titles, setTitles, setTitleInput) } }}
          />
          <button className="btn-accent" onClick={() => addToList(titleInput, titles, setTitles, setTitleInput)} disabled={!titleInput.trim()}>Add</button>
        </div>
      </div>

      {/* ICP Excludes */}
      <div className="mb-10">
        <div className="section-label mb-1">ICP — Exclude</div>
        <p className="text-xs text-ink-4 mb-3">Titles to filter out from results.</p>

        {excludes.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {excludes.map(t => (
              <span key={t} className="badge badge-drafted flex items-center gap-1.5 text-xs py-1.5 px-3">
                {t}
                <button onClick={() => removeFromList(t, excludes, setExcludes)} className="text-ink-3 hover:text-ink ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="input flex-1 py-2.5 px-4 text-sm"
            placeholder="Add exclusion..."
            value={excludeInput}
            onChange={e => setExcludeInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToList(excludeInput, excludes, setExcludes, setExcludeInput) } }}
          />
          <button className="btn-outline" onClick={() => addToList(excludeInput, excludes, setExcludes, setExcludeInput)} disabled={!excludeInput.trim()}>Add</button>
        </div>
      </div>

      {/* Topic keywords */}
      <div className="mb-10">
        <div className="section-label mb-1">Topics to track</div>
        <p className="text-xs text-ink-4 mb-3">Keywords that make a post relevant to your ICP. Posts matching these get boosted in the Feed. Posts that don&apos;t match get marked &quot;Off-topic.&quot;</p>

        {trackKeywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {trackKeywords.map(t => (
              <span key={t} className="badge flex items-center gap-1.5 text-xs py-1.5 px-3 bg-green-100 text-green-700">
                {t}
                <button onClick={() => removeFromList(t, trackKeywords, setTrackKeywords)} className="hover:opacity-60 ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="input flex-1 py-2.5 px-4 text-sm"
            placeholder="e.g. AI, automation, sales hiring, GTM strategy..."
            value={trackKeywordInput}
            onChange={e => setTrackKeywordInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToList(trackKeywordInput.toLowerCase(), trackKeywords, setTrackKeywords, setTrackKeywordInput) } }}
          />
          <button className="btn-accent" onClick={() => addToList(trackKeywordInput.toLowerCase(), trackKeywords, setTrackKeywords, setTrackKeywordInput)} disabled={!trackKeywordInput.trim()}>Add</button>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-8 py-3"
        >
          {saving ? 'Saving...' : 'Save all settings'}
        </button>
        {saved && <span className="text-xs text-green">Settings saved</span>}
      </div>
    </div>
  )
}
