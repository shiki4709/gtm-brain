'use client'

import { useEffect, useState } from 'react'
import Onboarding from './onboarding'
import Nav from './nav'
import type { SbUser } from '@/lib/types'

interface AppShellProps {
  children: React.ReactNode
}

interface BadgeCounts {
  outbound: number
  inbound: number
}

export default function AppShell({ children }: AppShellProps) {
  const [user, setUser] = useState<SbUser | null>(null)
  const [badges, setBadges] = useState<BadgeCounts>({ outbound: 0, inbound: 0 })
  const [loading, setLoading] = useState(true)
  const [editingIcp, setEditingIcp] = useState(false)

  async function fetchUser() {
    try {
      const res = await fetch('/api/user')
      const json = await res.json()
      if (json.success && json.data) {
        setUser(json.data as SbUser)
      }
    } catch {
      // No user yet — show onboarding
    } finally {
      setLoading(false)
    }
  }

  async function fetchBadges() {
    try {
      const res = await fetch('/api/pipeline')
      const json = await res.json()
      if (json.success) {
        const p = json.data
        const newIcp = (p.icp ?? 0) - (p.dm_drafted ?? 0)
        setBadges({
          outbound: Math.max(0, newIcp),
          inbound: 0,
        })
      }
    } catch {
      // Silently fail
    }
  }

  useEffect(() => {
    fetchUser()
  }, [])

  useEffect(() => {
    if (user) fetchBadges()
  }, [user])

  const isOnboarded = user
    && Array.isArray(user.icp_config?.titles)
    && user.icp_config.titles.length > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-sm text-ink-4">Loading...</div>
      </div>
    )
  }

  if (!isOnboarded) {
    return <Onboarding onComplete={fetchUser} />
  }

  if (editingIcp) {
    return (
      <div className="min-h-full flex flex-col">
        <div className="max-w-5xl mx-auto px-6 py-4 w-full">
          <button
            onClick={() => setEditingIcp(false)}
            className="text-xs text-ink-4 hover:text-ink mb-4"
          >
            ← Back to app
          </button>
        </div>
        <Onboarding
          onComplete={() => { fetchUser(); setEditingIcp(false) }}
          initialTitles={user.icp_config.titles}
          initialExcludes={user.icp_config.exclude}
        />
      </div>
    )
  }

  return (
    <>
      <Nav
        icpTitles={user.icp_config.titles}
        userName={user.name ?? undefined}
        email={user.email ?? undefined}
        outboundBadge={badges.outbound}
        inboundBadge={badges.inbound}
        onEditIcp={() => setEditingIcp(true)}
      />
      <main id="main-content" className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </>
  )
}
