import { NextResponse } from 'next/server'

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'syval-admin-2026'

export async function POST(request: Request) {
  const body = await request.json()
  const { email, password, secret } = body as { email: string; password: string; secret: string }

  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Invalid admin secret' }, { status: 403 })
  }

  if (!email || !password || password.length < 6) {
    return NextResponse.json({ error: 'Email and password (6+ chars) required' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  })

  const data = await resp.json()

  if (!resp.ok) {
    return NextResponse.json({ error: data.msg ?? data.message ?? 'Failed to create user' }, { status: resp.status })
  }

  return NextResponse.json({ success: true, email: data.email, id: data.id })
}
