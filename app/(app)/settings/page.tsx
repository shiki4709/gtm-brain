'use client'

import { useState, useEffect } from 'react'
import type { UserMode, UserGoal } from '@/lib/types'

interface UserData {
  id: string
  email: string
  name: string
  icp_config: { titles: string[]; exclude: string[]; track_keywords?: string[] }
  x_accounts: string[]
  x_topics: string[]
  mode: UserMode
  mode_set: boolean
  x_handle: string | null
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

  // Mode & Goals
  const [mode, setMode] = useState<UserMode>('personal_brand')
  const [goals, setGoals] = useState<UserGoal[]>([])
  const [savingMode, setSavingMode] = useState(false)

  // X handle for follower tracking
  const [xHandle, setXHandle] = useState('')
  const [connectingX, setConnectingX] = useState(false)
  const [xConnected, setXConnected] = useState(false)
  const [xFollowers, setXFollowers] = useState<number | null>(null)

  // Voice profile
  const [voiceProfile, setVoiceProfile] = useState<{
    tone?: string; formality?: string; sentenceStyle?: string
    vocabulary?: string; hooks?: string; avoid?: string
    samplePhrases?: string[]; analyzedAt?: string
  } | null>(null)
  const [voiceSamples, setVoiceSamples] = useState('') // reused for description text
  const [voiceAvoid, setVoiceAvoid] = useState('')
  const [voiceExtracting, setVoiceExtracting] = useState(false)
  const [voiceError, setVoiceError] = useState('')


