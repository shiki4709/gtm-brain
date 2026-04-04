'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WeeklyProgress, FollowerDelta, UserMode } from '@/lib/types'

interface GoalsData {
  progress: WeeklyProgress[]
  followerDelta: FollowerDelta
  pipeline: { leads: number; dmsSent: number; replies: number }
  mode: string
}

const X_METRICS = new Set(['reply', 'x_thread', 'x_quote', 'x_post'])
const LI_METRICS = new Set(['li_comment', 'li_post', 'li_carousel', 'li_connection'])

const METRIC_LABELS: Record<string, string> = {
  reply: 'Replies',
  x_thread: 'Threads',
  x_quote: 'Quotes',
  x_post: 'Posts',
  li_comment: 'Comments',
  li_post: 'Posts',
  li_carousel: 'Carousels',
  li_connection: 'Connections',
  dm_send: 'DMs',
  scrape: 'Scrapes',
}

interface ProgressWidgetProps {
  mode?: UserMode
}

export default function ProgressWidget({ mode: propMode }: ProgressWidgetProps) {
  const [data, setData] = useState<GoalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState<string | null>(null)

  const fetchData = useCallback(() => {
    fetch('/api/goals')
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function quickLog(metric: string) {
    setLogging(metric)
    await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: metric }),
    }).catch(() => {})
    setLogging(null)
    fetchData()
  }

  if (loading) return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-2">
        <div className="skeleton skeleton-stat" />
        <div className="skeleton skeleton-stat" />
      </div>
    </div>
  )
  if (!data || data.progress.length === 0) return null

  const mode = propMode ?? data.mode ?? 'personal_brand'

  // Group by platform
  const xGoals = data.progress.filter(p => X_METRICS.has(p.metric))
  const liGoals = data.progress.filter(p => LI_METRICS.has(p.metric))
  const otherGoals = data.progress.filter(p => !X_METRICS.has(p.metric) && !LI_METRICS.has(p.metric))

  // Platform summary
  function platformSummary(goals: WeeklyProgress[]) {
    const done = goals.reduce((s, p) => s + Math.min(p.current, p.target), 0)
    const total = goals.reduce((s, p) => s + p.target, 0)
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return { done, total, pct }
  }

  const xSummary = platformSummary(xGoals)
  const liSummary = platformSummary(liGoals)

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-2">
        {/* X / Twitter column */}
        {xGoals.length > 0 && (
          <div className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider">X / Twitter</span>
              <span className="text-[10px] text-ink-4">{xSummary.pct}%</span>
            </div>
            <div className="space-y-1.5">
              {xGoals.map(p => (
                <MetricRow key={p.metric} progress={p} onLog={quickLog} logging={logging} />
              ))}
            </div>
          </div>
        )}

        {/* LinkedIn column */}
        {liGoals.length > 0 && (
          <div className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-ink-4 uppercase tracking-wider">LinkedIn</span>
              <span className="text-[10px] text-ink-4">{liSummary.pct}%</span>
            </div>
            <div className="space-y-1.5">
              {liGoals.map(p => (
                <MetricRow key={p.metric} progress={p} onLog={quickLog} logging={logging} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Other metrics (DMs, Scrapes) */}
      {mode === 'b2b_outbound' && otherGoals.length > 0 && (
        <div className="flex gap-2 mt-2">
          {otherGoals.map(p => (
            <MetricRow key={p.metric} progress={p} onLog={quickLog} logging={logging} inline />
          ))}
        </div>
      )}
    </div>
  )
}

function MetricRow({ progress, onLog, logging, inline }: {
  progress: WeeklyProgress
  onLog: (metric: string) => void
  logging: string | null
  inline?: boolean
}) {
  const label = METRIC_LABELS[progress.metric] ?? progress.metric
  const done = progress.current >= progress.target
  const pct = progress.target > 0 ? Math.min((progress.current / progress.target) * 100, 100) : 0
  const isLogging = logging === progress.metric
  const period = progress.period === 'daily' ? '/day' : '/wk'

  if (inline) {
    return (
      <button
        onClick={() => onLog(progress.metric)}
        disabled={isLogging}
        className="stat-card flex-1 text-left hover:border-accent transition-colors cursor-pointer py-2 px-3"
        title={`Tap to log. ${progress.period === 'daily' ? 'Resets daily.' : 'Resets weekly.'}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-ink-4">{label} {period}</span>
          <span className={`font-head text-sm font-bold ${done ? 'text-green' : 'text-ink'}`}>
            {progress.current}<span className="text-ink-4 text-xs font-normal">/{progress.target}</span>
          </span>
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={() => onLog(progress.metric)}
      disabled={isLogging}
      className="w-full flex items-center gap-2 group hover:bg-[var(--bg-warm)] rounded px-1 py-0.5 -mx-1 transition-colors cursor-pointer"
      title={`Tap to log a ${label}. ${progress.period === 'daily' ? 'Resets daily.' : 'Resets weekly.'}`}
    >
      {/* Label */}
      <span className="text-xs text-ink-3 shrink-0 w-16 text-left">{label}</span>
      {/* Progress bar */}
      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-rule-light">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: done ? 'var(--green)' : 'var(--blue-bright)',
          }}
        />
      </div>
      {/* Count */}
      <span className={`font-head text-xs font-bold shrink-0 ${done ? 'text-green' : 'text-ink-3'}`}>
        {progress.current}<span className="text-ink-4 font-normal">/{progress.target}</span>
      </span>
      <span className="text-[10px] text-ink-4 shrink-0 w-6">{period}</span>
      {isLogging && <span className="text-[10px] text-accent font-semibold">+1</span>}
    </button>
  )
}
