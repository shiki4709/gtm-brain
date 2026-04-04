'use client'

import { useState, useEffect } from 'react'

interface TrendingTopic {
  topic: string
  totalEngagement: number
  signalScore: number
  samplePosts: Array<{ author: string; text: string; engagement: number; url: string }>
}

interface OpinionCaptureProps {
  hotTopics: TrendingTopic[]
}

export default function OpinionCapture({ hotTopics }: OpinionCaptureProps) {
  const [question, setQuestion] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [opinion, setOpinion] = useState('')
  const [explainer, setExplainer] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState<TrendingTopic | null>(null)

  // Check if already shown today
  const today = new Date().toISOString().slice(0, 10)
  const storageKey = `gtm-brain-take-${today}`

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(storageKey)) {
      setSkipped(true)
      setLoading(false)
      return
    }

    // Pick the top topic
    const top = hotTopics[0]
    if (!top) {
      setLoading(false)
      return
    }
    setTopic(top)

    // Check cache first
    const cacheKey = `gtm-brain-take-q-${today}`
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.topic === top.topic && parsed.question) {
          setQuestion(parsed.question)
          setKeywords(parsed.keywords ?? [])
          setLoading(false)
          return
        }
      }
    } catch { /* */ }

    // Generate question via API
    const sample = top.samplePosts[0]?.text ?? ''
    fetch(`/api/opinion?topic=${encodeURIComponent(top.topic)}&sample=${encodeURIComponent(sample)}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.question) {
          setQuestion(json.question)
          setKeywords(json.keywords ?? [])
          try { localStorage.setItem(cacheKey, JSON.stringify({ topic: top.topic, question: json.question, keywords: json.keywords })) } catch { /* */ }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotTopics.length])

  async function handleExplain() {
    if (!topic) return
    setExplaining(true)
    try {
      const sample = topic.samplePosts[0]?.text ?? ''
      const res = await fetch(`/api/opinion?topic=${encodeURIComponent(topic.topic)}&sample=${encodeURIComponent(sample)}&explain=true`)
      const json = await res.json()
      if (json.success && json.explainer) {
        setExplainer(json.explainer)
      }
    } catch { /* */ }
    finally { setExplaining(false) }
  }

  async function handleSave() {
    if (!topic || !opinion.trim()) return
    setSaving(true)
    try {
      await fetch('/api/opinion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.topic,
          opinion: opinion.trim(),
          question,
          keywords,
        }),
      })
      setDone(true)
      localStorage.setItem(storageKey, 'done')
    } catch { /* */ }
    finally { setSaving(false) }
  }

  function handleSkip() {
    setSkipped(true)
    localStorage.setItem(storageKey, 'skipped')
  }

  if (skipped) return null

  // Show skeleton while loading topics/question
  if (loading || (topic && !question)) {
    return (
      <div className="card p-4 mb-4">
        <div className="skeleton skeleton-text w-1/3 mb-3" />
        <div className="skeleton skeleton-text w-full mb-2" />
        <div className="skeleton skeleton-text w-2/3 mb-3" />
        <div className="skeleton" style={{ height: 56 }} />
      </div>
    )
  }

  if (!topic || !question) return null

  if (done) {
    return (
      <div className="card p-4 mb-4 bg-[var(--green-tint)] text-center">
        <div className="text-xs text-green font-semibold">Saved your take on &ldquo;{topic.topic}&rdquo;</div>
      </div>
    )
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="section-label">What&apos;s your take?</h2>
        <button onClick={handleSkip} className="text-[11px] text-ink-4 hover:text-ink">
          Skip
        </button>
      </div>

      <div className="text-sm text-ink-2 mb-3">{question}</div>

      {explainer && (
        <div className="bg-[var(--bg-warm)] rounded-[var(--radius-sm)] px-3 py-2 mb-3 text-xs text-ink-3">
          {explainer}
        </div>
      )}

      <textarea
        value={opinion}
        onChange={e => setOpinion(e.target.value)}
        placeholder="I think..."
        className="input text-sm mb-3"
        rows={2}
      />

      <div className="flex items-center justify-between">
        <button
          onClick={handleExplain}
          disabled={explaining || !!explainer}
          className="text-[11px] text-accent hover:underline disabled:opacity-50"
        >
          {explaining ? 'Loading...' : explainer ? 'Context shown above' : 'What is this?'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !opinion.trim()}
          className="btn-primary text-xs"
        >
          {saving ? 'Saving...' : 'Save take'}
        </button>
      </div>
    </div>
  )
}
