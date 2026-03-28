'use client'

import { useState } from 'react'
import { createAuthClientBrowser } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError('')

    const supabase = createAuthClientBrowser()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) {
      setError(authError.message)
    } else {
      setSent(true)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-gradient)' }}>
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full gradient-dot" />
            <span className="font-head text-lg font-bold text-ink">GTM Brain</span>
          </div>
          <h1 className="font-head text-2xl font-bold text-ink mb-2">Sign in</h1>
          <p className="text-sm text-ink-3">
            Enter your email to get a magic link — no password needed.
          </p>
        </div>

        {sent ? (
          <div className="bg-white border border-rule rounded-[var(--radius)] p-6 text-center">
            <div className="text-2xl mb-3">✉</div>
            <div className="font-head text-sm font-semibold text-ink mb-1">Check your email</div>
            <div className="text-xs text-ink-3 mb-4">
              We sent a magic link to <strong>{email}</strong>. Click the link to sign in.
            </div>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="text-xs text-accent hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex gap-3 mb-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="input flex-1 py-3 px-4 text-sm"
                required
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="btn-primary px-6 py-3"
              >
                {loading ? 'Sending...' : 'Sign in'}
              </button>
            </div>
            {error && (
              <div className="text-xs text-[var(--accent-orange)]" role="alert">{error}</div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
