'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavProps {
  icpTitles?: string[]
  userName?: string
  email?: string
  outboundBadge?: number
  inboundBadge?: number
  mode?: string
  onEditIcp?: () => void
  onSignOut?: () => void
}

export default function Nav({ userName, email, outboundBadge = 0, mode, onSignOut }: NavProps) {
  const path = usePathname()
  const isHome = path === '/' || path === ''
  const isOnPipeline = path === '/find-leads'
  const isOnSettings = path === '/settings'
  const isOnMyContent = path === '/my-content'

  return (
    <header className="bg-surface border-b border-rule">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo + navigation */}
          <div className="flex items-center gap-1">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-2 shrink-0 mr-4">
              <div className="w-2.5 h-2.5 rounded-full gradient-dot" />
              <span className="font-head text-sm font-bold text-ink">GTM Brain</span>
            </Link>

            {/* Primary nav links */}
            <nav className="flex items-center gap-1" role="navigation" aria-label="Main">
              <Link
                href="/"
                className={`font-head text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                  isHome ? 'text-ink bg-[var(--blue-tint)]' : 'text-ink-4 hover:text-ink-3 hover:bg-[var(--rule-light)]'
                }`}
              >
                Home
              </Link>
              <Link
                href="/my-content"
                className={`font-head text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                  isOnMyContent ? 'text-ink bg-[var(--blue-tint)]' : 'text-ink-4 hover:text-ink-3 hover:bg-[var(--rule-light)]'
                }`}
              >
                My Content
              </Link>
              {mode === 'b2b_outbound' && (
                <Link
                  href="/find-leads"
                  className={`font-head text-xs font-semibold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                    isOnPipeline ? 'text-ink bg-[var(--blue-tint)]' : 'text-ink-4 hover:text-ink-3 hover:bg-[var(--rule-light)]'
                  }`}
                >
                  Pipeline
                  {outboundBadge > 0 && (
                    <span className="badge-count text-[10px]">{outboundBadge}</span>
                  )}
                </Link>
              )}
            </nav>
          </div>

          {/* Right: Account */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-4 hidden sm:block">{userName ?? email}</span>
            <span className="text-rule hidden sm:block">|</span>
            <Link
              href="/settings"
              className={`p-2 rounded-md transition-colors ${
                isOnSettings ? 'text-ink bg-[var(--blue-tint)]' : 'text-ink-4 hover:text-ink hover:bg-[var(--rule-light)]'
              }`}
              title="Settings"
              aria-label="Settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
            {onSignOut && (
              <button onClick={onSignOut} className="text-ink-4 hover:text-ink text-xs hidden sm:block py-2 px-2">
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
