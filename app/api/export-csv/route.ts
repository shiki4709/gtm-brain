import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = auth.dbUser
  const sb = auth.sb

  const { data: leads } = await sb
    .from('sb_leads')
    .select('name, title, company, linkedin_url')
    .eq('user_id', user.id)
    .eq('icp_match', true)
    .order('created_at', { ascending: false })

  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: 'No ICP leads to export' }, { status: 404 })
  }

  const headers = ['First Name', 'Last Name', 'Title', 'Company', 'LinkedIn URL']
  const rows = [headers.join(',')]

  for (const l of leads) {
    const parts = (l.name ?? '').trim().split(/\s+/)
    const firstName = parts[0] ?? ''
    const lastName = parts.slice(1).join(' ')
    rows.push([
      `"${firstName.replace(/"/g, '""')}"`,
      `"${lastName.replace(/"/g, '""')}"`,
      `"${(l.title ?? '').replace(/"/g, '""')}"`,
      `"${(l.company ?? '').replace(/"/g, '""')}"`,
      `"${(l.linkedin_url ?? '').replace(/"/g, '""')}"`,
    ].join(','))
  }

  const csv = rows.join('\n')
  const date = new Date().toISOString().slice(0, 10)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sales-nav-import-${date}.csv"`,
    },
  })
}
