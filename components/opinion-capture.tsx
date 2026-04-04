'use client'

import { useState, useEffect } from 'react'

interface TrendingTopic {
  topic: string
  totalEngagement: number
  signalScore: number
  samplePosts: Array<{ author: string; text: string; engagement: number; url: string }>
}

interface QuestionItem {
  topic: string
  question: string
  keywords: string[]
}

interface OpinionCaptureProps {
  hotTopics: TrendingTopic[]
}

export default function OpinionCapture({ hotTopics }: OpinionCaptureProps) {
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [explainer, setExplainer] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().slice(0, 10)
  const storageKey = `gtm-brain-takes-${today}`
  const cacheKey = `gtm-brain-takes-q-${today}`

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(storageKey)) {
      setDismissed(true)
      setLoading(false)
      return
    }
    if (hotTopics.length === 0) {
      setLoading(false)
      return
    }

    // Check cache
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached) as QuestionItem[]
        if (parsed.length > 0) {
          setQuestions(parsed)
          setLoading(false)
          return
        }
      }
    } catch { /* */ }

    // Generate batch questions
    const topicsPayload = hotTopics.slice(0, 8).map(t => ({
      topic: t.topic,
      sample: t.samplePosts[0]?.text ?? '',
    }))

    fetch(`/api/opinion?topics=${encodeURIComponent(JSON.stringify(topicsPayload))}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.questions?.length > 0) {
          setQuestions(json.questions)
          try { localStorage.setItem(cacheKey, JSON.stringify(json.questions)) } catch { /* */ }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotTopics.length])

  const q = questions[current]
  const totalQ = questions.length
  const answeredCount = Object.keys(answers).length

  async function handleExplain() {
    if (!q) return
    setExplaining(true)
    setExplainer(null)
    try {
      const topic = hotTopics.find(t => t.topic === q.topic)
      const sample = topic?.samplePosts[0]?.text ?? ''
      const res = await fetch(`/api/opinion?explain=true&topic=${encodeURIComponent(q.topic)}&sample=${encodeURIComponent(sample)}`)
      const json = await res.json()
      if (json.success && json.explainer) setExplainer(json.explainer)
    } catch { /* */ }
    finally { setExplaining(false) }
  }

  function handleNext() {
    setExplainer(null)
    if (current < totalQ - 1) {
      setCurrent(current + 1)
    } else {
      handleFinish()
    }
  }

  function handleAnswer() {
    const text = answers[current]?.trim()
    if (!text) return
    // Move to next
    handleNext()
  }

  async function handleFinish() {
    const takes = Object.entries(answers)
      .filter(([, v]) => v.trim())
      .map(([idx, opinion]) => {
        const qItem = questions[Number(idx)]
        return { topic: qItem.topic, opinion: opinion.trim(), question: qItem.question, keywords: qItem.keywords }
      })

    if (takes.length > 0) {
      setSaving(true)
      try {
        await fetch('/api/opinion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ takes }),
        })
      } catch { /* */ }
      finally { setSaving(false) }
    }

    setDone(true)
    localStorage.setItem(storageKey, 'done')
  }

  if (dismissed) return null

  if (loading) {
    return (
      <div className="card p-4 mb-4">
        <div className="skeleton skeleton-text w-1/3 mb-3" />
        <div className="skeleton skeleton-text w-full mb-2" />
        <div className="skeleton skeleton-text w-2/3 mb-3" />
        <div className="skeleton" style={{ height: 56 }} />
      </div>
    )
  }

  if (questions.length === 0) return null

  if (done) {
    return (
      <div className="card p-4 mb-4 bg-[var(--green-tint)] text-center">
        <div className="text-xs text-green font-semibold">
          {answeredCount > 0
            ? `Saved ${answeredCount} take${answeredCount > 1 ? 's' : ''} — your content will sound more like you now`
            : 'All done for today'}
        </div>
      </div>
    )
  }

  if (!q) return null

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="section-label">Hot takes</h2>
          <span className="text-[10px] text-ink-4">{current + 1}/{totalQ}</span>
        </div>
        <button onClick={handleFinish} className="text-[11px] text-ink-4 hover:text-ink">
          {answeredCount > 0 ? `Done (${answeredCount} saved)` : 'Skip all'}
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1 mb-3">
        {questions.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{
              backgroundColor: i < current ? (answers[i] ? 'var(--green)' : 'var(--rule)') :
                i === current ? 'var(--blue-bright)' : 'var(--rule-light)',
            }}
          />
        ))}
      </div>

      <div className="text-sm text-ink-2 mb-3">{q.question}</div>

      {explainer && (
        <div className="bg-[var(--bg-warm)] rounded-[var(--radius-sm)] px-3 py-2 mb-3 text-xs text-ink-3">
          {explainer}
        </div>
      )}

      <textarea
        value={answers[current] ?? ''}
        onChange={e => setAnswers({ ...answers, [current]: e.target.value })}
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
          {explaining ? 'Loading...' : explainer ? 'Context above' : 'What is this?'}
        </button>
        <div className="flex gap-2">
          <button onClick={handleNext} className="btn-outline text-xs">
            Skip
          </button>
          <button
            onClick={handleAnswer}
            disabled={saving || !(answers[current]?.trim())}
            className="btn-primary text-xs"
          >
            {saving ? 'Saving...' : current < totalQ - 1 ? 'Next' : 'Finish'}
          </button>
        </div>
      </div>
    </div>
  )
}
