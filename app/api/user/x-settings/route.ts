import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function POST(request: Request) {
  const body = await request.json()
  const { x_accounts, x_topics } = body as { x_accounts: string[]; x_topics: string[] }

  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await auth.sb
    .from('sb_users')
    .update({
      x_accounts: (x_accounts ?? []).map((a: string) => a.trim().replace(/^@/, '')).filter(Boolean),
      x_topics: (x_topics ?? []).map((t: string) => t.trim()).filter(Boolean),
    })
    .eq('id', auth.dbUser.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
