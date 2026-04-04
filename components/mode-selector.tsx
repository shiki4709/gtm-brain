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
    description: 'Reply to trending posts, create content, track follower growth. Pipeline tools still available.',
    icon: '\u{1F4E3}',
  },
  {
    value: 'b2b_outbound',
    label: 'Book meetings',
    description: 'Scrape engagers, draft DMs, track pipeline. Content and reply tools still available.',
    icon: '\u{1F3AF}',
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
    <div className="modal-overlay">
      <div className="modal-card">
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full gradient-dot" />
            <span className="section-label">GTM Brain</span>
          </div>
          <h2 className="font-head text-xl font-bold text-ink">What&apos;s your goal?</h2>
          <p className="text-sm text-ink-3 mt-1">This shapes your feed, metrics, and weekly targets.</p>
        </div>

        {/* Options */}
        <div className="modal-body">
          <div className="space-y-2.5 mb-6">
            {MODES.map(mode => {
              const isSelected = selected === mode.value
              return (
                <button
                  key={mode.value}
                  onClick={() => setSelected(mode.value)}
                  className={`mode-option ${isSelected ? 'mode-option-active' : ''}`}
                >
                  <span className="text-lg leading-none">{mode.icon}</span>
                  <div>
                    <div className="font-head text-sm font-semibold text-ink">{mode.label}</div>
                    <div className="text-xs text-ink-3 mt-0.5">{mode.description}</div>
                  </div>
                </button>
              )
            })}
          </div>

          <button
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="btn-primary w-full"
          >
            {saving ? 'Setting up...' : 'Continue'}
          </button>

          <p className="text-center text-[11px] text-ink-4 mt-3">
            You can change this anytime in Settings
          </p>
        </div>
      </div>
    </div>
  )
}
