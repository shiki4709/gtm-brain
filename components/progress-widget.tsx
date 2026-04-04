'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WeeklyProgress, FollowerDelta, UserMode } from '@/lib/types'

interface GoalsData {
  progress: WeeklyProgress[]
  followerDelta: FollowerDelta
  pipeline: { leads: number; dmsSent: number; replies: number }
  mode: string
}

const METRIC_CONFIG: Record<string, { label: string; icon: string; category: 'inbound' | 'outbound' }> = {
  reply: { label: 'X Replies', icon: '\u{1F4AC}', category: 'inbound' },
  x_thread: { label: 'Threads', icon: '\u{1F9F5}', category: 'inbound' },
  x_quote: { label: 'Quotes', icon: '\u{1F501}', category: 'inbound' },
  x_post: { label: 'X Posts', icon: '\u270F\uFE0F', category: 'inbound' },
  li_comment: { label: 'LI Comments', icon: '\u{1F4AC}', category: 'inbound' },
  li_post: { label: 'LI Posts', icon: '\u{1F4DD}', category: 'inbound' },
  li_carousel: { label: 'Carousels', icon: '\u{1F3A0}', category: 'inbound' },
  li_connection: { label: 'Connections', icon: '\u{1F91D}', category: 'outbound' },
  dm_send: { label: 'DMs Sent', icon: '\u2709\uFE0F', category: 'outbound' },
  scrape: { label: 'Scrapes', icon: '\u{1F50D}', category: 'outbound' },
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
    fetchData() // refresh counts
  }

  if (loading) return (
    <div className="mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        <div className="skeleton skeleton-stat" />
        <div className="skeleton skeleton-stat" />
        <div className="skeleton skeleton-stat" />
      </div>
    </div>
  )
  if (!data || data.progress.length === 0) return null

  const mode = propMode ?? data.mode ?? 'personal_brand'

  // Split daily and weekly goals
  const dailyGoals = data.progress.filter(p => p.period === 'daily')
  const weeklyGoals = data.progress.filter(p => p.period === 'weekly')

  // Overall completion
  const allProgress = data.progress
  const totalDone = allProgress.reduce((s, p) => s + Math.min(p.current, p.target), 0)
  const totalTarget = allProgress.reduce((s, p) => s + p.target, 0)
  const overallPct = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0

  return (
    <div className="mb-6">
      {/* Daily goals — today's actions */}
      {dailyGoals.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="section-label">Today</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {dailyGoals.map(p => (
              <MetricTile key={p.metric} progress={p} onLog={quickLog} logging={logging} />
            ))}
          </div>
        </div>
      )}

      {/* Weekly goals */}
      {weeklyGoals.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="section-label">This week</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {weeklyGoals.map(p => (
              <MetricTile key={p.metric} progress={p} onLog={quickLog} logging={logging} />
            ))}
          </div>
        </div>
      )}

      {/* Follower + pipeline row */}
      {(data.followerDelta.current !== null || (data.pipeline.leads > 0 || data.pipeline.dmsSent > 0)) && (
        <div className="flex flex-wrap gap-3 text-xs text-ink-3 mb-3">
          {data.followerDelta.current !== null && (
            <span>
              {data.followerDelta.current.toLocaleString()} followers
              {data.followerDelta.delta7d !== null && (
                <span className={data.followerDelta.delta7d >= 0 ? ' text-green' : ' text-orange'}>
                  {' '}{data.followerDelta.delta7d >= 0 ? '+' : ''}{data.followerDelta.delta7d}
                </span>
              )}
            </span>
          )}
          {mode === 'b2b_outbound' && (data.pipeline.leads > 0 || data.pipeline.dmsSent > 0) && (
            <span>
              Pipeline: {data.pipeline.leads} leads {'\u2192'} {data.pipeline.dmsSent} DMs {'\u2192'} {data.pipeline.replies} replies
            </span>
          )}
        </div>
      )}

      {/* Overall bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-rule-light">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${overallPct}%`,
              backgroundColor: overallPct >= 100 ? 'var(--green)' : 'var(--blue-bright)',
            }}
          />
        </div>
        <span className="font-head text-xs font-bold text-ink-3">{overallPct}%</span>
      </div>
    </div>
  )
}

function MetricTile({ progress, onLog, logging }: {
  progress: WeeklyProgress
  onLog: (metric: string) => void
  logging: string | null
}) {
  const config = METRIC_CONFIG[progress.metric]
  const done = progress.current >= progress.target
  const pct = progress.target > 0 ? Math.min((progress.current / progress.target) * 100, 100) : 0
  const isLogging = logging === progress.metric

  return (
    <button
      onClick={() => onLog(progress.metric)}
      disabled={isLogging}
      className="stat-card relative overflow-hidden text-left hover:border-accent transition-colors cursor-pointer"
      title={`Tap to log a ${config?.label ?? progress.metric}. ${progress.period === 'daily' ? 'Resets daily.' : 'Resets weekly.'}`}
    >
      {/* Background fill */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-all duration-500 opacity-[0.06]"
        style={{
          height: `${pct}%`,
          backgroundColor: done ? 'var(--green)' : 'var(--blue-bright)',
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`font-head text-lg font-bold ${done ? 'text-green' : 'text-ink'}`}>
            {progress.current}<span className="text-ink-4 text-sm font-normal">/{progress.target}</span>
          </span>
          <span className="text-sm" aria-hidden="true">{config?.icon ?? '\u{1F4CB}'}</span>
        </div>
        <div className="text-[11px] text-ink-4">
          {config?.label ?? progress.metric}
          <span className="ml-1 opacity-60">/{progress.period === 'daily' ? 'day' : 'wk'}</span>
        </div>
      </div>
      {isLogging && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/80">
          <span className="text-xs text-accent font-semibold">+1</span>
        </div>
      )}
    </button>
  )
}
