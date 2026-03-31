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
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-xl max-w-md w-full p-6 border shadow-xl" style={{ backgroundColor: '#fff', borderColor: '#e5e7eb' }}>
        <h2 className="font-head text-xl font-bold mb-2" style={{ color: '#111' }}>What&apos;s your goal?</h2>
        <p className="text-sm mb-6" style={{ color: '#888' }}>
          This helps us show you the right actions and track the right metrics. You can change this anytime in Settings.
        </p>

        <div className="space-y-3 mb-6">
          {MODES.map(mode => (
            <button
              key={mode.value}
              onClick={() => setSelected(mode.value)}
              className="w-full text-left p-4 rounded-lg border transition-all"
              style={{
                borderColor: selected === mode.value ? '#2196F3' : '#e5e7eb',
                backgroundColor: selected === mode.value ? 'rgba(33,150,243,0.05)' : '#fff',
              }}
            >
              <div className="font-medium text-sm" style={{ color: '#111' }}>{mode.label}</div>
              <div className="text-xs mt-1" style={{ color: '#888' }}>{mode.description}</div>
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
