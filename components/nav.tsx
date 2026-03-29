'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavProps {
  icpTitles?: string[]
  userName?: string
  email?: string
  outboundBadge?: number
  inboundBadge?: number
  onEditIcp?: () => void
  onSignOut?: () => void
}

export default function Nav({ icpTitles, userName, email, outboundBadge = 0, inboundBadge = 0, onSignOut }: NavProps) {
  const path = usePathname()

  const tabs = [
    { href: '/', label: 'Feed', badge: 0, dot: true },
    { href: '/find-leads', label: 'Leads', badge: outboundBadge, dot: false },
  ]

  return (
    <header className="border-b border-rule">
      <div className="max-w-5xl mx-auto px-6">
        {/* Top bar */}
        <div className="flex items-center justify-between py-3 text-sm">
          <div className="text-ink-3">
            {userName ?? email ?? 'GTM Brain'}
            {onSignOut && (
              <button onClick={onSignOut} className="text-ink-4 hover:text-ink ml-2 text-xs">
                Sign out
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-ink-4">
              ICP: {icpTitles?.join(', ') ?? 'Not configured'}
            </div>
            <Link href="/settings" className="text-ink-4 hover:text-ink transition-colors" title="Settings">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-0" role="tablist" aria-label="Main navigation">
          {tabs.map((tab) => {
            const isActive =
              tab.href === '/' ? path === '/' : path.startsWith(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                role="tab"
                aria-selected={isActive}
                className={`
                  font-[family-name:var(--font-head)] text-sm font-semibold
                  px-5 py-3 border-b-[2.5px] transition-colors flex items-center gap-1.5
                  ${isActive
                    ? 'text-ink border-accent'
                    : 'text-ink-4 border-transparent hover:text-ink-3'
                  }
                `}
              >
                {tab.dot && <div className="w-2 h-2 rounded-full gradient-dot" />}
                {tab.label}
                {tab.badge > 0 && (
                  <span className="ml-1.5 badge-count">{tab.badge}</span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
