'use client'

import { useState, useEffect } from 'react'
import type { WeeklyProgress, FollowerDelta } from '@/lib/types'

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

const METRIC_LABELS: Record<string, string> = {
  reply: 'Replies',
  dm_send: 'DMs sent',
  scrape: 'Scrapes',
}

export default function ProgressWidget() {
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

  const showPersonalBrand = data.mode === 'personal_brand' || data.mode === 'both'
  const showB2B = data.mode === 'b2b_outbound' || data.mode === 'both'

  const personalBrandProgress = data.progress.filter(p => p.mode === 'personal_brand')
  const b2bProgress = data.progress.filter(p => p.mode === 'b2b_outbound')

  // Calculate overall completion for the ring
  const allProgress = data.progress
  const totalDone = allProgress.reduce((s, p) => s + Math.min(p.current, p.target), 0)
  const totalTarget = allProgress.reduce((s, p) => s + p.target, 0)
  const overallPct = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0

  return (
    <div className="brain-card mb-5">
      <div className="flex items-start gap-5">
        {/* Ring */}
        <div className="shrink-0">
          <ProgressRing pct={overallPct} size={52} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="section-label !mb-0">This week</span>
            {overallPct >= 100 && (
              <span className="badge badge-sent">Complete</span>
            )}
          </div>

          {/* Personal brand row */}
          {showPersonalBrand && personalBrandProgress.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {personalBrandProgress.map(p => (
                <MetricPill key={p.metric} progress={p} />
              ))}
              {data.followerDelta.current !== null && (
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  {data.followerDelta.current.toLocaleString()} followers
                  {data.followerDelta.delta7d !== null && (
                    <span style={{ color: data.followerDelta.delta7d >= 0 ? 'var(--green)' : 'var(--accent-orange)' }}>
                      {' '}{data.followerDelta.delta7d >= 0 ? '+' : ''}{data.followerDelta.delta7d}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}

          {/* B2B row */}
          {showB2B && b2bProgress.length > 0 && (
            <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 ${showPersonalBrand && personalBrandProgress.length > 0 ? 'mt-2.5 pt-2.5' : ''}`}
              style={showPersonalBrand && personalBrandProgress.length > 0 ? { borderTop: '1px solid rgba(33,150,243,0.08)' } : undefined}>
              {b2bProgress.map(p => (
                <MetricPill key={p.metric} progress={p} />
              ))}
              {(data.pipeline.leads > 0 || data.pipeline.dmsSent > 0) && (
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                  {data.pipeline.leads} leads {'\u2192'} {data.pipeline.dmsSent} DMs {'\u2192'} {data.pipeline.replies} replies
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricPill({ progress }: { progress: WeeklyProgress }) {
  const onPace = isOnPace(progress.current, progress.target)
  const pct = progress.target > 0 ? Math.min((progress.current / progress.target) * 100, 100) : 0
  const done = progress.current >= progress.target

  return (
    <div className="flex items-center gap-2">
      {/* Mini bar */}
      <div className="w-8 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--rule-light)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: done ? 'var(--green)' : onPace ? 'var(--blue-bright)' : 'var(--accent-orange)',
          }}
        />
      </div>
      <span className="text-sm font-medium" style={{
        color: done ? 'var(--green)' : 'var(--ink)',
        fontFamily: 'var(--font-head)',
      }}>
        {progress.current}<span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>/{progress.target}</span>
      </span>
      <span className="text-xs" style={{ color: 'var(--ink-4)' }}>
        {METRIC_LABELS[progress.metric] ?? progress.metric}
      </span>
    </div>
  )
}

function ProgressRing({ pct, size }: { pct: number; size: number }) {
  const stroke = 4
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  const offset = circ - (Math.min(pct, 100) / 100) * circ

  return (
    <svg width={size} height={size} className="block">
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="var(--rule-light)" strokeWidth={stroke}
      />
      {/* Fill */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke={pct >= 100 ? 'var(--green)' : 'var(--blue-bright)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      {/* Text */}
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        style={{
          fontSize: '13px',
          fontWeight: 700,
          fontFamily: 'var(--font-head)',
          fill: pct >= 100 ? 'var(--green)' : 'var(--ink)',
        }}
      >
        {pct}%
      </text>
    </svg>
  )
}
