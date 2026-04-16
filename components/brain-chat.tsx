'use client'

import { useState, useEffect, useRef } from 'react'

interface TrendingTopic {
  topic: string
  totalEngagement: number
  signalScore: number
  samplePosts: Array<{ author: string; text: string; engagement: number; url: string }>
}

interface BriefPatterns {
  mostActiveDay: string
  avgActionsPerDay: number
  notificationActRate: number
  topAction: string
  trend: string
}

interface QuestionItem {
  topic: string
  question: string
  keywords: string[]
}

interface ChatMessage {
  role: 'brain' | 'user'
  text: string
  type?: 'greeting' | 'briefing' | 'question' | 'answer' | 'done' | 'explainer'
}

interface BrainChatProps {
  hotTopics: TrendingTopic[]
  briefPatterns: BriefPatterns | null
  briefLines: string[]
  userName: string
}

export default function BrainChat({ hotTopics, briefPatterns, briefLines, userName }: BrainChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<'greeting' | 'briefing' | 'questions' | 'done'>('greeting')
  const [loading, setLoading] = useState(true)
  const [explaining, setExplaining] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const today = new Date().toISOString().slice(0, 10)
  const storageKey = `gtm-brain-chat-${today}`
  const cacheKey = `gtm-brain-chat-q-${today}`

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Build greeting + briefing on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check if already completed today
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setMessages(parsed.messages ?? [])
        setPhase('done')
        setExpanded(false)
      } catch { /* */ }
      setLoading(false)
      return
    }

    const name = userName?.split(' ')[0] || userName || 'there'
    const hour = new Date().getHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

    const msgs: ChatMessage[] = []

    // Greeting
    msgs.push({
      role: 'brain',
      text: `${greeting}, ${name}! Let's get your GTM rolling today.`,
      type: 'greeting',
    })

    // Briefing based on available data
    if (briefPatterns) {
      const lines: string[] = []
      if (briefPatterns.trend === 'increasing') {
        lines.push(`Your engagement is trending up, averaging ${briefPatterns.avgActionsPerDay} actions/day.`)
      } else {
        lines.push(`You're averaging ${briefPatterns.avgActionsPerDay} actions/day. Let's push that higher.`)
      }
      if (briefPatterns.topAction) {
        lines.push(`Your strongest move is ${briefPatterns.topAction}s. Keep leaning into that.`)
      }
      if (briefPatterns.mostActiveDay) {
        lines.push(`Peak day: ${briefPatterns.mostActiveDay}.`)
      }
      msgs.push({ role: 'brain', text: lines.join(' '), type: 'briefing' })

      if (briefLines.length > 0) {
        msgs.push({ role: 'brain', text: briefLines.map(l => `• ${l}`).join('\n'), type: 'briefing' })
      }
    }

    setMessages(msgs)
    setPhase('briefing')

    // Load questions
    const loadQuestions = async () => {
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

      if (hotTopics.length === 0) {
        setLoading(false)
        return
      }

      const topicsPayload = hotTopics.slice(0, 8).map(t => ({
        topic: t.topic,
        sample: t.samplePosts[0]?.text ?? '',
      }))

      try {
        const res = await fetch(`/api/opinion?topics=${encodeURIComponent(JSON.stringify(topicsPayload))}`)
        const json = await res.json()
        if (json.success && json.questions?.length > 0) {
          setQuestions(json.questions)
          try { localStorage.setItem(cacheKey, JSON.stringify(json.questions)) } catch { /* */ }
        }
      } catch { /* */ }
      finally { setLoading(false) }
    }

    loadQuestions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotTopics.length, userName])

  // Transition to questions after briefing is shown
  useEffect(() => {
    if (phase === 'briefing' && !loading && questions.length > 0) {
      const timer = setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'brain',
          text: `I spotted ${questions.length} trending topics your audience cares about. Quick takes?`,
          type: 'question',
        }, {
          role: 'brain',
          text: questions[0].question,
          type: 'question',
        }])
        setPhase('questions')
      }, 800)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, loading, questions.length])

  async function handleExplain() {
    const q = questions[currentQ]
    if (!q) return
    setExplaining(true)
    try {
      const topic = hotTopics.find(t => t.topic === q.topic)
      const sample = topic?.samplePosts[0]?.text ?? ''
      const res = await fetch(`/api/opinion?explain=true&topic=${encodeURIComponent(q.topic)}&sample=${encodeURIComponent(sample)}`)
      const json = await res.json()
      if (json.success && json.explainer) {
        setMessages(prev => [...prev, { role: 'brain', text: json.explainer, type: 'explainer' }])
      }
    } catch { /* */ }
    finally { setExplaining(false) }
  }

  function classifyMessage(text: string): 'explain' | 'take' | 'casual' | 'question' {
    const lower = text.toLowerCase().trim()

    // Explain requests
    const explainPhrases = ['what do you mean', 'what is this', 'explain', 'i don\'t understand', 'idk', 'not sure what', 'can you explain', 'huh']
    if (explainPhrases.some(p => lower.includes(p))) return 'explain'

    // Questions — ends with ? or starts with question words
    if (lower.endsWith('?') || /^(what|why|how|when|where|who|is it|does|do |can |could |should |would )/.test(lower)) return 'question'

    // Casual / filler — short non-substantive replies
    const casualPatterns = [
      /^(ok|okay|k|sure|yep|yea|yeah|yes|no|nah|nope|cool|nice|true|right|exactly|totally|fair|agreed|lol|haha|hmm|ah|oh|ooh|wow|damn|got it|makes sense|i see|for sure|100|bet|facts|word|same|real|fr|tbh)\.?$/,
      /^(thanks|thank you|thx|ty)\.?$/,
      /^(interesting|that's interesting|good to know|noted)\.?$/,
    ]
    if (lower.length < 30 && casualPatterns.some(p => p.test(lower))) return 'casual'

    // Everything else with substance is a take
    return 'take'
  }

  function handleSubmit() {
    const text = input.trim()
    if (!text) return

    const msgType = classifyMessage(text)

    // Explain requests
    if (msgType === 'explain') {
      setMessages(prev => [...prev, { role: 'user', text, type: 'answer' }])
      setInput('')
      handleExplain()
      return
    }

    // Questions — acknowledge and re-ask, don't save as take
    if (msgType === 'question') {
      setMessages(prev => [...prev, { role: 'user', text, type: 'answer' }])
      setInput('')
      const responses = [
        'Good question. I\'m really looking for your opinion though.',
        'That\'s worth exploring. But what\'s your gut feeling on this?',
        'Fair question. What do you think, even if you\'re not sure?',
      ]
      setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'brain',
          text: responses[Math.floor(Math.random() * responses.length)],
          type: 'briefing',
        }])
      }, 300)
      return
    }

    // Casual / filler — acknowledge and move on without saving
    if (msgType === 'casual') {
      setMessages(prev => [...prev, { role: 'user', text, type: 'answer' }])
      setInput('')

      const nextQ = currentQ + 1
      if (nextQ < questions.length) {
        setCurrentQ(nextQ)
        setTimeout(() => {
          setMessages(prev => [...prev,
            { role: 'brain', text: 'No worries. Next one:', type: 'briefing' },
          ])
          setTimeout(() => {
            setMessages(prev => [...prev,
              { role: 'brain', text: questions[nextQ].question, type: 'question' },
            ])
          }, 400)
        }, 300)
      } else {
        setTimeout(() => finishChat(), 300)
      }
      return
    }

    // Real take — save it
    setMessages(prev => [...prev, { role: 'user', text, type: 'answer' }])
    setInput('')

    const acks = ['Got it.', 'Sharp take.', 'Noted.', 'Good point.', 'Saved.']
    const ack = acks[Math.floor(Math.random() * acks.length)]

    const nextQ = currentQ + 1
    if (nextQ < questions.length) {
      setCurrentQ(nextQ)
      setTimeout(() => {
        setMessages(prev => [...prev,
          { role: 'brain', text: ack, type: 'briefing' },
        ])
        setTimeout(() => {
          setMessages(prev => [...prev,
            { role: 'brain', text: questions[nextQ].question, type: 'question' },
          ])
        }, 400)
      }, 300)
    } else {
      setTimeout(() => finishChat(), 300)
    }
  }

  function handleSkipQuestion() {
    const nextQ = currentQ + 1
    setMessages(prev => [...prev, { role: 'user', text: '(skipped)', type: 'answer' }])
    if (nextQ < questions.length) {
      setCurrentQ(nextQ)
      setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'brain',
          text: questions[nextQ].question,
          type: 'question',
        }])
      }, 300)
    } else {
      finishChat()
    }
  }

  async function finishChat() {
    // Collect only substantive takes — skip casual replies, questions, and skipped messages
    const takes: Array<{ topic: string; opinion: string; question: string; keywords: string[] }> = []
    let qIdx = 0
    for (const msg of messages) {
      if (msg.type === 'question' && msg.role === 'brain' && questions[qIdx]?.question === msg.text) {
        // Next user message should be the answer
      } else if (msg.type === 'answer' && msg.role === 'user' && msg.text !== '(skipped)') {
        const kind = classifyMessage(msg.text)
        if (kind === 'take' && questions[qIdx]) {
          takes.push({
            topic: questions[qIdx].topic,
            opinion: msg.text,
            question: questions[qIdx].question,
            keywords: questions[qIdx].keywords,
          })
        }
        qIdx++
      } else if (msg.type === 'answer' && msg.text === '(skipped)') {
        qIdx++
      }
    }
    // Also check current input if last answer
    if (input.trim() && questions[currentQ] && classifyMessage(input.trim()) === 'take') {
      takes.push({
        topic: questions[currentQ].topic,
        opinion: input.trim(),
        question: questions[currentQ].question,
        keywords: questions[currentQ].keywords,
      })
    }

    if (takes.length > 0) {
      try {
        await fetch('/api/opinion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ takes }),
        })
      } catch { /* */ }
    }

    const doneMsg = takes.length > 0
      ? `Saved ${takes.length} take${takes.length > 1 ? 's' : ''}. I'll use these to make your replies and posts sound more like you.`
      : 'No worries. I\'ll check in again tomorrow with fresh topics.'

    setMessages(prev => [...prev, { role: 'brain', text: doneMsg, type: 'done' }])
    setPhase('done')
    localStorage.setItem(storageKey, JSON.stringify({ messages: [...messages, { role: 'brain', text: doneMsg, type: 'done' }], date: today }))
  }

  if (dismissed) return null
  if (messages.length === 0 && loading) {
    return (
      <div className="card p-4 mb-4">
        <div className="skeleton skeleton-text w-2/3 mb-2" />
        <div className="skeleton skeleton-text w-full mb-2" />
        <div className="skeleton skeleton-text w-1/2" />
      </div>
    )
  }
  if (messages.length === 0) return null

  return (
    <div className="card mb-4 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-warm)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full gradient-dot" />
          <span className="section-label">Brain</span>
          {phase === 'questions' && (
            <span className="text-[10px] text-ink-4">{currentQ + 1}/{questions.length} topics</span>
          )}
        </div>
        <span className="text-[10px] text-ink-4">{expanded ? 'collapse' : 'expand'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Messages */}
          <div className="space-y-2 max-h-[320px] overflow-y-auto mb-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed max-w-[85%] whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-accent text-on-accent'
                    : msg.type === 'explainer'
                      ? 'bg-[var(--bg-warm)] text-ink-3'
                      : msg.type === 'done'
                        ? 'bg-[var(--green-tint)] text-ink-2'
                        : 'bg-[var(--rule-light)] text-ink-2'
                }`}>
                  {msg.text === '(skipped)' ? <span className="text-ink-4 italic">skipped</span> : msg.text}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input area — only during questions phase */}
          {phase === 'questions' && (
            <div>
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                  placeholder="Your take..."
                  className="input text-sm flex-1"
                  autoFocus
                />
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="btn-primary text-xs shrink-0"
                >
                  Send
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <button
                  onClick={handleExplain}
                  disabled={explaining}
                  className="text-[11px] text-accent hover:underline disabled:opacity-50"
                >
                  {explaining ? 'Loading...' : 'Explain this topic'}
                </button>
                <div className="flex gap-2">
                  <button onClick={handleSkipQuestion} className="text-[11px] text-ink-4 hover:text-ink">
                    Skip
                  </button>
                  <button onClick={finishChat} className="text-[11px] text-ink-4 hover:text-ink">
                    Done for today
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Collapsed done state */}
          {phase === 'done' && (
            <button
              onClick={() => setDismissed(true)}
              className="text-[11px] text-ink-4 hover:text-ink"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  )
}
