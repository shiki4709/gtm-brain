'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface PipelineCounts {
  scraped: number
  icp: number
  dm_drafted: number
  dm_sent: number
  replied: number
  converted: number
}

interface TopicInsight {
  topic: string
  avg_icp_rate: number
  scrape_count: number
  total_icp_leads: number
  confidence: number
}

interface DmInsight {
  angle: string
  sent: number
  replies: number
  reply_rate: number
}

interface Insights {
  topic_performance?: TopicInsight[]
  dm_effectiveness?: DmInsight[]
  timing?: { best_day: string; best_rate: number }
}

export default function BrainHome() {
  const [pipeline, setPipeline] = useState<PipelineCounts | null>(null)
  const [insights, setInsights] = useState<Insights | null>(null)
  const [weeklySummary, setWeeklySummary] = useState('')
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/pipeline').then(r => r.json()),
      fetch('/api/insights').then(r => r.json()),
    ])
      .then(([pipelineJson, insightsJson]) => {
        if (pipelineJson.success) setPipeline(pipelineJson.data)
        if (insightsJson.success) setInsights(insightsJson.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function generateSummary() {
    setGeneratingSummary(true)
    try {
      const res = await fetch('/api/insights', { method: 'POST' })
      const json = await res.json()
      if (json.summary) setWeeklySummary(json.summary)
    } catch { /* silently fail */ }
    finally { setGeneratingSummary(false) }
  }

  const p = pipeline ?? { scraped: 0, icp: 0, dm_drafted: 0, dm_sent: 0, replied: 0, converted: 0 }
  const topTopic = insights?.topic_performance?.[0]
  const topAngle = insights?.dm_effectiveness?.[0]
  const hasData = p.scraped > 0

  if (loading) return <div className="text-sm text-ink-4 py-8 text-center">Loading...</div>

  // ═══ NEW USER — zero data ═══
  if (!hasData) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10 pt-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full gradient-dot" />
            <span className="font-head text-xl font-bold text-ink">GTM Brain</span>
          </div>
          <h1 className="font-head text-2xl font-bold text-ink mb-3">
            Your second brain for GTM
          </h1>
          <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed">
            Every scrape, DM, and reply teaches it what works for your market. The more you use it, the smarter it gets.
          </p>
        </div>

        {/* How it works */}
        <div className="brain-card mb-8">
          <div className="section-label mb-4">How it works</div>
          <div className="flex flex-col gap-6">
            <div className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
              <div>
                <div className="font-head text-sm font-semibold text-ink mb-0.5">Find Leads</div>
                <div className="text-xs text-ink-3 leading-relaxed">
                  Scrape a LinkedIn post to discover who engages with content in your space. The brain filters to your ICP and drafts personalized DMs.
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-orange text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
              <div>
                <div className="font-head text-sm font-semibold text-ink mb-0.5">Build Presence</div>
                <div className="text-xs text-ink-3 leading-relaxed">
                  Create content and engage on X to attract your ICP to you. When they engage with your posts, scrape the engagers to close the loop.
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--gradient-main)', color: '#fff' }}>3</div>
              <div>
                <div className="font-head text-sm font-semibold text-ink mb-0.5">Brain Learns</div>
                <div className="text-xs text-ink-3 leading-relaxed">
                  After a few scrapes, the brain spots patterns — which topics attract your ICP, which DM angles get replies, when to scrape. It gets smarter every cycle.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <Link href="/find-leads" className="btn-primary px-8 py-3 text-sm">
            Find your first leads →
          </Link>
        </div>

        {/* Loop diagram */}
        <div className="mt-12 flex justify-center">
          <div className="flex items-center gap-4 text-[11px] text-ink-4">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-head text-xs font-bold mb-1">FL</div>
              <div>Find Leads</div>
            </div>
            <div>→</div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center font-head text-xs font-bold mb-1" style={{ background: 'var(--gradient-main)', color: '#fff' }}>Brain</div>
              <div>Learns</div>
            </div>
            <div>←</div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full text-white flex items-center justify-center font-head text-xs font-bold mb-1" style={{ background: 'var(--accent-orange)' }}>BP</div>
              <div>Build Presence</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══ RETURNING USER — has data ═══
  // Build action items with brain reasoning
  const actions: Array<{ count: number; text: string; reason: string; href: string; color: 'blue' | 'orange' }> = []

  const newIcp = p.icp - p.dm_drafted
  if (newIcp > 0) {
    actions.push({
      count: newIcp,
      text: 'new ICP leads to review',
      reason: topTopic
        ? `Posts about "${topTopic.topic}" yield ${Math.round(topTopic.avg_icp_rate * 100)}% ICP rate`
        : 'Scrape results ready for review',
      href: '/find-leads',
      color: 'blue',
    })
  }

  const drafted = p.dm_drafted - p.dm_sent
  if (drafted > 0) {
    actions.push({
      count: drafted,
      text: 'DMs drafted, ready to send',
      reason: topAngle
        ? `${topAngle.angle.replace('_', ' ')} DMs get ${Math.round(topAngle.reply_rate * 100)}% reply rate`
        : 'DMs are ready — copy and send on LinkedIn',
      href: '/find-leads',
      color: 'blue',
    })
  }

  if (p.replied > 0) {
    const replyRate = p.dm_sent > 0 ? Math.round((p.replied / p.dm_sent) * 100) : 0
    actions.push({
      count: p.replied,
      text: `leads replied (${replyRate}% reply rate)`,
      reason: 'Follow up to book meetings',
      href: '/find-leads',
      color: 'blue',
    })
  }

  if (p.converted > 0) {
    actions.push({
      count: p.converted,
      text: 'meetings booked',
      reason: 'The loop is working',
      href: '/find-leads',
      color: 'blue',
    })
  }

  if (topTopic) {
    actions.push({
      count: 0,
      text: `Write about "${topTopic.topic}"`,
      reason: `${Math.round(topTopic.avg_icp_rate * 100)}% ICP match rate — your best-performing topic`,
      href: `/build-presence?topic=${encodeURIComponent(topTopic.topic + ' challenges and trends')}`,
      color: 'orange',
    })
  }

  if (actions.length === 0) {
    actions.push({
      count: 0,
      text: 'Scrape a new post to feed the brain',
      reason: 'The brain needs more data to give you better recommendations',
      href: '/find-leads',
      color: 'blue',
    })
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Brain Summary */}
      <div className="brain-card mb-8" style={{ padding: '24px 28px' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full gradient-dot" />
            <span className="font-head text-sm font-bold text-ink">Brain</span>
          </div>
          {!weeklySummary && (
            <button onClick={generateSummary} disabled={generatingSummary}
              className="text-xs text-accent font-semibold hover:underline">
              {generatingSummary ? 'Thinking...' : 'Generate summary'}
            </button>
          )}
        </div>

        {weeklySummary ? (
          <p className="text-sm leading-relaxed text-ink-2">{weeklySummary}</p>
        ) : (
          <p className="text-sm leading-relaxed text-ink-2">
            {topTopic ? (
              <>
                Posts about <strong className="text-accent">{topTopic.topic}</strong> yield{' '}
                <strong className="text-accent">{Math.round(topTopic.avg_icp_rate * 100)}%</strong> ICP match rate
                ({topTopic.total_icp_leads} leads from {topTopic.scrape_count} scrapes).
              </>
            ) : (
              <>You&apos;ve scraped <strong className="text-accent">{p.scraped}</strong> engagers and found{' '}
              <strong className="text-accent">{p.icp}</strong> ICP leads.</>
            )}
            {topAngle && topAngle.sent >= 3 && (
              <> DMs using <strong className="text-orange">{topAngle.angle.replace('_', ' ')}</strong> get{' '}
              <strong className="text-orange">{Math.round(topAngle.reply_rate * 100)}%</strong> reply rate.</>
            )}
          </p>
        )}

        {topTopic && topTopic.confidence < 1.0 && (
          <div className="flex items-center gap-1.5 mt-3 text-[11px] text-ink-4">
            <div className="conf-bar">
              <div className={`conf-fill ${topTopic.confidence >= 0.7 ? 'conf-high' : topTopic.confidence >= 0.4 ? 'conf-med' : 'conf-low'}`}
                style={{ width: `${topTopic.confidence * 100}%` }} />
            </div>
            {topTopic.confidence >= 0.7 ? 'High' : topTopic.confidence >= 0.4 ? 'Medium' : 'Low'} confidence · {topTopic.scrape_count} scrapes
          </div>
        )}

        {insights?.timing && (
          <div className="mt-3 text-xs text-ink-3">
            Best day to scrape: <strong className="text-accent">{insights.timing.best_day}s</strong> ({Math.round(insights.timing.best_rate * 100)}% ICP rate)
          </div>
        )}
      </div>

      {/* What to do next */}
      <div className="section-label mb-3">What to do next</div>
      <div className="flex flex-col gap-2 mb-8">
        {actions.map((a, i) => (
          <Link key={i} href={a.href}
            className="bg-white border border-rule rounded-[var(--radius)] px-5 py-4 hover:border-accent transition-colors block">
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full ${a.color === 'blue' ? 'bg-accent' : 'bg-orange'}`} />
              <span className="text-sm font-semibold text-ink">
                {a.count > 0 && <strong>{a.count}</strong>} {a.text}
              </span>
            </div>
            <div className="text-[11px] text-ink-4 ml-[18px]">
              Brain: {a.reason}
            </div>
          </Link>
        ))}
      </div>

      {/* Loop diagram */}
      <div className="flex justify-center mb-8">
        <div className="flex items-center gap-4 text-[11px] text-ink-4">
          <Link href="/find-leads" className="text-center hover:text-accent transition-colors">
            <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-head text-xs font-bold mb-1">FL</div>
            <div>Find Leads</div>
          </Link>
          <div>→</div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-head text-xs font-bold mb-1" style={{ background: 'var(--gradient-main)', color: '#fff' }}>Brain</div>
            <div>Learns</div>
          </div>
          <div>←</div>
          <Link href="/build-presence" className="text-center hover:text-orange transition-colors">
            <div className="w-10 h-10 rounded-full text-white flex items-center justify-center font-head text-xs font-bold mb-1" style={{ background: 'var(--accent-orange)' }}>BP</div>
            <div>Build Presence</div>
          </Link>
        </div>
      </div>

      {/* Pipeline stats */}
      <div className="section-label mb-3">Pipeline</div>
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { num: p.icp, label: 'ICP leads', cls: 'text-accent' },
          { num: p.dm_sent, label: 'DMs sent', cls: 'text-green' },
          { num: p.replied, label: 'Replies', cls: 'text-orange' },
          { num: p.converted, label: 'Meetings', cls: 'text-accent' },
          { num: p.scraped, label: 'Scraped', cls: 'text-ink-3' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-rule rounded-[var(--radius-sm)] py-3 px-2 text-center">
            <div className={`font-head text-xl font-bold ${s.cls}`}>{s.num}</div>
            <div className="text-[10px] text-ink-4 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {p.icp > 0 && (
        <div className="text-center py-2">
          <a href="/api/export-csv" className="text-xs text-accent font-semibold hover:underline">
            Export {p.icp} ICP leads as Sales Nav CSV
          </a>
        </div>
      )}
    </div>
  )
}
