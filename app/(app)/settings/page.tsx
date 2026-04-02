'use client'

import { useState, useEffect, ReactNode } from 'react'
import type { UserMode, UserGoal } from '@/lib/types'

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-6">
      <button className="collapsible-header w-full" onClick={() => setOpen(!open)}>
        <div className="section-label !mb-0">{title}</div>
        <svg className={`collapsible-chevron ${open ? 'open' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      <div className={`collapsible-body ${open ? 'expanded' : 'collapsed'}`}>
        {children}
      </div>
    </div>
  )
}

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
  const [voicePersona, setVoicePersona] = useState('')
  const [voiceSamples, setVoiceSamples] = useState('') // reused for description text
  const [voiceAvoid, setVoiceAvoid] = useState('')
  const [voiceExtracting, setVoiceExtracting] = useState(false)
  const [voiceError, setVoiceError] = useState('')


  // Notifications
  const [notifChannels, setNotifChannels] = useState<Array<{ type: string; chat_id?: string; webhook_url?: string; paused?: boolean }>>([])
  const [telegramConnected, setTelegramConnected] = useState(false)
  const [telegramLink, setTelegramLink] = useState('')
  const [slackWebhookInput, setSlackWebhookInput] = useState('')
  const [notifTesting, setNotifTesting] = useState<string | null>(null)
  const [notifTimezone, setNotifTimezone] = useState('')
  const [notifSaving, setNotifSaving] = useState(false)
  const [recentNotifications, setRecentNotifications] = useState<Array<{
    id: string; channel: string; post_url: string; action_type: string
    status: string; pushed_at: string; acted_at: string | null
  }>>([])

  // Watchlist
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [directAddInput, setDirectAddInput] = useState('')
  const [directAdding, setDirectAdding] = useState(false)
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
      safeFetch('/api/notifications'),
    ]).then(([userJson, wlJson, goalsJson, voiceJson, notifJson]) => {
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
      if (notifJson.success) {
        setNotifChannels(notifJson.channels ?? [])
        setTelegramConnected(notifJson.telegramConnected ?? false)
        setTelegramLink(notifJson.telegramLink ?? '')
        setNotifTimezone(notifJson.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
        setRecentNotifications(notifJson.recentNotifications ?? [])
      }
      if (voiceJson.success && voiceJson.profile) {
        setVoiceProfile(voiceJson.profile)
        // Pre-populate description fields from existing profile
        const vp = voiceJson.profile
        if (vp.description) setVoiceSamples(vp.description)
        else if (vp.tone) setVoiceSamples(`${vp.tone}. ${vp.sentenceStyle ?? ''}. ${vp.vocabulary ?? ''}`.trim())
        if (vp.avoid) setVoiceAvoid(vp.avoid)
        if ((vp as Record<string, unknown>).persona) setVoicePersona((vp as Record<string, unknown>).persona as string)
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

  function looksLikeHandle(input: string): boolean {
    const s = input.trim()
    return s.startsWith('@') ||
      s.includes('x.com/') ||
      s.includes('twitter.com/') ||
      s.includes('linkedin.com/in/') ||
      (/^[a-zA-Z0-9_]{1,30}$/.test(s) && !s.includes(' '))
  }

  async function handleSmartAdd(input: string) {
    if (looksLikeHandle(input)) {
      setDirectAddInput(input)
      await handleDirectAdd(input)
      setChatInput('')
    } else {
      chatFindPeople(input)
    }
  }

  async function handleDirectAdd(overrideInput?: string) {
    const raw = (overrideInput ?? directAddInput).trim()
    if (!raw) return
    setDirectAdding(true)
    let platform: 'linkedin' | 'x' = 'x'
    let username = raw
    if (username.includes('linkedin.com/in/')) {
      platform = 'linkedin'
      username = username.replace(/.*linkedin\.com\/in\//, '').replace(/\/$/, '')
    } else if (username.includes('x.com/') || username.includes('twitter.com/')) {
      platform = 'x'
      username = username.replace(/.*(?:x|twitter)\.com\//, '').replace(/\/$/, '').replace(/^@/, '')
    } else {
      username = username.replace(/^@/, '')
    }
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, username, display_name: username }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setWatchlist(prev => [json.data, ...prev])
        setDirectAddInput('')
      }
    } catch { /* */ }
    finally { setDirectAdding(false) }
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
        {mode === 'personal_brand' ? 'Configure your brand, voice, and who you watch.' : 'Configure your ICP, pipeline, and outreach.'}
      </p>

      {/* Account */}
      <Section title="Account" defaultOpen={false}>
        <div className="border-l-2 border-rule pl-4">
          <div className="text-sm text-ink">{user?.name}</div>
          <div className="text-xs text-ink-4">{user?.email}</div>
        </div>
      </Section>

      {/* Mode */}
      <Section title="Your goal">
        <div className="flex gap-2 flex-wrap">
          {([
            ['personal_brand', '\u{1F4E3} Grow my audience'],
            ['b2b_outbound', '\u{1F3AF} Book meetings'],
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
      </Section>

      {/* Weekly Goals */}
      {goals.length > 0 && (
        <Section title="Weekly targets">
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
        </Section>
      )}

      {/* X Handle for follower tracking */}
      {/* X account — personal brand only */}
      {mode === 'personal_brand' && (
      <Section title="Your X account">
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
            <div className="mt-2 text-sm text-[var(--green)]">
              Connected — {xFollowers.toLocaleString()} followers
            </div>
          )}
        </Section>
      )}

      {/* Voice & Tone */}
      <Section title="Your voice &amp; tone">
        <p className="text-xs text-ink-4 mb-4">
          Describe how you write. All replies, threads, and content will match this style.
        </p>

        <div className="card-flat p-4 space-y-4">
          {/* Description */}
          <div>
            <label className="font-head text-xs font-semibold text-ink block mb-1.5">Who are you? (your persona)</label>
            <input
              className="input w-full text-xs mb-3"
              placeholder="e.g. AI startup COO building GTM tools, solo founder shipping with Claude daily"
              value={voicePersona}
              onChange={e => setVoicePersona(e.target.value)}
            />
            <label className="font-head text-xs font-semibold text-ink block mb-1.5">How do you sound?</label>
            <textarea
              className="input w-full min-h-[80px] text-xs leading-relaxed"
              placeholder="e.g. Casual and direct. Short sentences. I use humor and sarcasm. No corporate speak."
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
                    body: JSON.stringify({ description: voiceSamples.trim(), avoid: voiceAvoid.trim(), persona: voicePersona.trim() }),
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
            {voiceProfile && <span className="text-[11px] text-[var(--green)]">Voice profile active</span>}
          </div>
          {voiceError && <div className="text-xs text-orange mt-2">{voiceError}</div>}
        </div>
      </Section>

      <hr className="border-rule-light my-6" />

      {/* People you watch */}
      <Section title="People you watch">
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

        {/* Unified input — handles are added directly, anything else triggers search */}
        <div className="border border-rule rounded-[var(--radius)] overflow-hidden">
          {/* Search results */}
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
                                  <span className="text-[10px] text-[var(--green)] shrink-0 ml-2">Watching</span>
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

          {/* Smart input */}
          <div className={`flex gap-2 p-3 ${chatMessages.length > 0 ? 'border-t border-rule' : ''}`}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={'@handle, x.com/name, or "SaaS sales leaders"'}
              className="flex-1 py-2 px-3 text-sm bg-transparent outline-none placeholder:text-ink-4"
              onKeyDown={e => { if (e.key === 'Enter' && chatInput.trim()) handleSmartAdd(chatInput.trim()) }}
            />
            <button onClick={() => handleSmartAdd(chatInput.trim())} disabled={chatLoading || directAdding || !chatInput.trim()}
              className="btn-accent text-xs">
              {chatLoading || directAdding ? '...' : 'Add'}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-ink-4 mt-2">Paste a handle to add directly, or describe who you&apos;re looking for to search.</p>
      </Section>

      {/* ICP Config — B2B only */}
      {mode === 'b2b_outbound' && (<>
      <hr className="border-rule-light my-10" />

      <Section title="ICP — Target titles">
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
      </Section>

      {/* ICP Excludes */}
      <Section title="ICP — Exclude" defaultOpen={false}>
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
      </Section>
      </>)}

      {/* Notifications */}
      <hr className="border-rule-light my-6" />
      <Section title="Notifications">
        <p className="text-xs text-ink-4 mb-4">Get notified on Telegram or Slack when high-value posts appear in your feed.</p>

        {/* Telegram */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-ink flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--brand-telegram)]"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
              Telegram
            </div>
            {telegramConnected && (
              <span className="badge badge-sent text-[10px]">Connected</span>
            )}
          </div>

          {telegramConnected ? (
            <div className="flex gap-2 items-center">
              <span className="text-xs text-ink-3">Chat ID: {notifChannels.find(c => c.type === 'telegram')?.chat_id ?? '—'}</span>
              <button
                className="btn-ghost text-xs"
                disabled={notifTesting === 'telegram'}
                onClick={async () => {
                  setNotifTesting('telegram')
                  await fetch('/api/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'test_telegram' }),
                  })
                  setNotifTesting(null)
                }}
              >
                {notifTesting === 'telegram' ? 'Sending...' : 'Test'}
              </button>
              <button
                className="btn-ghost text-xs text-[var(--status-error)]"
                onClick={async () => {
                  const res = await fetch('/api/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'remove_telegram' }),
                  })
                  const json = await res.json()
                  if (json.success) {
                    setNotifChannels(json.channels)
                    setTelegramConnected(false)
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div>
              {telegramLink ? (
                <a
                  href={telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-accent inline-flex items-center gap-2 text-sm"
                >
                  Connect Telegram
                </a>
              ) : (
                <span className="text-xs text-ink-4">Loading connection link...</span>
              )}
              <p className="text-[11px] text-ink-4 mt-1">Opens Telegram and connects this account to the bot.</p>
            </div>
          )}
        </div>

        {/* Slack */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-ink flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--brand-slack)]"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.52 2.521h-2.522V8.834zm-1.271 0a2.528 2.528 0 01-2.521 2.521 2.528 2.528 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.165 0a2.528 2.528 0 012.522 2.522v6.312zm-2.522 10.124a2.528 2.528 0 012.522 2.522A2.528 2.528 0 0115.165 24a2.528 2.528 0 01-2.521-2.52v-2.522h2.521zm0-1.271a2.528 2.528 0 01-2.521-2.521 2.528 2.528 0 012.521-2.521h6.313A2.528 2.528 0 0124 15.165a2.528 2.528 0 01-2.52 2.522h-6.315z"/></svg>
              Slack
            </div>
            {notifChannels.some(c => c.type === 'slack') && (
              <span className="badge badge-sent text-[10px]">Connected</span>
            )}
          </div>

          {notifChannels.some(c => c.type === 'slack') ? (
            <div className="flex gap-2 items-center">
              <span className="text-xs text-ink-3 truncate max-w-[200px]">{notifChannels.find(c => c.type === 'slack')?.webhook_url?.replace('https://hooks.slack.com/services/', '.../')}</span>
              <button
                className="btn-ghost text-xs"
                disabled={notifTesting === 'slack'}
                onClick={async () => {
                  setNotifTesting('slack')
                  await fetch('/api/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'test_slack' }),
                  })
                  setNotifTesting(null)
                }}
              >
                {notifTesting === 'slack' ? 'Sending...' : 'Test'}
              </button>
              <button
                className="btn-ghost text-xs text-[var(--status-error)]"
                onClick={async () => {
                  const res = await fetch('/api/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'remove_slack' }),
                  })
                  const json = await res.json()
                  if (json.success) setNotifChannels(json.channels)
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input
                  className="input flex-1 py-2 px-3 text-sm"
                  placeholder="Paste Slack webhook URL..."
                  value={slackWebhookInput}
                  onChange={e => setSlackWebhookInput(e.target.value)}
                />
                <button
                  className="btn-accent text-sm"
                  disabled={!slackWebhookInput.startsWith('https://hooks.slack.com/') || notifSaving}
                  onClick={async () => {
                    setNotifSaving(true)
                    const res = await fetch('/api/notifications', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'add_slack', webhook_url: slackWebhookInput }),
                    })
                    const json = await res.json()
                    if (json.success) {
                      setNotifChannels(json.channels)
                      setSlackWebhookInput('')
                    }
                    setNotifSaving(false)
                  }}
                >
                  {notifSaving ? '...' : 'Connect'}
                </button>
              </div>
              <p className="text-[11px] text-ink-4 mt-1">Create an Incoming Webhook in your Slack workspace and paste the URL here.</p>
            </div>
          )}
        </div>

        {/* Timezone */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-ink mb-2">Notification hours</div>
          <div className="flex gap-2 items-center">
            <select
              className="input py-2 px-3 text-sm"
              value={notifTimezone}
              onChange={async (e) => {
                setNotifTimezone(e.target.value)
                await fetch('/api/notifications', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'update_timezone', timezone: e.target.value }),
                })
              }}
            >
              {['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
                'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
                'Asia/Kolkata', 'Australia/Sydney', 'Pacific/Auckland'].map(tz => (
                <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
              ))}
            </select>
            <span className="text-xs text-ink-4">7am — 10pm only</span>
          </div>
        </div>

      </Section>

      {/* Topic keywords */}
      <hr className="border-rule-light my-6" />
      <Section title="Topics to track">
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
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Saving...' : 'Save all settings'}
        </button>
        {saved && <span className="text-xs text-[var(--green)]">Settings saved</span>}
      </div>
    </div>
  )
}
