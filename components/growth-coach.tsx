'use client'

import { useState, useEffect } from 'react'

interface GrowthSuggestion {
  metric: string
  target: number
  period: 'daily' | 'weekly'
  reason: string
  priority: 'high' | 'medium' | 'low'
  platform: 'x' | 'linkedin' | 'both'
  category: 'engage' | 'create' | 'connect'
}

interface GrowthPlan {
  stage: { stage: string; label: string; followerRange: string }
  suggestions: GrowthSuggestion[]
  weeklyPlaybook: string[]
  topTip: string
}

const METRIC_ICONS: Record<string, string> = {
  x_replies: '\u{1F4AC}',
  x_threads: '\u{1F9F5}',
  x_quotes: '\u{1F501}',
  x_posts: '\u270F\uFE0F',
  li_comments: '\u{1F4AC}',
  li_posts: '\u{1F4DD}',
  li_carousels: '\u{1F3A0}',
  li_connections: '\u{1F91D}',
}

const METRIC_LABELS: Record<string, string> = {
  x_replies: 'X Replies',
  x_threads: 'X Threads',
  x_quotes: 'Quote Tweets',
  x_posts: 'X Posts',
  li_comments: 'LinkedIn Comments',
  li_posts: 'LinkedIn Posts',
  li_carousels: 'LinkedIn Carousels',
  li_connections: 'New Connections',
}

export default function GrowthCoach() {
  const [plan, setPlan] = useState<GrowthPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    fetch('/api/growth-plan')
      .then(r => r.json())
      .then(json => {
        if (json.success) setPlan(json.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="brain-card mb-5">
      <div className="skeleton skeleton-text" style={{ width: '40%' }} />
      <div className="skeleton skeleton-text" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <div className="skeleton skeleton-stat" />
        <div className="skeleton skeleton-stat" />
      </div>
    </div>
  )
  if (!plan) return null

  const highPriority = plan.suggestions.filter(s => s.priority === 'high')
  const medPriority = plan.suggestions.filter(s => s.priority === 'medium')

  return (
    <div className="brain-card mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="section-label !mb-0">{plan.stage.label}</div>
          <span className="badge badge-icp">{plan.stage.followerRange}</span>
        </div>
        <button onClick={() => setCollapsed(!collapsed)} className="text-[11px] text-ink-4 hover:text-ink">
          {collapsed ? 'Show plan' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Top tip */}
          <div className="text-xs text-ink-2 leading-relaxed mb-4">{plan.topTip}</div>

          {/* High priority targets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {highPriority.map(s => (
              <div key={s.metric} className="card-flat py-2.5 px-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{METRIC_ICONS[s.metric] ?? '\u{1F4CB}'}</span>
                  <span className="font-head text-sm font-bold text-ink">{s.target}</span>
                  <span className="text-[10px] text-ink-4">/{s.period}</span>
                </div>
                <div className="text-[11px] text-ink-3">{METRIC_LABELS[s.metric] ?? s.metric}</div>
              </div>
            ))}
          </div>

          {/* Medium priority */}
          {medPriority.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4">
              {medPriority.map(s => (
                <div key={s.metric} className="flex items-center gap-1.5 text-xs text-ink-3">
                  <span>{METRIC_ICONS[s.metric] ?? '\u{1F4CB}'}</span>
                  <span className="font-head font-semibold text-ink">{s.target}</span>
                  <span>{METRIC_LABELS[s.metric] ?? s.metric}/{s.period}</span>
                </div>
              ))}
            </div>
          )}

          {/* Weekly playbook */}
          <div className="border-t border-separator pt-3">
            <div className="text-[10px] text-ink-4 uppercase tracking-wider font-semibold mb-2">This week&apos;s playbook</div>
            <div className="flex flex-col gap-1.5">
              {plan.weeklyPlaybook.map((item, i) => (
                <div key={i} className="flex gap-2 text-xs text-ink-3 leading-relaxed">
                  <span className="text-ink-4 shrink-0">{i + 1}.</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
