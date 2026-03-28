'use client'
import { useState, useEffect, useCallback } from 'react'

interface Lead {
  id: string
  name: string
  title: string
  company: string
  linkedin_url: string
  comment_text: string
  icp_match: boolean
  status: string
  dm_draft: string | null
  dm_angle: string | null
}

interface Scrape {
  id: string
  post_url: string
  post_author: string
  post_topic: string | null
  total_engagers: number
  icp_matches: number
  scrape_date: string
  sb_leads: Lead[]
}

interface Post {
  url: string
  author: string
  title: string
  snippet: string
  engagement?: number
}

type LeadFilter = 'icp_commented' | 'icp' | 'commented' | 'other'

function extractPostTitle(url: string): string {
  const match = url.match(/posts\/[^_]+[_-]([^-]+(?:-[^-]+){0,6})/)
  if (match) return match[1].replace(/-/g, ' ').replace(/activity.*/, '').trim()
  return url.replace(/https?:\/\/(www\.)?linkedin\.com\//, '').slice(0, 50)
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function Outbound() {
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeStatus, setScrapeStatus] = useState('')
  const [scrapeProgress, setScrapeProgress] = useState<{ done: number; total: number; elapsed: number } | null>(null)
  const [scrapes, setScrapes] = useState<Scrape[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ icp_config?: { titles: string[]; exclude: string[] } } | null>(null)

  const [expandedScrape, setExpandedScrape] = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<Record<string, LeadFilter[]>>({})
  const [draftingId, setDraftingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editInstruction, setEditInstruction] = useState('')

  const [searchKeywords, setSearchKeywords] = useState('')
  const [searchTimeframe, setSearchTimeframe] = useState('week')
  const [searching, setSearching] = useState(false)
  const [foundPosts, setFoundPosts] = useState<Post[]>([])
  const [searchNote, setSearchNote] = useState('')

  const fetchScrapes = useCallback(async (autoExpand = false) => {
    try {
      const res = await fetch('/api/scrapes')
      const json = await res.json()
      if (json.success) {
        setScrapes(json.data ?? [])
        if (autoExpand && json.data?.length > 0) {
          setExpandedScrape(json.data[0].id)
        }
      }
    } catch { /* silently fail */ }
  }, [])

  useEffect(() => {
    Promise.all([
      fetchScrapes(true),
      fetch('/api/user').then(r => r.json()).then(json => {
        if (json.success && json.data) setUser(json.data)
      }).catch(() => {}),
    ]).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleFilter(scrapeId: string, filter: LeadFilter) {
    setActiveFilters(prev => {
      const current = prev[scrapeId] ?? []
      const next = current.includes(filter)
        ? current.filter(f => f !== filter)
        : [...current, filter]
      return { ...prev, [scrapeId]: next }
    })
  }

  function getFilteredLeads(scrape: Scrape) {
    const leads = scrape.sb_leads ?? []
    const filters = activeFilters[scrape.id] ?? []
    const sorted = [...leads].sort((a, b) => {
      const scoreA = (a.comment_text ? 2 : 0) + (a.icp_match ? 1 : 0)
      const scoreB = (b.comment_text ? 2 : 0) + (b.icp_match ? 1 : 0)
      return scoreB - scoreA
    })
    if (filters.length === 0) return sorted.filter(l => l.icp_match || l.comment_text)
    return sorted.filter(l => {
      if (filters.includes('icp_commented') && l.icp_match && l.comment_text) return true
      if (filters.includes('icp') && l.icp_match && !l.comment_text) return true
      if (filters.includes('commented') && !l.icp_match && l.comment_text) return true
      if (filters.includes('other') && !l.icp_match && !l.comment_text) return true
      return false
    })
  }

  function getGroupCounts(leads: Lead[]) {
    return {
      icp_commented: leads.filter(l => l.icp_match && l.comment_text).length,
      icp: leads.filter(l => l.icp_match && !l.comment_text).length,
      commented: leads.filter(l => !l.icp_match && l.comment_text).length,
      other: leads.filter(l => !l.icp_match && !l.comment_text).length,
    }
  }

  async function handleScrape(url?: string) {
    const targetUrl = url ?? scrapeUrl
    if (!targetUrl.trim()) return
    setScraping(true)
    setScrapeStatus('Starting scrape...')
    setScrapeProgress(null)
    const startTime = Date.now()
    try {
      const startRes = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      })
      const startJson = await startRes.json()
      if (startJson.error) { setScrapeStatus(`Error: ${startJson.error}`); setScraping(false); return }
      const pollId = startJson.pollId
      const totalBatches = startJson.totalBatches ?? 20
      setScrapeStatus('Scraping engagers...')
      setScrapeProgress({ done: 0, total: totalBatches, elapsed: 0 })
      const poll = async () => {
        const pollRes = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl, runId: pollId }),
        })
        const pollJson = await pollRes.json()
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        if (pollJson.status === 'running') {
          const progressParts = (pollJson.progress ?? '0/0').split('/')
          const done = parseInt(progressParts[0]) || 0
          const total = parseInt(progressParts[1]) || totalBatches
          setScrapeProgress({ done, total, elapsed })
          setScrapeStatus(`Scraping engagers... ${done}/${total} batches`)
          setTimeout(poll, 5000)
        } else if (pollJson.status === 'done') {
          setScrapeProgress({ done: totalBatches, total: totalBatches, elapsed })
          setScrapeStatus(`Done in ${elapsed}s — ${pollJson.total} engagers, ${pollJson.commenters} commenters, ${pollJson.likers} likers`)
          setScraping(false)
          setScrapeUrl('')
          setFoundPosts([])
          setTimeout(() => setScrapeProgress(null), 3000)
          fetchScrapes()
        } else {
          setScrapeStatus(`Error: ${pollJson.error ?? 'Unknown'}`)
          setScraping(false)
          setScrapeProgress(null)
        }
      }
      setTimeout(poll, 5000)
    } catch { setScrapeStatus('Failed to start scrape'); setScraping(false); setScrapeProgress(null) }
  }

  async function handleSearchPosts() {
    if (!searchKeywords.trim()) return
    setSearching(true)
    try {
      const res = await fetch('/api/find-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: searchKeywords }),
      })
      const json = await res.json()
      setFoundPosts(json.posts ?? [])
      setSearchNote(json.note ?? '')
    } catch { /* silently fail */ }
    finally { setSearching(false) }
  }

  async function handleDraftDm(lead: Lead, postTopic: string) {
    setDraftingId(lead.id)
    try {
      const res = await fetch('/api/draft-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, name: lead.name, headline: lead.title, comment: lead.comment_text, post_title: postTopic }),
      })
      const json = await res.json()
      if (json.message) {
        setScrapes(prev => prev.map(sc => ({ ...sc, sb_leads: sc.sb_leads.map(l => l.id === lead.id ? { ...l, dm_draft: json.message, dm_angle: json.angle, status: 'dm_drafted' } : l) })))
      }
    } catch { /* silently fail */ }
    finally { setDraftingId(null) }
  }

  async function handleTailorDm(lead: Lead, postTopic: string) {
    if (!editInstruction.trim()) return
    setDraftingId(lead.id)
    try {
      const res = await fetch('/api/draft-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, name: lead.name, headline: lead.title, comment: lead.comment_text, post_title: postTopic, instruction: editInstruction, current_draft: lead.dm_draft }),
      })
      const json = await res.json()
      if (json.message) {
        setScrapes(prev => prev.map(sc => ({ ...sc, sb_leads: sc.sb_leads.map(l => l.id === lead.id ? { ...l, dm_draft: json.message, dm_angle: json.angle } : l) })))
        setEditInstruction(''); setEditingId(null)
      }
    } catch { /* silently fail */ }
    finally { setDraftingId(null) }
  }

  async function updateLeadStatus(leadId: string, status: string) {
    const updates: Record<string, unknown> = { lead_id: leadId, status }
    if (status === 'dm_sent') updates.dm_sent_at = new Date().toISOString()
    try {
      await fetch('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      setScrapes(prev => prev.map(sc => ({ ...sc, sb_leads: sc.sb_leads.map(l => l.id === leadId ? { ...l, status } : l) })))
    } catch { /* silently fail */ }
  }

  function getScrapeInsight(sc: Scrape): string {
    const leads = sc.sb_leads ?? []
    const icpLeads = leads.filter(l => l.icp_match)
    const commenters = leads.filter(l => l.comment_text)
    const icpCommenters = leads.filter(l => l.icp_match && l.comment_text)
    const sent = leads.filter(l => l.status === 'dm_sent' || l.status === 'replied')
    const replied = leads.filter(l => l.status === 'replied')
    const rate = sc.total_engagers > 0 ? Math.round((sc.icp_matches / sc.total_engagers) * 100) : 0

    if (replied.length > 0) {
      const replyRate = sent.length > 0 ? Math.round((replied.length / sent.length) * 100) : 0
      return `${replied.length} of ${sent.length} DMs got replies (${replyRate}% reply rate)`
    }
    if (sent.length > 0) {
      return `${sent.length} DMs sent — waiting for replies`
    }
    if (icpCommenters.length > 0) {
      return `${icpCommenters.length} ICP leads left comments — best candidates for comment-reference DMs`
    }
    if (icpLeads.length > 0 && commenters.length > 0) {
      return `${icpLeads.length} ICP matches, ${commenters.length} commented — start with ICP commenters`
    }
    if (rate >= 15) {
      return `${rate}% ICP match rate — this is a high-quality post for your audience`
    }
    if (rate > 0) {
      return `${rate}% ICP match rate — ${icpLeads.length} leads worth reaching out to`
    }
    return `${sc.total_engagers} engagers scraped — review leads below`
  }

  if (loading) return <div className="text-sm text-ink-4 py-8 text-center">Loading...</div>

  const icpTitles = user?.icp_config?.titles ?? []
  const icpExclude = user?.icp_config?.exclude ?? []

  return (
    <div className="max-w-2xl mx-auto">
      {/* Hero */}
      <h1 className="font-head text-2xl font-bold text-ink mb-2">
        Find qualified leads from any LinkedIn post
      </h1>
      <p className="text-sm text-ink-3 mb-1 leading-relaxed">
        Paste a post URL or search for posts by keyword. We scrape every engager, filter to your ICP, and draft personalized DMs.
      </p>
      <p className="text-[11px] text-ink-4 mb-8">
        Builds pipeline: ICP leads found · DMs sent · reply rate · meetings booked
      </p>

      {/* Scrape input */}
      <div className="flex gap-3 mb-2">
        <input
          type="text"
          value={scrapeUrl}
          onChange={(e) => setScrapeUrl(e.target.value)}
          placeholder="Paste a LinkedIn post URL..."
          className="input flex-1 py-3 px-4 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') handleScrape() }}
          disabled={scraping}
        />
        <button
          onClick={() => handleScrape()}
          disabled={scraping || !scrapeUrl.trim()}
          className="btn-primary px-6 py-3"
        >
          {scraping ? 'Scraping...' : 'Scrape'}
        </button>
      </div>
      {/* Scrape progress */}
      {scrapeProgress && (
        <div className="mt-3 mb-4">
          <div className="flex items-center justify-between text-[11px] text-ink-3 mb-1.5">
            <span>{scrapeStatus}</span>
            <span>{scrapeProgress.elapsed}s</span>
          </div>
          <div className="w-full h-1.5 bg-[var(--rule-light)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round((scrapeProgress.done / Math.max(scrapeProgress.total, 1)) * 100)}%`,
                background: scrapeProgress.done >= scrapeProgress.total ? 'var(--green)' : 'var(--gradient-main)',
              }}
            />
          </div>
        </div>
      )}
      {scrapeStatus && !scrapeProgress && (
        <div className="text-xs text-ink-3 mb-4">{scrapeStatus}</div>
      )}

      {/* ICP display */}
      {icpTitles.length > 0 && (
        <div className="border-l-2 border-rule pl-4 mb-8 mt-4">
          <div className="text-xs font-semibold text-ink mb-1">ICP:</div>
          <div className="text-xs text-ink-3 leading-relaxed">{icpTitles.join(', ')}</div>
          {icpExclude.length > 0 && (
            <div className="text-xs text-ink-4 italic mt-0.5">Exclude: {icpExclude.join(', ')}</div>
          )}
        </div>
      )}

      {/* Find posts */}
      <div className="mb-10">
        <div className="section-label mb-3">Or find posts to scrape</div>
        <div className="flex gap-3 mb-2">
          <input
            type="text"
            value={searchKeywords}
            onChange={(e) => setSearchKeywords(e.target.value)}
            placeholder="e.g. GTM playbook, sales hiring, engineering leadership"
            className="input flex-1 py-3 px-4 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearchPosts() }}
            disabled={searching}
          />
          <button
            onClick={handleSearchPosts}
            disabled={searching || !searchKeywords.trim()}
            className="btn-primary px-6 py-3"
          >
            {searching ? 'Finding...' : 'Find'}
          </button>
        </div>
        <div className="text-[11px] text-ink-4 mt-2">
          Searches LinkedIn posts by keyword. Results are sorted by relevance.
        </div>

        {searchNote && (
          <div className="text-xs text-ink-4 mt-3 italic">{searchNote}</div>
        )}

        {foundPosts.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {foundPosts.map((p, i) => (
              <div key={i} className="flex items-center gap-4 py-3 px-4 bg-white border border-rule rounded-[var(--radius)] hover:border-accent transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-head text-sm font-semibold text-ink">{p.author || 'Unknown'}</span>
                    {p.engagement && p.engagement > 10 && (
                      <span className="text-[10px] text-accent font-semibold">{p.engagement.toLocaleString()} engagements</span>
                    )}
                  </div>
                  {p.title && <div className="text-xs text-ink-3 truncate">{p.title}</div>}
                  {p.snippet && !p.title && <div className="text-[11px] text-ink-4 truncate">{p.snippet}</div>}
                </div>
                <button
                  className="btn-accent"
                  onClick={() => { setScrapeUrl(p.url); handleScrape(p.url) }}
                  disabled={scraping}
                >
                  Scrape
                </button>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn-outline">
                  View
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ SCRAPE RESULTS ═══ */}
      {scrapes.length > 0 && scrapes.map(sc => {
        const allLeads = sc.sb_leads ?? []
        const counts = getGroupCounts(allLeads)
        const isExpanded = expandedScrape === sc.id
        const filteredLeads = getFilteredLeads(sc)
        const filters = activeFilters[sc.id] ?? []
        const icpRate = sc.total_engagers > 0 ? Math.round((sc.icp_matches / sc.total_engagers) * 100) : 0
        const sentCount = allLeads.filter(l => l.status === 'dm_sent' || l.status === 'replied').length
        const dateStr = new Date(sc.scrape_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

        return (
          <div key={sc.id} className="mb-4 bg-white border border-rule rounded-[var(--radius)] overflow-hidden">
            {/* Hero row */}
            <button
              className="w-full text-left px-5 py-4 hover:bg-[var(--bg-warm)] transition-colors"
              onClick={() => setExpandedScrape(isExpanded ? null : sc.id)}
            >
              <div className="flex items-center gap-6">
                {/* Big numbers */}
                <div className="flex gap-5">
                  <div className="text-center">
                    <div className="font-head text-2xl font-bold text-ink">{sc.total_engagers}</div>
                    <div className="text-[10px] text-ink-4">engagers</div>
                  </div>
                  <div className="text-center">
                    <div className="font-head text-2xl font-bold text-accent">{sc.icp_matches}</div>
                    <div className="text-[10px] text-ink-4">ICP matches</div>
                  </div>
                </div>

                {/* Post info */}
                <div className="flex-1 min-w-0">
                  <div className="font-head text-sm font-semibold text-ink capitalize truncate">
                    {extractPostTitle(sc.post_url)}
                  </div>
                  <div className="text-[11px] text-ink-4">
                    Scraped {dateStr}
                    {sentCount > 0 && ` · ${sentCount} messaged`}
                    {' '}· {icpRate}% ICP
                  </div>
                  <div className="text-[11px] text-accent mt-0.5">
                    {getScrapeInsight(sc)}
                  </div>
                </div>

                {/* Export + expand */}
                <div className="flex items-center gap-2 shrink-0">
                  <a href="/api/export-csv" className="btn-outline text-[11px]" onClick={e => e.stopPropagation()} title="Download CSV formatted for LinkedIn Sales Navigator import">Sales Nav CSV</a>
                  <span className="text-ink-4 text-sm">{isExpanded ? '▾' : '▸'}</span>
                </div>
              </div>

              {/* Pipeline */}
              <div className="flex items-center gap-1.5 mt-3 text-[11px]">
                <span className="pipe-step">{sc.total_engagers} scraped</span>
                <span className="pipe-arrow">→</span>
                <span className="pipe-step pipe-active">{sc.icp_matches} ICP</span>
                <span className="pipe-arrow">→</span>
                <span className="pipe-step">{sentCount} messaged</span>
                <span className="pipe-arrow">→</span>
                <span className="pipe-step">{allLeads.filter(l => l.status === 'replied' || l.status === 'converted').length} replied</span>
                <span className="pipe-arrow">→</span>
                <span className="pipe-step">{allLeads.filter(l => l.status === 'converted').length} meetings</span>
              </div>
            </button>

            {/* Expanded: filters + leads */}
            {isExpanded && (
              <div className="border-t border-rule px-5 py-4">
                {/* Filter toggles */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {([
                    { key: 'icp_commented' as LeadFilter, label: 'ICP + Commented', count: counts.icp_commented },
                    { key: 'icp' as LeadFilter, label: 'ICP', count: counts.icp },
                    { key: 'commented' as LeadFilter, label: 'Commented', count: counts.commented },
                    { key: 'other' as LeadFilter, label: 'Others', count: counts.other },
                  ]).map(f => (
                    <button
                      key={f.key}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        filters.includes(f.key)
                          ? 'border-accent bg-accent text-white'
                          : 'border-rule text-ink-3 hover:border-ink-4'
                      }`}
                      onClick={() => toggleFilter(sc.id, f.key)}
                    >
                      <strong>{f.count}</strong> {f.label}
                    </button>
                  ))}
                </div>

                {/* Sales Nav tip */}
                <div className="border-l-2 border-rule pl-3 mb-4 text-[11px] text-ink-4 leading-relaxed">
                  <strong className="text-ink-3">Tip:</strong> Click <strong>Sales Nav CSV</strong> above to download ICP leads.
                  In LinkedIn Sales Navigator → Lead Lists → Import CSV → upload the file to add them to a list for bulk outreach.
                </div>

                {/* Lead rows */}
                <div className="flex flex-col">
                  {filteredLeads.slice(0, 25).map(l => (
                    <div key={l.id} className={`flex items-start gap-3 py-3 border-b border-rule-light last:border-0 ${
                      ['dm_sent', 'converted'].includes(l.status) ? 'opacity-50' : ''
                    }`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a href={l.linkedin_url} target="_blank" rel="noopener noreferrer"
                            className="font-head text-sm font-semibold text-ink hover:text-accent transition-colors">
                            {l.name}
                          </a>
                          {l.icp_match && <span className="badge badge-icp">ICP</span>}
                          {l.comment_text && <span className="badge" style={{ background: '#e8f5e9', color: 'var(--green)', fontSize: 9 }}>commented</span>}
                          {l.status === 'dm_sent' && <span className="badge badge-sent">sent</span>}
                          {l.status === 'replied' && <span className="badge badge-replied">replied</span>}
                          {l.status === 'dm_drafted' && <span className="badge badge-drafted">drafted</span>}
                          {l.status === 'converted' && <span className="badge" style={{ background: 'var(--green-bg)', color: 'var(--green)', fontSize: 9 }}>meeting</span>}
                        </div>
                        <div className="text-[11px] text-ink-4 mt-0.5">
                          {l.title || 'No headline'}{l.company ? ` · ${l.company}` : ''}
                        </div>
                        {l.comment_text && (
                          <div className="text-[11px] text-ink-3 mt-1 italic leading-relaxed">
                            &quot;{l.comment_text.slice(0, 150)}{l.comment_text.length > 150 ? '...' : ''}&quot;
                          </div>
                        )}

                        {/* DM draft */}
                        {l.dm_draft && (
                          <div className="mt-2">
                            <div className="text-xs text-ink-2 bg-[var(--bg-warm)] rounded-lg px-3 py-2 border border-rule-light leading-relaxed">
                              {l.dm_draft}
                            </div>
                            {editingId === l.id ? (
                              <div className="flex gap-2 mt-2">
                                <input
                                  className="input flex-1 text-xs py-1.5"
                                  placeholder="e.g. make it shorter, mention AI..."
                                  value={editInstruction}
                                  onChange={e => setEditInstruction(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleTailorDm(l, sc.post_topic ?? '') }}
                                  autoFocus
                                />
                                <button className="btn-accent" onClick={() => handleTailorDm(l, sc.post_topic ?? '')}
                                  disabled={draftingId === l.id || !editInstruction.trim()}>
                                  {draftingId === l.id ? '...' : 'Rewrite'}
                                </button>
                                <button className="btn-outline" onClick={() => { setEditingId(null); setEditInstruction('') }}>Cancel</button>
                              </div>
                            ) : (
                              <button className="text-[11px] text-accent hover:underline mt-1" onClick={() => setEditingId(l.id)}>
                                Tailor this DM
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action button */}
                      <div className="shrink-0 pt-0.5 flex flex-col gap-1">
                        {(l.status === 'icp_filtered' || l.status === 'scraped') && (
                          <button className="btn-accent" onClick={() => handleDraftDm(l, sc.post_topic ?? '')}
                            disabled={draftingId === l.id}>
                            {draftingId === l.id ? '...' : 'Draft DM'}
                          </button>
                        )}
                        {l.status === 'dm_drafted' && l.dm_draft && (
                          <button className="btn-primary" onClick={() => {
                            navigator.clipboard.writeText(l.dm_draft!)
                            if (l.linkedin_url) window.open(l.linkedin_url, '_blank')
                            updateLeadStatus(l.id, 'dm_sent')
                          }}>
                            Copy &amp; Open
                          </button>
                        )}
                        {l.status === 'dm_sent' && (
                          <>
                            <button className="btn-accent" onClick={() => updateLeadStatus(l.id, 'replied')}>
                              Got Reply
                            </button>
                            <button className="btn-outline text-[11px]" onClick={() => updateLeadStatus(l.id, 'dm_drafted')}>
                              Undo
                            </button>
                          </>
                        )}
                        {l.status === 'replied' && (
                          <>
                            <button className="btn-primary" onClick={() => updateLeadStatus(l.id, 'converted')}>
                              Meeting Booked
                            </button>
                            <button className="btn-outline text-[11px]" onClick={() => updateLeadStatus(l.id, 'dm_sent')}>
                              Undo
                            </button>
                          </>
                        )}
                        {l.status === 'converted' && (
                          <button className="btn-outline text-[11px]" onClick={() => updateLeadStatus(l.id, 'replied')}>
                            Undo
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {filteredLeads.length > 25 && (
                    <div className="text-center py-3 text-xs text-ink-4">+ {filteredLeads.length - 25} more leads</div>
                  )}
                  {filteredLeads.length === 0 && (
                    <div className="text-center py-6 text-xs text-ink-4">No leads match the selected filters</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {scrapes.length === 0 && !scraping && (
        <div className="text-center py-16 text-ink-4">
          <div className="text-4xl mb-3">↑</div>
          <div className="text-sm">Paste a LinkedIn post URL above to find leads who engage with content in your space</div>
        </div>
      )}
    </div>
  )
}
