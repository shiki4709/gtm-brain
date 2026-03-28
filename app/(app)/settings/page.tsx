'use client'

import { useState, useEffect } from 'react'

interface UserData {
  id: string
  email: string
  name: string
  icp_config: { titles: string[]; exclude: string[] }
  x_accounts: string[]
  x_topics: string[]
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

  // X
  const [xAccounts, setXAccounts] = useState<string[]>([])
  const [xAccountInput, setXAccountInput] = useState('')
  const [xTopics, setXTopics] = useState<string[]>([])
  const [xTopicInput, setXTopicInput] = useState('')

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(json => {
      if (json.success && json.data) {
        const u = json.data as UserData
        setUser(u)
        setTitles(u.icp_config?.titles ?? [])
        setExcludes(u.icp_config?.exclude ?? [])
        setXAccounts(u.x_accounts ?? [])
        setXTopics(u.x_topics ?? [])
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

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
        body: JSON.stringify({ icp_titles: titles, icp_exclude: excludes }),
      })

      // Save X settings
      await fetch('/api/user/x-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x_accounts: xAccounts, x_topics: xTopics }),
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

      <hr className="border-rule-light my-10" />

      {/* X Accounts */}
      <div className="mb-10">
        <div className="section-label mb-1">X — Accounts to watch</div>
        <p className="text-xs text-ink-4 mb-3">We surface recent tweets from these accounts for you to reply to. Add thought leaders your ICP follows.</p>

        {xAccounts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {xAccounts.map(a => (
              <span key={a} className="badge flex items-center gap-1.5 text-xs py-1.5 px-3" style={{ background: '#fff3e0', color: 'var(--accent-orange-deep)' }}>
                @{a}
                <button onClick={() => removeFromList(a, xAccounts, setXAccounts)} className="hover:text-ink ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="input flex-1 py-2.5 px-4 text-sm"
            placeholder="@handle (e.g. markroberge)"
            value={xAccountInput}
            onChange={e => setXAccountInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToList(xAccountInput, xAccounts, setXAccounts, setXAccountInput) } }}
          />
          <button className="btn-accent" onClick={() => addToList(xAccountInput, xAccounts, setXAccounts, setXAccountInput)} disabled={!xAccountInput.trim()}>Add</button>
        </div>
      </div>

      {/* X Topics */}
      <div className="mb-10">
        <div className="section-label mb-1">X — Topics to watch</div>
        <p className="text-xs text-ink-4 mb-3">We find trending tweets about these topics for you to engage with.</p>

        {xTopics.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {xTopics.map(t => (
              <span key={t} className="badge flex items-center gap-1.5 text-xs py-1.5 px-3" style={{ background: '#fff3e0', color: 'var(--accent-orange-deep)' }}>
                {t}
                <button onClick={() => removeFromList(t, xTopics, setXTopics)} className="hover:text-ink ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="input flex-1 py-2.5 px-4 text-sm"
            placeholder="e.g. GTM strategy, sales hiring"
            value={xTopicInput}
            onChange={e => setXTopicInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToList(xTopicInput, xTopics, setXTopics, setXTopicInput) } }}
          />
          <button className="btn-accent" onClick={() => addToList(xTopicInput, xTopics, setXTopics, setXTopicInput)} disabled={!xTopicInput.trim()}>Add</button>
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