  // Watchlist
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'brain'; text: string; suggestions?: Suggestion[] }>>([])
  const [watchingInProgress, setWatchingInProgress] = useState<string | null>(null)

  useEffect(() => {
    const safeFetch = (url: string) => fetch(url).then(r => r.json()).catch(() => ({ success: false }))
    Promise.all([
      safeFetch('/api/user'),
      safeFetch('/api/watchlist'),
      safeFetch('/api/goals'),
      safeFetch('/api/voice-profile'),
    ]).then(([userJson, wlJson, goalsJson, voiceJson]) => {
      if (userJson.success && userJson.data) {
        const u = userJson.data as UserData
        setUser(u)
        setTitles(u.icp_config?.titles ?? [])
        setExcludes(u.icp_config?.exclude ?? [])
        setTrackKeywords(u.icp_config?.track_keywords ?? [])
        setMode(u.mode ?? 'personal_brand')
        if (u.x_handle) { setXHandle(u.x_handle); setXConnected(true) }
      }
      if (wlJson.success) setWatchlist(wlJson.data ?? [])
      if (goalsJson.success) {
        setGoals(goalsJson.data?.goals ?? [])
        if (goalsJson.data?.followerDelta?.current) setXFollowers(goalsJson.data.followerDelta.current)
      }
      if (voiceJson.success && voiceJson.profile) {
        setVoiceProfile(voiceJson.profile)
        // Pre-populate description fields from existing profile
        const vp = voiceJson.profile
        if (vp.description) setVoiceSamples(vp.description)
        else if (vp.tone) setVoiceSamples(`${vp.tone}. ${vp.sentenceStyle ?? ''}. ${vp.vocabulary ?? ''}`.trim())
        if (vp.avoid) setVoiceAvoid(vp.avoid)
      }
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
        {mode === 'personal_brand' ? 'Configure your brand, voice, and who you watch.' : mode === 'b2b_outbound' ? 'Configure your ICP, pipeline, and outreach.' : 'Configure your brand, ICP, and preferences.'}
      </p>

      {/* Account */}
      <div className="mb-10">
        <div className="section-label mb-3">Account</div>
        <div className="border-l-2 border-rule pl-4">
          <div className="text-sm text-ink">{user?.name}</div>
          <div className="text-xs text-ink-4">{user?.email}</div>
        </div>
      </div>

      {/* Mode */}
      <div className="mb-10">
        <div className="section-label mb-3">Your goal</div>
        <div className="flex gap-2 flex-wrap">
          {([
            ['personal_brand', '\u{1F4E3} Grow my audience'],
            ['b2b_outbound', '\u{1F3AF} Book meetings'],
            ['both', '\u26A1 Both'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={async () => {
                setMode(value)
                setSavingMode(true)
                await fetch('/api/mode', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mode: value }),
                }).then(r => r.json()).then(json => {
                  if (json.success) {
                    fetch('/api/goals').then(r => r.json()).then(gj => {
                      if (gj.success) setGoals(gj.data?.goals ?? [])
                    })
                  }
                }).catch(() => {})
                setSavingMode(false)
              }}
              disabled={savingMode}
              className={`font-head text-xs font-semibold py-2.5 px-4 rounded-lg border transition-all ${
                mode === value
                  ? 'border-[color:var(--blue-bright)] bg-blue-tint text-accent'
                  : 'border-rule text-ink-3 hover:border-ink-4'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly Goals */}
      {goals.length > 0 && (
        <div className="mb-10">
          <div className="section-label mb-3">Weekly targets</div>
          <div className="space-y-2">
            {goals.map(g => (
              <div key={g.id} className="card-flat flex items-center gap-4 py-2.5 px-4">
                <span className="text-sm font-medium text-ink w-20 font-head">
                  {g.metric === 'reply' ? 'Replies' : g.metric === 'dm_send' ? 'DMs sent' : g.metric === 'scrape' ? 'Scrapes' : g.metric}
                </span>
                <input
                  type="number"
                  min={0}
                  className="input w-16 py-1.5 px-2 text-center font-head font-bold text-[15px]"
                  value={g.target_value}
                  onChange={e => {
                    const val = parseInt(e.target.value) || 0
                    setGoals(prev => prev.map(pg => pg.id === g.id ? { ...pg, target_value: val } : pg))
                  }}
                  onBlur={e => {
                    const val = parseInt(e.target.value) || 0
                    fetch('/api/goals', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ goal_id: g.id, target_value: val }),
                    }).catch(() => {})
                  }}
                />
                <span className="text-xs text-ink-4">/ week</span>
                <span className={`badge ml-auto ${g.mode === 'personal_brand' ? 'badge-icp' : 'badge-replied'}`}>
                  {g.mode === 'personal_brand' ? 'Brand' : 'B2B'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* X Handle for follower tracking */}
      {(mode === 'personal_brand' || mode === 'both') && (
        <div className="mb-10">
          <div className="section-label mb-1">Your X account</div>
          <p className="text-xs text-ink-4 mb-3">Connect your X handle to track follower growth automatically.</p>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-ink-3">@</span>
            <input
              className="input flex-1 py-2.5 px-3 text-sm"
              placeholder="your_handle"
              value={xHandle}
              onChange={e => setXHandle(e.target.value.replace(/^@/, ''))}
            />
            <button
              className="btn-primary"
              disabled={connectingX || !xHandle.trim()}
              onClick={async () => {
                setConnectingX(true)
                try {
                  const res = await fetch('/api/metrics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ x_handle: xHandle.trim() }),
                  })
                  const json = await res.json()
                  if (json.success) {
                    setXConnected(true)
                    setXFollowers(json.data.followers)
                  }
                } catch { /* */ }
                finally { setConnectingX(false) }
              }}
            >
              {connectingX ? 'Connecting...' : xConnected ? 'Refresh' : 'Connect'}
            </button>
          </div>
          {xConnected && xFollowers !== null && (
            <div className="mt-2 text-sm text-green">
              Connected — {xFollowers.toLocaleString()} followers
            </div>
          )}
        </div>
      )}

      {/* Voice & Tone */}
      <div className="mb-10">
        <div className="section-label mb-1">Your voice &amp; tone</div>
        <p className="text-xs text-ink-4 mb-4">
          Describe how you write. All replies, threads, and content will match this style.
        </p>

        <div className="card-flat p-4 space-y-4">
          {/* Description */}
          <div>
            <label className="font-head text-xs font-semibold text-ink block mb-1.5">How do you sound?</label>
            <textarea
              className="input w-full min-h-[80px] text-xs leading-relaxed"
              placeholder="e.g. Casual and direct. Short sentences. I use humor and sarcasm. No corporate speak. I talk like I'm texting a smart friend, not writing a blog post. Occasionally drop f-bombs."
              value={voiceSamples}
              onChange={e => setVoiceSamples(e.target.value)}
            />
          </div>

          {/* What to avoid */}
          <div>
            <label className="font-head text-xs font-semibold text-ink block mb-1.5">What should AI never sound like when writing as you?</label>
            <input
              className="input w-full text-xs"
              placeholder="e.g. No emojis, no exclamation marks, never say 'excited' or 'love this'"
              value={voiceAvoid}
              onChange={e => setVoiceAvoid(e.target.value)}
            />
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              className="btn-primary"
              disabled={voiceExtracting || !voiceSamples.trim()}
              onClick={async () => {
                setVoiceExtracting(true)
                setVoiceError('')
                try {
                  const res = await fetch('/api/voice-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description: voiceSamples.trim(), avoid: voiceAvoid.trim() }),
                  })
                  const json = await res.json()
                  if (json.success && json.profile) {
                    setVoiceProfile(json.profile)
                  } else {
                    setVoiceError(json.error ?? 'Failed to save voice')
                  }
                } catch {
                  setVoiceError('Failed to connect')
                } finally {
                  setVoiceExtracting(false)
                }
              }}
            >
              {voiceExtracting ? 'Saving...' : voiceProfile ? 'Update voice' : 'Save voice'}
            </button>
            {voiceProfile && <span className="text-[11px] text-green">Voice profile active</span>}
          </div>
          {voiceError && <div className="text-xs text-orange mt-2">{voiceError}</div>}
        </div>
      </div>

      <hr className="border-rule-light my-10" />

      {/* People you watch */}
      <div className="mb-10">
        <div className="section-label mb-1">People you watch</div>
        <p className="text-xs text-ink-4 mb-3">Tell the brain who you want to follow. It finds real influencers on LinkedIn and X.</p>

        {/* Current watchlist */}
        {watchlist.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {watchlist.map(w => (
              <span key={w.id} className={`badge flex items-center gap-1.5 text-xs py-1.5 px-3 ${
                w.platform === 'linkedin' ? 'badge-icp' : 'badge-replied'
              }`}>
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
                                    <span className={`badge ${s.platform === 'linkedin' ? 'badge-icp' : 'badge-replied'}`}>
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
                                  <span className="text-[10px] text-green shrink-0 ml-2">Watching</span>
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

      {/* ICP Config — B2B and Both only */}
      {(mode === 'b2b_outbound' || mode === 'both') && (<>
      <hr className="border-rule-light my-10" />

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
      </>)}

      {/* Topic keywords */}
      <hr className="border-rule-light my-10" />
      <div className="mb-10">
        <div className="section-label mb-1">Topics to track</div>
        <p className="text-xs text-ink-4 mb-3">Keywords that matter to you. Posts matching these get boosted in the Feed.</p>

        {trackKeywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {trackKeywords.map(t => (
              <span key={t} className="badge badge-sent flex items-center gap-1.5 text-xs py-1.5 px-3">
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
