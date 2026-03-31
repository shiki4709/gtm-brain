'use client'

import { useState } from 'react'
import type { UserMode } from '@/lib/types'

interface ModeSelectorProps {
  onComplete: (mode: UserMode) => void
}

const MODES: Array<{ value: UserMode; label: string; description: string; icon: string }> = [
  {
    value: 'personal_brand',
    label: 'Grow my audience',
    description: 'Reply to trending posts, build visibility, track follower growth',
    icon: '📣',
  },
  {
    value: 'b2b_outbound',
    label: 'Book meetings',
    description: 'Scrape engagers, draft DMs, track pipeline from lead to meeting',
    icon: '🎯',
  },
  {
    value: 'both',
    label: 'Both',
    description: 'Build your brand and generate leads simultaneously',
    icon: '⚡',
  },
]

export default function ModeSelector({ onComplete }: ModeSelectorProps) {
  const [selected, setSelected] = useState<UserMode | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selected }),
      })
      const json = await res.json()
      if (json.success) {
        onComplete(selected)
      }
    } catch {
      // retry on next visit
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4"
      style={{ backgroundColor: 'rgba(26,30,46,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="rounded-xl max-w-md w-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg)', border: '1.5px solid var(--rule)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>

        {/* Header with gradient accent */}
        <div style={{ background: 'var(--gradient-subtle)', padding: '28px 28px 20px' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--gradient-main)' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-head)' }}>
              GTM Brain
            </span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>
            What&apos;s your goal?
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
            This shapes your feed, metrics, and weekly targets.
          </p>
        </div>

        {/* Options */}
        <div style={{ padding: '16px 28px 24px' }}>
          <div className="space-y-2.5 mb-6">
            {MODES.map(mode => {
              const isSelected = selected === mode.value
              return (
                <button
                  key={mode.value}
                  onClick={() => setSelected(mode.value)}
                  className="w-full text-left rounded-lg transition-all"
                  style={{
                    padding: '14px 16px',
                    border: `1.5px solid ${isSelected ? 'var(--blue-bright)' : 'var(--rule)'}`,
                    backgroundColor: isSelected ? 'rgba(33,150,243,0.04)' : '#fff',
                    boxShadow: isSelected ? '0 0 0 1px rgba(33,150,243,0.1)' : 'none',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{mode.icon}</span>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--ink)', fontFamily: 'var(--font-head)' }}>
                        {mode.label}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                        {mode.description}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <button
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="btn-primary w-full"
            style={{ padding: '11px 20px', fontSize: '13px' }}
          >
            {saving ? 'Setting up...' : 'Continue'}
          </button>

          <p className="text-center text-[11px] mt-3" style={{ color: 'var(--ink-4)' }}>
            You can change this anytime in Settings
          </p>
        </div>
      </div>
    </div>
  )
}
