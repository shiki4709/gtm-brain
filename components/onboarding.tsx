'use client'

import { useState } from 'react'

interface OnboardingProps {
  onComplete: () => void
  initialTitles?: string[]
  initialExcludes?: string[]
}

const SUGGESTED_TITLES = [
  'VP Sales',
  'Head of Growth',
  'CRO',
  'VP Marketing',
  'Head of GTM',
  'Director of Sales',
  'CMO',
  'Head of Revenue',
]

const SUGGESTED_EXCLUDES = [
  'Intern',
  'Student',
  'Freelance',
  'Retired',
]

export default function Onboarding({ onComplete, initialTitles, initialExcludes }: OnboardingProps) {
  const [titles, setTitles] = useState<string[]>(initialTitles ?? [])
  const [titleInput, setTitleInput] = useState('')
  const [excludes, setExcludes] = useState<string[]>(initialExcludes ?? [])
  const [excludeInput, setExcludeInput] = useState('')
  const isEditing = !!initialTitles
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addTitle(title: string) {
    const trimmed = title.trim()
    if (trimmed && !titles.includes(trimmed)) {
      setTitles([...titles, trimmed])
    }
    setTitleInput('')
  }

  function removeTitle(title: string) {
    setTitles(titles.filter(t => t !== title))
  }

  function addExclude(text: string) {
    const trimmed = text.trim()
    if (trimmed && !excludes.includes(trimmed)) {
      setExcludes([...excludes, trimmed])
    }
    setExcludeInput('')
  }

  function removeExclude(text: string) {
    setExcludes(excludes.filter(t => t !== text))
  }

  async function handleSubmit() {
    if (titles.length === 0) {
      setError('Add at least one target title')
      return
    }

    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icp_titles: titles, icp_exclude: excludes }),
      })

      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? 'Something went wrong')
        return
      }

      onComplete()
    } catch {
      setError('Failed to save. Check your connection.')
    } finally {
      setSaving(false)
    }
  }

  // Filter out already-selected suggestions
  const availableTitles = SUGGESTED_TITLES.filter(t => !titles.includes(t))
  const availableExcludes = SUGGESTED_EXCLUDES.filter(t => !excludes.includes(t))

  return (
    <div className="max-w-lg mx-auto py-16">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-2.5 h-2.5 rounded-full gradient-dot" />
          <span className="font-head text-xs font-semibold text-ink-4 uppercase tracking-wider">
            GTM Brain
          </span>
        </div>
        <h1 className="font-head text-2xl font-bold text-ink mb-2">
          Who are you selling to?
        </h1>
        <p className="text-sm text-ink-3 max-w-sm mx-auto">
          Add the job titles of people you want to reach. We&apos;ll use this to filter leads from every scrape and target your DMs.
        </p>
      </div>

      {/* Target titles */}
      <div className="mb-6">
        <label className="section-label" htmlFor="icp-titles">
          Target titles
        </label>

        {/* Selected titles */}
        {titles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {titles.map(t => (
              <span key={t} className="badge badge-icp flex items-center gap-1.5 text-xs py-1.5 px-3">
                {t}
                <button
                  onClick={() => removeTitle(t)}
                  className="text-accent hover:text-accent-deep ml-0.5"
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-2">
          <input
            id="icp-titles"
            className="input flex-1"
            placeholder="Type a title and press Enter..."
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTitle(titleInput)
              }
            }}
          />
          <button
            className="btn-accent"
            onClick={() => addTitle(titleInput)}
            disabled={!titleInput.trim()}
          >
            Add
          </button>
        </div>

        {/* Suggestions */}
        {availableTitles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {availableTitles.map(t => (
              <button
                key={t}
                className="text-xs px-2.5 py-1 rounded-md border border-dashed border-rule text-ink-4 hover:border-accent hover:text-accent transition-colors"
                onClick={() => addTitle(t)}
              >
                + {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Exclusions */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <label className="section-label mb-0" htmlFor="icp-exclude">
            Exclude
          </label>
          <span className="text-[10px] text-ink-4">(optional — filter out titles you don&apos;t want)</span>
        </div>

        {/* Selected excludes */}
        {excludes.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {excludes.map(t => (
              <span key={t} className="badge badge-drafted flex items-center gap-1.5 text-xs py-1.5 px-3">
                {t}
                <button
                  onClick={() => removeExclude(t)}
                  className="text-ink-3 hover:text-ink ml-0.5"
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-2">
          <input
            id="icp-exclude"
            className="input flex-1"
            placeholder="Type a title to exclude..."
            value={excludeInput}
            onChange={e => setExcludeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addExclude(excludeInput)
              }
            }}
          />
          <button
            className="btn-outline"
            onClick={() => addExclude(excludeInput)}
            disabled={!excludeInput.trim()}
          >
            Add
          </button>
        </div>

        {availableExcludes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {availableExcludes.map(t => (
              <button
                key={t}
                className="text-xs px-2.5 py-1 rounded-md border border-dashed border-rule text-ink-4 hover:border-accent hover:text-accent transition-colors"
                onClick={() => addExclude(t)}
              >
                + {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      {titles.length > 0 && (
        <div className="brain-card mb-6">
          <div className="text-[11px] text-ink-4 mb-1.5 font-semibold uppercase tracking-wider">How this works</div>
          <div className="text-sm text-ink-2 leading-relaxed">
            When you scrape a LinkedIn post, we&apos;ll filter engagers to people with titles like{' '}
            <strong className="text-accent">{titles.slice(0, 3).join(', ')}</strong>
            {titles.length > 3 && ` +${titles.length - 3} more`}.
            {excludes.length > 0 && (
              <> We&apos;ll skip anyone matching <strong className="text-orange">{excludes.join(', ')}</strong>.</>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-[var(--accent-orange)] mb-4" role="alert">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        className="btn-primary w-full py-3 text-sm"
        onClick={handleSubmit}
        disabled={saving || titles.length === 0}
      >
        {saving ? 'Saving...' : isEditing ? `Save ${titles.length} target title${titles.length === 1 ? '' : 's'}` : `Start with ${titles.length} target title${titles.length === 1 ? '' : 's'}`}
      </button>

      <p className="text-center text-xs text-ink-4 mt-4">
        You can edit your ICP and add more titles anytime.
      </p>
    </div>
  )
}
