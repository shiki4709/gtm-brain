'use client'
import { useState, useEffect } from 'react'

interface Tweet {
  id: string
  text: string
  username: string
  name: string
  followers: number
  likes: number
  retweets: number
  replies: number
}

interface ContentResult {
  coreInsight: string
  results: { linkedin: string; x: string }
}

interface TopicInsight {
  topic: string
  avg_icp_rate: number
}

export default function Inbound() {
  const [source, setSource] = useState('')
  const [generating, setGenerating] = useState(false)
  const [content, setContent] = useState<ContentResult | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const [tweets, setTweets] = useState<Tweet[]>([])
  const [loadingTweets, setLoadingTweets] = useState(false)
  const [draftingId, setDraftingId] = useState<string | null>(null)
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({})

  const [user, setUser] = useState<{ x_accounts: string[]; x_topics: string[] } | null>(null)
  const [topTopic, setTopTopic] = useState<TopicInsight | null>(null)
  const [accountInput, setAccountInput] = useState('')
  const [topicInput, setTopicInput] = useState('')
  const [savingX, setSavingX] = useState(false)

  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(json => {
      if (json.success && json.data) {
        setUser(json.data)
        const accounts = json.data.x_accounts ?? []
        const topics = json.data.x_topics ?? []
        if (accounts.length > 0 || topics.length > 0) fetchTweets(accounts, topics)
      }
    }).catch(() => {})

    fetch('/api/insights').then(r => r.json()).then(json => {
      if (json.success && json.data?.topic_performance?.[0]) setTopTopic(json.data.topic_performance[0])
    }).catch(() => {})
  }, [])

  async function addAccount(handle: string) {
    const clean = handle.trim().replace(/^@/, '')
    if (!clean) return
    const accounts = [...(user?.x_accounts ?? []), clean].filter((v, i, a) => a.indexOf(v) === i)
    setSavingX(true)
    await fetch('/api/user/x-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x_accounts: accounts, x_topics: user?.x_topics ?? [] }),
    })
    setUser(prev => prev ? { ...prev, x_accounts: accounts } : prev)
    setAccountInput('')
    setSavingX(false)
    fetchTweets(accounts, user?.x_topics ?? [])
  }

  async function removeAccount(handle: string) {
    const accounts = (user?.x_accounts ?? []).filter(a => a !== handle)
    await fetch('/api/user/x-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x_accounts: accounts, x_topics: user?.x_topics ?? [] }),
    })
    setUser(prev => prev ? { ...prev, x_accounts: accounts } : prev)
  }

  async function addTopic(topic: string) {
    const clean = topic.trim()
    if (!clean) return
    const topics = [...(user?.x_topics ?? []), clean].filter((v, i, a) => a.indexOf(v) === i)
    setSavingX(true)
    await fetch('/api/user/x-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x_accounts: user?.x_accounts ?? [], x_topics: topics }),
    })
    setUser(prev => prev ? { ...prev, x_topics: topics } : prev)
    setTopicInput('')
    setSavingX(false)
    fetchTweets(user?.x_accounts ?? [], topics)
  }

  async function removeTopic(topic: string) {
    const topics = (user?.x_topics ?? []).filter(t => t !== topic)
    await fetch('/api/user/x-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x_accounts: user?.x_accounts ?? [], x_topics: topics }),
    })
    setUser(prev => prev ? { ...prev, x_topics: topics } : prev)
  }

  async function fetchTweets(accounts: string[], topics: string[]) {
    setLoadingTweets(true)
    try {
      const res = await fetch('/api/x-engage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts, topics }),
      })
      const json = await res.json()
      if (json.tweets) setTweets(json.tweets)
    } catch { /* silently fail */ }
    finally { setLoadingTweets(false) }
  }

  async function handleGenerate() {
    if (!source.trim()) return
    setGenerating(true)
    setContent(null)
    try {
      const res = await fetch('/api/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, platforms: ['linkedin', 'x'] }),
      })
      const json = await res.json()
      if (json.results) setContent(json)
    } catch { /* silently fail */ }
    finally { setGenerating(false) }
  }

  async function handleDraftReply(tweet: Tweet) {
    setDraftingId(tweet.id)
    try {
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet_text: tweet.text, author_name: tweet.name, author_handle: tweet.username }),
      })
      const json = await res.json()
      if (json.reply) setDraftReplies(prev => ({ ...prev, [tweet.id]: json.reply }))
    } catch { /* silently fail */ }
    finally { setDraftingId(null) }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* ═══ PUBLISH ═══ */}
      <h1 className="font-head text-2xl font-bold text-ink mb-2">
        Create content that attracts your ICP
      </h1>
      <p className="text-sm text-ink-3 mb-1 leading-relaxed">
        Generate platform-native drafts, then publish with{' '}
        <a href="https://foxxi-azure.vercel.app" target="_blank" rel="noopener noreferrer" className="text-accent font-semibold hover:underline">
          Foxxi
        </a>
        . After publishing, scrape your own post&apos;s engagers in Outbound.
      </p>
      <p className="text-[11px] text-ink-4 mb-8">
        Builds authority: inbound ICP leads · content engagement · audience growth
      </p>

      {/* Content input */}
      <div className="flex gap-3 mb-2">
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste a URL or topic to write about..."
          className="input flex-1 py-3 px-4 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate() }}
          disabled={generating}
        />
        <button onClick={handleGenerate} disabled={generating || !source.trim()} className="btn-primary px-6 py-3">
          {generating ? 'Drafting...' : 'Draft'}
        </button>
      </div>

      {topTopic && (
        <div className="border-l-2 border-rule pl-4 mb-8 mt-4">
          <div className="text-xs text-ink-3">
            Brain: posts about <strong className="text-accent">{topTopic.topic}</strong> get {Math.round(topTopic.avg_icp_rate * 100)}% ICP match rate.{' '}
            <button className="text-accent font-semibold hover:underline"
              onClick={() => setSource(`${topTopic.topic} challenges and trends`)}>
              Use this topic →
            </button>
          </div>
        </div>
      )}

      {/* Generated content */}
      {content && (
        <div className="mb-8">
          {content.coreInsight && (
            <div className="text-xs text-ink-4 mb-3">Core insight: <em>{content.coreInsight}</em></div>
          )}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {content.results.linkedin && (
              <div className="bg-white border border-rule rounded-[var(--radius)] p-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                    <span className="section-label mb-0">LinkedIn</span>
                  </div>
                  <button className="btn-outline text-[11px] py-1 px-2.5"
                    onClick={() => copyToClipboard(content.results.linkedin, 'linkedin')}>
                    {copied === 'linkedin' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="text-xs text-ink-2 leading-relaxed whitespace-pre-line bg-[var(--bg-warm)] rounded-lg p-3 max-h-64 overflow-y-auto">
                  {content.results.linkedin}
                </div>
              </div>
            )}
            {content.results.x && (
              <div className="bg-white border border-rule rounded-[var(--radius)] p-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange" />
                    <span className="section-label mb-0">X Thread</span>
                  </div>
                  <button className="btn-outline text-[11px] py-1 px-2.5"
                    onClick={() => copyToClipboard(content.results.x, 'x')}>
                    {copied === 'x' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="text-xs text-ink-2 leading-relaxed whitespace-pre-line bg-[var(--bg-warm)] rounded-lg p-3 max-h-64 overflow-y-auto">
                  {content.results.x}
                </div>
              </div>
            )}
          </div>
          <div className="text-center">
            <a href="https://foxxi-azure.vercel.app" target="_blank" rel="noopener noreferrer" className="btn-primary px-6 py-3">
              Open Foxxi to publish →
            </a>
          </div>
        </div>
      )}

      <hr className="border-rule-light my-10" />

      {/* ═══ ENGAGE ═══ */}
      <h2 className="font-head text-xl font-bold text-ink mb-2">
        Engage on X
      </h2>
      <p className="text-sm text-ink-3 mb-1 leading-relaxed">
        Surface high-engagement tweets from accounts and topics you care about. Draft thoughtful replies to build visibility with your ICP.
      </p>
      <p className="text-[11px] text-ink-4 mb-6">
        Builds visibility: follower growth · reply impressions · brand awareness
      </p>

      {/* Accounts */}
      <div className="mb-4">
        <div className="section-label mb-2">Accounts to watch</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {(user?.x_accounts ?? []).map(a => (
            <span key={a} className="badge flex items-center gap-1.5 text-xs py-1.5 px-3" style={{ background: '#fff3e0', color: 'var(--accent-orange-deep)' }}>
              @{a}
              <button onClick={() => removeAccount(a)} className="hover:text-ink ml-0.5">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1 py-2 px-3 text-sm"
            placeholder="@handle (e.g. markroberge)"
            value={accountInput}
            onChange={e => setAccountInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAccount(accountInput) } }}
            disabled={savingX}
          />
          <button className="btn-accent" onClick={() => addAccount(accountInput)} disabled={!accountInput.trim() || savingX}>
            {savingX ? '...' : 'Add'}
          </button>
        </div>
      </div>

      {/* Topics */}
      <div className="mb-6">
        <div className="section-label mb-2">Topics to watch</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {(user?.x_topics ?? []).map(t => (
            <span key={t} className="badge flex items-center gap-1.5 text-xs py-1.5 px-3" style={{ background: '#fff3e0', color: 'var(--accent-orange-deep)' }}>
              {t}
              <button onClick={() => removeTopic(t)} className="hover:text-ink ml-0.5">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1 py-2 px-3 text-sm"
            placeholder="e.g. GTM strategy, sales hiring"
            value={topicInput}
            onChange={e => setTopicInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTopic(topicInput) } }}
            disabled={savingX}
          />
          <button className="btn-accent" onClick={() => addTopic(topicInput)} disabled={!topicInput.trim() || savingX}>
            {savingX ? '...' : 'Add'}
          </button>
        </div>
      </div>

      {/* Tweets */}
      {loadingTweets ? (
        <div className="text-sm text-ink-4 py-8 text-center">Loading tweets...</div>
      ) : tweets.length > 0 ? (
        <div className="flex flex-col gap-3">
          {tweets.map((tw) => (
            <div key={tw.id} className="bg-white border border-rule rounded-[var(--radius)] p-4 hover:border-accent transition-colors">
              <div className="text-sm mb-1">
                <strong className="font-head">{tw.name}</strong>
                <span className="text-ink-4 font-normal"> @{tw.username}</span>
              </div>
              <div className="text-sm text-ink-2 leading-relaxed mb-2">{tw.text}</div>
              <div className="text-[11px] text-ink-4 mb-3">
                {tw.likes.toLocaleString()} likes · {tw.replies} replies · {tw.retweets} RTs
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleDraftReply(tw)} disabled={draftingId === tw.id} className="btn-accent">
                  {draftingId === tw.id ? '...' : 'Draft Reply'}
                </button>
                <a href={`https://x.com/${tw.username}/status/${tw.id}`} target="_blank" rel="noopener noreferrer" className="btn-outline">
                  Open on X
                </a>
              </div>

              {draftReplies[tw.id] && (
                <div className="mt-3 pt-3 border-t border-rule-light">
                  <div className="text-xs text-ink-4 mb-1">Your draft reply:</div>
                  <div className="text-sm text-ink bg-[var(--bg-warm)] rounded-lg px-3 py-2 mb-2 leading-relaxed">
                    {draftReplies[tw.id]}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary" onClick={() => {
                      copyToClipboard(draftReplies[tw.id], `reply-${tw.id}`)
                      window.open(`https://x.com/${tw.username}/status/${tw.id}`, '_blank')
                    }}>
                      {copied === `reply-${tw.id}` ? 'Copied' : 'Copy & Open'}
                    </button>
                    <button className="btn-outline" onClick={() => handleDraftReply(tw)}>Rewrite</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-ink-4">
          <div className="text-4xl mb-3">@</div>
          <div className="text-sm">No tweets surfaced. Add accounts and topics above to get started.</div>
        </div>
      )}
    </div>
  )
}
