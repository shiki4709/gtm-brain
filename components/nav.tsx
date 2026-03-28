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

export default function Nav({ icpTitles, userName, email, outboundBadge = 0, inboundBadge = 0, onEditIcp, onSignOut }: NavProps) {
  const path = usePathname()

  const tabs = [
    { href: '/', label: 'Overview', badge: 0 },
    { href: '/outbound', label: 'Outbound', badge: outboundBadge },
    { href: '/inbound', label: 'Inbound', badge: inboundBadge },
    { href: '/settings', label: 'Settings', badge: 0 },
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
          <div className="text-xs text-ink-4">
            ICP: {icpTitles?.join(', ') ?? 'Not configured'}
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
                  px-5 py-3 border-b-[2.5px] transition-colors
                  ${isActive
                    ? 'text-ink border-accent'
                    : 'text-ink-4 border-transparent hover:text-ink-3'
                  }
                `}
              >
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
