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

export default function Overview() {
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

  const actions: Array<{ count: number; text: string; tag: string; href: string }> = []
  const newIcp = p.icp - p.dm_drafted
  if (newIcp > 0) actions.push({ count: newIcp, text: 'new ICP leads to review', tag: 'outbound', href: '/outbound' })
  const drafted = p.dm_drafted - p.dm_sent
  if (drafted > 0) actions.push({ count: drafted, text: 'DMs drafted, ready to send', tag: 'outbound', href: '/outbound' })
  if (p.replied > 0) actions.push({ count: p.replied, text: 'leads replied to your DM', tag: 'outbound', href: '/outbound' })
  if (p.converted > 0) actions.push({ count: p.converted, text: 'meetings booked', tag: 'outbound', href: '/outbound' })

  if (loading) return <div className="text-sm text-ink-4 py-8 text-center">Loading...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-head text-2xl font-bold text-ink mb-2">Dashboard</h1>
      <p className="text-sm text-ink-3 mb-1">
        Your GTM pipeline at a glance. Every scrape, DM, and reply feeds the brain.
      </p>
      <p className="text-[11px] text-ink-4 mb-8">
        Tracks: topic performance · DM reply rate · ICP patterns · best timing
      </p>

      {/* Brain insight */}
      <div className="brain-card mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 section-label mb-0">
            <div className="w-1.5 h-1.5 rounded-full gradient-dot" />
            Brain insight
          </div>
          {hasData && !weeklySummary && (
            <button onClick={generateSummary} disabled={generatingSummary}
              className="text-xs text-accent font-semibold hover:underline">
              {generatingSummary ? 'Generating...' : 'Generate summary'}
            </button>
          )}
        </div>

        {weeklySummary ? (
          <p className="text-sm leading-relaxed">{weeklySummary}</p>
        ) : hasData ? (
          <p className="text-sm leading-relaxed">
            {topTopic ? (
              <>Posts about <strong className="text-accent">{topTopic.topic}</strong> yield{' '}
              <strong className="text-accent">{Math.round(topTopic.avg_icp_rate * 100)}%</strong> ICP match rate
              ({topTopic.total_icp_leads} leads from {topTopic.scrape_count} scrapes).</>
            ) : (
              <>You&apos;ve scraped <strong className="text-accent">{p.scraped}</strong> engagers and found{' '}
              <strong className="text-accent">{p.icp}</strong> ICP leads.</>
            )}
            {topAngle && topAngle.sent >= 3 && (
              <> DMs using <strong className="text-orange">{topAngle.angle.replace('_', ' ')}</strong> get{' '}
              <strong className="text-orange">{Math.round(topAngle.reply_rate * 100)}%</strong> reply rate.</>
            )}
          </p>
        ) : (
          <p className="text-sm leading-relaxed">
            Welcome to GTM Brain. Head to Outbound to scrape your first LinkedIn post and start building your pipeline.
          </p>
        )}

        {topTopic && topTopic.confidence < 1.0 && (
          <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-ink-4">
            <div className="conf-bar">
              <div className={`conf-fill ${topTopic.confidence >= 0.7 ? 'conf-high' : topTopic.confidence >= 0.4 ? 'conf-med' : 'conf-low'}`}
                style={{ width: `${topTopic.confidence * 100}%` }} />
            </div>
            {topTopic.confidence >= 0.7 ? 'High' : topTopic.confidence >= 0.4 ? 'Medium' : 'Low'} confidence · {topTopic.scrape_count} scrapes
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="section-label mb-3">Pipeline</div>
      <div className="grid grid-cols-5 gap-3 mb-8">
        {[
          { num: p.icp, label: 'ICP leads', cls: 'text-accent' },
          { num: p.dm_sent, label: 'DMs sent', cls: 'text-green' },
          { num: p.replied, label: 'Replies', cls: 'text-orange' },
          { num: p.converted, label: 'Meetings', cls: 'text-accent' },
          { num: p.scraped, label: 'Total scraped', cls: 'text-ink-3' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-rule rounded-[var(--radius-sm)] py-4 px-3 text-center">
            <div className={`font-head text-2xl font-bold ${s.cls}`}>{s.num}</div>
            <div className="text-[10px] text-ink-4 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="mb-8">
          <div className="section-label mb-3">Needs your attention</div>
          <div className="flex flex-col gap-2">
            {actions.map((a, i) => (
              <Link key={i} href={a.href}
                className="flex items-center justify-between py-3 px-4 bg-white border border-rule rounded-[var(--radius)] hover:border-accent transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${a.tag === 'outbound' ? 'bg-accent' : 'bg-orange'}`} />
                  <span className="text-sm"><strong>{a.count}</strong> {a.text}</span>
                  <span className={a.tag === 'outbound' ? 'tag-outbound' : 'tag-inbound'}>{a.tag}</span>
                </div>
                <span className="font-head text-xs font-semibold text-accent">Review →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Brain nudges */}
      {insights?.timing && (
        <div className="brain-nudge mb-6">
          <div className="brain-nudge-icon">B</div>
          <div className="flex-1 text-sm">
            Your ICP engages most on <strong className="text-accent">{insights.timing.best_day}s</strong> ({Math.round(insights.timing.best_rate * 100)}% ICP rate). Schedule scrapes for that day.
          </div>
        </div>
      )}

      {!hasData && (
        <div className="text-center py-16 text-ink-4">
          <div className="text-4xl mb-3">→</div>
          <div className="text-sm mb-4">No activity yet</div>
          <Link href="/outbound" className="btn-primary px-6 py-3">Go to Outbound →</Link>
        </div>
      )}

      {p.icp > 0 && (
        <div className="text-center py-4">
          <a href="/api/export-csv" className="text-xs text-accent font-semibold hover:underline">
            Export {p.icp} ICP leads as Sales Nav CSV
          </a>
        </div>
      )}
    </div>
  )
}
