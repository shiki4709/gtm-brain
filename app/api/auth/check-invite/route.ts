import { NextResponse } from 'next/server'

// Invite-only signup gate
// Set INVITED_EMAILS in Vercel env as comma-separated list: "alice@example.com,bob@example.com"
// If not set, all signups are allowed (open mode)

export async function POST(request: Request) {
  const { email } = await request.json() as { email?: string }

  if (!email) {
    return NextResponse.json({ allowed: false })
  }

  const inviteList = process.env.INVITED_EMAILS ?? ''

  // If no invite list configured, allow all (open mode)
  if (!inviteList.trim()) {
    return NextResponse.json({ allowed: true })
  }

  const allowed = inviteList
    .split(',')
    .map(e => e.trim().toLowerCase())
    .includes(email.trim().toLowerCase())

  return NextResponse.json({ allowed })
}
