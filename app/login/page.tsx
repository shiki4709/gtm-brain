'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAuthClientBrowser } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return

    setLoading(true)
    setError('')

    const supabase = createAuthClientBrowser()

    if (mode === 'signup') {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: undefined, // Skip confirmation email
          data: { name: email.split('@')[0] },
        },
      })
      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }
      // Auto sign in after sign up
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        if (signInError.message.includes('Invalid login')) {
          setError('Wrong email or password. Need an account? Click "Create account" below.')
        } else {
          setError(signInError.message)
        }
        setLoading(false)
        return
      }
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-gradient)' }}>
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-2.5 h-2.5 rounded-full gradient-dot" />
            <span className="font-head text-lg font-bold text-ink">GTM Brain</span>
          </div>
          <h1 className="font-head text-2xl font-bold text-ink mb-2">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="text-sm text-ink-3">
            {mode === 'signin'
              ? 'Sign in to your GTM Brain account.'
              : 'Create your account to get started.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-rule rounded-[var(--radius)] p-6">
          <div className="mb-4">
            <label className="section-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="input py-3 px-4 text-sm"
              required
              autoFocus
            />
          </div>
          <div className="mb-6">
            <label className="section-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="input py-3 px-4 text-sm"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="text-xs text-[var(--accent-orange)] mb-4" role="alert">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="btn-primary w-full py-3 text-sm"
          >
            {loading ? 'Loading...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="text-center mt-4">
          {mode === 'signin' ? (
            <button
              onClick={() => { setMode('signup'); setError('') }}
              className="text-xs text-accent hover:underline"
            >
              Don&apos;t have an account? Create one
            </button>
          ) : (
            <button
              onClick={() => { setMode('signin'); setError('') }}
              className="text-xs text-accent hover:underline"
            >
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
