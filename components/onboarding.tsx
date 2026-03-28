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
  const [step, setStep] = useState<1 | 2 | 3>(initialTitles ? 2 : 1)
  const [problem, setProblem] = useState('')
  const [titles, setTitles] = useState<string[]>(initialTitles ?? [])
  const [titleInput, setTitleInput] = useState('')
  const [excludes, setExcludes] = useState<string[]>(initialExcludes ?? [])
  const [excludeInput, setExcludeInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEditing = !!initialTitles

  function addTitle(title: string) {
    const trimmed = title.trim()
    if (trimmed && !titles.includes(trimmed)) setTitles([...titles, trimmed])
    setTitleInput('')
  }

  function removeTitle(title: string) {
    setTitles(titles.filter(t => t !== title))
  }

  function addExclude(text: string) {
    const trimmed = text.trim()
    if (trimmed && !excludes.includes(trimmed)) setExcludes([...excludes, trimmed])
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
      if (!json.success) { setError(json.error ?? 'Something went wrong'); return }
      onComplete()
    } catch {
      setError('Failed to save. Check your connection.')
    } finally {
      setSaving(false)
    }
  }

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

        {/* Step indicator */}
        {!isEditing && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <div key={s} className={`w-2 h-2 rounded-full transition-colors ${
                s === step ? 'bg-accent' : s < step ? 'bg-green' : 'bg-[var(--rule)]'
              }`} />
            ))}
          </div>
        )}

        {/* Step 1: What problem do you solve? */}
        {step === 1 && (
          <>
            <h1 className="font-head text-2xl font-bold text-ink mb-2">
              What problem do you solve?
            </h1>
            <p className="text-sm text-ink-3 max-w-sm mx-auto mb-8">
              Describe what you help people with. The brain will use this to find where your buyers are already gathering.
            </p>

            <div className="text-left mb-6">
              <input
                className="input py-3 px-4 text-sm w-full"
                placeholder="e.g. Help non-technical people learn LLM for work"
                value={problem}
                onChange={e => setProblem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && problem.trim()) setStep(2) }}
                autoFocus
              />
              <div className="text-[11px] text-ink-4 mt-2">
                This helps the brain find creators who post about your topic — their engagers are your potential leads.
              </div>
            </div>

            <div className="brain-card text-left mb-6">
              <div className="section-label mb-2">How the brain finds your ICP</div>
              <div className="flex flex-col gap-3 text-xs text-ink-3 leading-relaxed">
                <div className="flex gap-3">
                  <span className="text-accent font-bold shrink-0">1.</span>
                  <span>Your ICP has a need → they search, follow, and engage with content about your topic</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-accent font-bold shrink-0">2.</span>
                  <span>Creators who post about this topic aggregate your ICP as their audience</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-accent font-bold shrink-0">3.</span>
                  <span>You watch those creators → scrape their engagers → those engagers are your leads</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-accent font-bold shrink-0">4.</span>
                  <span>A comment on a post is a stronger intent signal than any job title filter</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!problem.trim()}
              className="btn-primary px-8 py-3 text-sm"
            >
              Next — set initial ICP filter
            </button>
          </>
        )}

        {/* Step 2: ICP titles (initial filter, will be refined by data) */}
        {step === 2 && (
          <>
            <h1 className="font-head text-2xl font-bold text-ink mb-2">
              {isEditing ? 'Edit your ICP filter' : 'Start with a rough ICP filter'}
            </h1>
            <p className="text-sm text-ink-3 max-w-sm mx-auto mb-2">
              {isEditing
                ? 'Update the job titles you want to reach.'
                : 'Add job titles you think your buyers have. The brain will refine this as it learns who actually engages.'}
            </p>
            {!isEditing && (
              <p className="text-[11px] text-ink-4 max-w-sm mx-auto mb-8">
                Don&apos;t worry about getting this perfect — the brain will suggest new titles based on real engagement data.
              </p>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="font-head text-2xl font-bold text-ink mb-2">
              Exclude anyone?
            </h1>
            <p className="text-sm text-ink-3 max-w-sm mx-auto mb-8">
              Optionally filter out titles you don&apos;t want. Skip this if unsure.
            </p>
          </>
        )}
      </div>

      {/* Step 2: Target titles */}
      {step === 2 && (
        <div className="text-left">
          {titles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {titles.map(t => (
                <span key={t} className="badge badge-icp flex items-center gap-1.5 text-xs py-1.5 px-3">
                  {t}
                  <button onClick={() => removeTitle(t)} className="text-accent hover:text-accent-deep ml-0.5" aria-label={`Remove ${t}`}>×</button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 mb-2">
            <input
              className="input flex-1 py-3 px-4 text-sm"
              placeholder="Type a title and press Enter..."
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTitle(titleInput) } }}
              autoFocus
            />
            <button className="btn-accent" onClick={() => addTitle(titleInput)} disabled={!titleInput.trim()}>Add</button>
          </div>

          {availableTitles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-8">
              {availableTitles.map(t => (
                <button key={t} className="text-xs px-2.5 py-1 rounded-md border border-dashed border-rule text-ink-4 hover:border-accent hover:text-accent transition-colors"
                  onClick={() => addTitle(t)}>
                  + {t}
                </button>
              ))}
            </div>
          )}

          {/* Preview */}
          {titles.length > 0 && (
            <div className="brain-card mb-6">
              <div className="text-[11px] text-ink-4 mb-1.5 font-semibold uppercase tracking-wider">How this works</div>
              <div className="text-sm text-ink-2 leading-relaxed">
                When you scrape a post, we filter engagers to people with titles like{' '}
                <strong className="text-accent">{titles.slice(0, 3).join(', ')}</strong>
                {titles.length > 3 && ` +${titles.length - 3} more`}.
                The brain will suggest adding or removing titles as it learns who actually responds to your DMs.
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {!isEditing && (
              <button onClick={() => setStep(1)} className="btn-outline px-6 py-3 text-sm">Back</button>
            )}
            <button onClick={() => isEditing ? handleSubmit() : setStep(3)} disabled={titles.length === 0}
              className="btn-primary flex-1 py-3 text-sm">
              {isEditing
                ? (saving ? 'Saving...' : `Save ${titles.length} title${titles.length === 1 ? '' : 's'}`)
                : 'Next — exclusions'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Exclusions */}
      {step === 3 && (
        <div className="text-left">
          {excludes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {excludes.map(t => (
                <span key={t} className="badge badge-drafted flex items-center gap-1.5 text-xs py-1.5 px-3">
                  {t}
                  <button onClick={() => removeExclude(t)} className="text-ink-3 hover:text-ink ml-0.5" aria-label={`Remove ${t}`}>×</button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 mb-2">
            <input
              className="input flex-1 py-3 px-4 text-sm"
              placeholder="Type a title to exclude..."
              value={excludeInput}
              onChange={e => setExcludeInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExclude(excludeInput) } }}
              autoFocus
            />
            <button className="btn-outline" onClick={() => addExclude(excludeInput)} disabled={!excludeInput.trim()}>Add</button>
          </div>

          {availableExcludes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-8">
              {availableExcludes.map(t => (
                <button key={t} className="text-xs px-2.5 py-1 rounded-md border border-dashed border-rule text-ink-4 hover:border-accent hover:text-accent transition-colors"
                  onClick={() => addExclude(t)}>
                  + {t}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="text-sm text-[var(--accent-orange)] mb-4" role="alert">{error}</div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="btn-outline px-6 py-3 text-sm">Back</button>
            <button onClick={handleSubmit} disabled={saving || titles.length === 0}
              className="btn-primary flex-1 py-3 text-sm">
              {saving ? 'Setting up...' : `Start with ${titles.length} title${titles.length === 1 ? '' : 's'}`}
            </button>
          </div>

          <p className="text-center text-xs text-ink-4 mt-4">
            The brain refines your ICP over time. You can always edit these later.
          </p>
        </div>
      )}
    </div>
  )
}
