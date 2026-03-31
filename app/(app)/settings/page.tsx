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
  const [voiceSamples, setVoiceSamples] = useState('')
  const [voiceExtracting, setVoiceExtracting] = useState(false)
  const [voiceError, setVoiceError] = useState('')


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
      fetch('/api/goals').then(r => r.json()),
      fetch('/api/voice-profile').then(r => r.json()),
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
      if (voiceJson.success && voiceJson.profile) setVoiceProfile(voiceJson.profile)
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
          All replies, threads, and content will match your writing style. Paste 3+ examples of your writing to train it.
        </p>

        {/* Current profile display */}
        {voiceProfile && (
          <div className="brain-card mb-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="font-head font-semibold text-ink text-[11px] uppercase tracking-wider mb-1">Tone</div>
                <div className="text-ink-3">{voiceProfile.tone}</div>
              </div>
              <div>
                <div className="font-head font-semibold text-ink text-[11px] uppercase tracking-wider mb-1">Formality</div>
                <div className="text-ink-3">{voiceProfile.formality}</div>
              </div>
              <div>
                <div className="font-head font-semibold text-ink text-[11px] uppercase tracking-wider mb-1">Sentence style</div>
                <div className="text-ink-3">{voiceProfile.sentenceStyle}</div>
              </div>
              <div>
                <div className="font-head font-semibold text-ink text-[11px] uppercase tracking-wider mb-1">Vocabulary</div>
                <div className="text-ink-3">{voiceProfile.vocabulary}</div>
              </div>
              <div>
                <div className="font-head font-semibold text-ink text-[11px] uppercase tracking-wider mb-1">Opens with</div>
                <div className="text-ink-3">{voiceProfile.hooks}</div>
              </div>
              <div>
                <div className="font-head font-semibold text-ink text-[11px] uppercase tracking-wider mb-1">Avoids</div>
                <div className="text-ink-3">{voiceProfile.avoid}</div>
              </div>
            </div>
            {voiceProfile.samplePhrases && voiceProfile.samplePhrases.length > 0 && (
              <div className="mt-3 pt-3 border-t border-separator">
                <div className="font-head font-semibold text-ink text-[11px] uppercase tracking-wider mb-2">Signature phrases</div>
                <div className="flex flex-col gap-1">
                  {voiceProfile.samplePhrases.map((p, i) => (
                    <div key={i} className="text-xs text-ink-2 italic">&ldquo;{p}&rdquo;</div>
                  ))}
                </div>
              </div>
            )}
            {voiceProfile.analyzedAt && (
              <div className="text-[10px] text-ink-4 mt-3">
                Last updated {new Date(voiceProfile.analyzedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        {/* Sample input */}
        <div className="card-flat p-4">
          <div className="text-xs text-ink-3 mb-2">
            {voiceProfile ? 'Update your voice — paste new samples to retrain' : 'Paste 3+ samples of your writing (tweets, LinkedIn posts, replies)'}
          </div>
          <textarea
            className="input w-full min-h-[100px] text-xs leading-relaxed mb-3"
            placeholder={"Paste your writing samples here, separated by blank lines.\n\nExample:\nI've been building AI tools for 2 years now. The biggest lesson? Ship ugly, learn fast.\n\nAnother sample:\nEveryone talks about PMF. Nobody talks about the 6 months of embarrassing prototypes before you find it."}
            value={voiceSamples}
            onChange={e => setVoiceSamples(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button
              className="btn-primary"
              disabled={voiceExtracting || voiceSamples.trim().split(/\n\n+/).filter(s => s.trim().length > 20).length < 3}
              onClick={async () => {
                setVoiceExtracting(true)
                setVoiceError('')
                const samples = voiceSamples.trim().split(/\n\n+/).filter(s => s.trim().length > 20)
                try {
                  const res = await fetch('/api/voice-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ samples }),
                  })
                  const json = await res.json()
                  if (json.success && json.profile) {
                    setVoiceProfile(json.profile)
                    setVoiceSamples('')
                  } else {
                    setVoiceError(json.error ?? 'Failed to extract voice')
                  }
                } catch {
                  setVoiceError('Failed to connect')
                } finally {
                  setVoiceExtracting(false)
                }
              }}
            >
              {voiceExtracting ? 'Analyzing your voice...' : voiceProfile ? 'Retrain voice' : 'Extract my voice'}
            </button>
            <span className="text-[11px] text-ink-4">
              {voiceSamples.trim().split(/\n\n+/).filter(s => s.trim().length > 20).length}/3 samples detected
            </span>
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
              <span key={t} className="badge flex items-center gap-1.5 text-xs py-1.5 px-3 bg-[color:var(--green-bg)] text-green">
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
