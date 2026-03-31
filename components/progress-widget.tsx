'use client'

import { useState, useEffect } from 'react'
import type { WeeklyProgress, FollowerDelta } from '@/lib/types'

// Pure function — no server dependencies
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

  return (
    <div className="mb-6 space-y-3">
      {showPersonalBrand && personalBrandProgress.length > 0 && (
        <div className="border border-rule rounded-lg p-4 bg-surface">
          <div className="text-xs font-medium text-ink-4 uppercase tracking-wider mb-3">This week — Personal Brand</div>
          <div className="flex flex-wrap gap-4">
            {personalBrandProgress.map(p => (
              <ProgressBar key={p.metric} progress={p} />
            ))}
            {data.followerDelta.current !== null && (
              <div className="text-sm text-ink-3">
                Followers: <span className="text-ink font-medium">{data.followerDelta.current.toLocaleString()}</span>
                {data.followerDelta.delta7d !== null && (
                  <span className={data.followerDelta.delta7d >= 0 ? 'text-green-600 ml-1' : 'text-red-500 ml-1'}>
                    {data.followerDelta.delta7d >= 0 ? '+' : ''}{data.followerDelta.delta7d} vs last week
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showB2B && b2bProgress.length > 0 && (
        <div className="border border-rule rounded-lg p-4 bg-surface">
          <div className="text-xs font-medium text-ink-4 uppercase tracking-wider mb-3">This week — B2B Outbound</div>
          <div className="flex flex-wrap gap-4">
            {b2bProgress.map(p => (
              <ProgressBar key={p.metric} progress={p} />
            ))}
          </div>
          {(data.pipeline.leads > 0 || data.pipeline.dmsSent > 0) && (
            <div className="mt-3 text-sm text-ink-3">
              Pipeline: <span className="text-ink">{data.pipeline.leads}</span> leads
              {' → '}<span className="text-ink">{data.pipeline.dmsSent}</span> DMs
              {' → '}<span className="text-ink">{data.pipeline.replies}</span> replies
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ progress }: { progress: WeeklyProgress }) {
  const pct = progress.target > 0 ? Math.min((progress.current / progress.target) * 100, 100) : 0
  const onPace = isOnPace(progress.current, progress.target)
  const color = onPace ? 'bg-green-500' : 'bg-amber-500'

  return (
    <div className="flex-1 min-w-[120px]">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm text-ink font-medium">
          {progress.current}/{progress.target} {METRIC_LABELS[progress.metric] ?? progress.metric}
        </span>
      </div>
      <div className="h-1.5 bg-rule rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
