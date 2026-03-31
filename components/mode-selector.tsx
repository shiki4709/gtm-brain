'use client'

import { useState } from 'react'
import type { UserMode } from '@/lib/types'

interface ModeSelectorProps {
  onComplete: (mode: UserMode) => void
}

const MODES: Array<{ value: UserMode; label: string; description: string }> = [
  {
    value: 'personal_brand',
    label: 'Grow my audience',
    description: 'Reply to trending posts, build visibility, track follower growth',
  },
  {
    value: 'b2b_outbound',
    label: 'Book meetings',
    description: 'Scrape engagers, draft DMs, track pipeline from lead to meeting',
  },
  {
    value: 'both',
    label: 'Both',
    description: 'Build your brand and generate leads simultaneously',
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-rule rounded-xl max-w-md w-full p-6">
        <h2 className="font-head text-xl font-bold text-ink mb-2">What&apos;s your goal?</h2>
        <p className="text-sm text-ink-3 mb-6">
          This helps us show you the right actions and track the right metrics. You can change this anytime in Settings.
        </p>

        <div className="space-y-3 mb-6">
          {MODES.map(mode => (
            <button
              key={mode.value}
              onClick={() => setSelected(mode.value)}
              className={`w-full text-left p-4 rounded-lg border transition-all ${
                selected === mode.value
                  ? 'border-accent bg-accent/5'
                  : 'border-rule hover:border-ink-4'
              }`}
            >
              <div className="font-medium text-ink text-sm">{mode.label}</div>
              <div className="text-xs text-ink-3 mt-1">{mode.description}</div>
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selected || saving}
          className="btn-primary w-full disabled:opacity-50"
        >
          {saving ? 'Setting up...' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
