'use client'

import { useState, useEffect } from 'react'
import type { WeeklyProgress, FollowerDelta, UserMode } from '@/lib/types'

function isOnPace(current: number, target: number): boolean {
  const now = new Date()
  const day = now.getDay()
  const daysElapsed = day === 0 ? 7 : day
  const expectedPace = (daysElapsed / 7) * 0.8
  return target === 0 || (current / target) >= expectedPace
}

interface GoalsData {
  progress: WeeklyProgress[]
  followerDelta: FollowerDelta
  pipeline: { leads: number; dmsSent: number; replies: number }
  mode: string
}

const METRIC_CONFIG: Record<string, { label: string; verb: string; category: 'inbound' | 'outbound' }> = {
  reply: { label: 'Replies', verb: 'replied', category: 'inbound' },
  dm_send: { label: 'DMs sent', verb: 'sent', category: 'outbound' },
  scrape: { label: 'Scrapes', verb: 'scraped', category: 'outbound' },
}

interface ProgressWidgetProps {
  mode?: UserMode
}

export default function ProgressWidget({ mode: propMode }: ProgressWidgetProps) {
  const [data, setData] = useState<GoalsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/goals')
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null
  if (!data || data.progress.length === 0) return null

  const mode = propMode ?? data.mode ?? 'personal_brand'
  const showInbound = mode === 'personal_brand' || mode === 'both'
  const showOutbound = mode === 'b2b_outbound' || mode === 'both'

  const inboundProgress = data.progress.filter(p => METRIC_CONFIG[p.metric]?.category === 'inbound')
  const outboundProgress = data.progress.filter(p => METRIC_CONFIG[p.metric]?.category === 'outbound')

  // Overall completion
  const allProgress = data.progress
  const totalDone = allProgress.reduce((s, p) => s + Math.min(p.current, p.target), 0)
  const totalTarget = allProgress.reduce((s, p) => s + p.target, 0)
  const overallPct = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0

  return (
    <div className="mb-6">
      {/* Metric cards row */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Inbound metrics */}
        {showInbound && inboundProgress.map(p => (
          <MetricCard key={p.metric} progress={p} />
        ))}

        {/* Follower card */}
        {showInbound && data.followerDelta.current !== null && (
          <div className="stat-card">
            <div className="stat-num stat-num-blue">{data.followerDelta.current.toLocaleString()}</div>
            <div className="stat-label">
              Followers
              {data.followerDelta.delta7d !== null && (
                <span className={data.followerDelta.delta7d >= 0 ? ' text-green' : ' text-orange'}>
                  {' '}{data.followerDelta.delta7d >= 0 ? '+' : ''}{data.followerDelta.delta7d} this week
                </span>
              )}
            </div>
          </div>
        )}

        {/* Outbound metrics */}
        {showOutbound && outboundProgress.map(p => (
          <MetricCard key={p.metric} progress={p} />
        ))}

        {/* Pipeline card */}
        {showOutbound && (data.pipeline.leads > 0 || data.pipeline.dmsSent > 0) && (
          <div className="stat-card">
            <div className="stat-num stat-num-orange">{data.pipeline.leads}</div>
            <div className="stat-label">
              ICP leads {'\u2192'} {data.pipeline.dmsSent} DMs {'\u2192'} {data.pipeline.replies} replies
            </div>
          </div>
        )}
      </div>

      {/* Overall progress bar */}
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

function MetricCard({ progress }: { progress: WeeklyProgress }) {
  const config = METRIC_CONFIG[progress.metric]
  const onPace = isOnPace(progress.current, progress.target)
  const done = progress.current >= progress.target
  const pct = progress.target > 0 ? Math.min((progress.current / progress.target) * 100, 100) : 0

  return (
    <div className="stat-card relative overflow-hidden">
      {/* Background fill */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-all duration-500 opacity-[0.06]"
        style={{
          height: `${pct}%`,
          backgroundColor: done ? 'var(--green)' : onPace ? 'var(--blue-bright)' : 'var(--accent-orange)',
        }}
      />
      <div className="relative">
        <div className={`stat-num ${done ? 'stat-num-green' : 'stat-num-blue'}`}>
          {progress.current}<span className="text-ink-4 text-base font-normal">/{progress.target}</span>
        </div>
        <div className="stat-label">{config?.label ?? progress.metric}</div>
      </div>
    </div>
  )
}
