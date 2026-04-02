import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Export leads as CSV for CRM import / spreadsheet

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data: leads } = await auth.sb
    .from('sb_leads')
    .select('name, title, company, linkedin_url, comment_text, icp_match, status, dm_draft, dm_angle, dm_sent_at, replied_at, source_type, created_at')
    .eq('user_id', auth.dbUser.id)
    .order('created_at', { ascending: false })

  if (!leads || leads.length === 0) {
    return new Response('No leads to export', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  // Build CSV
  const headers = ['Name', 'Title', 'Company', 'LinkedIn URL', 'Comment', 'ICP Match', 'Status', 'DM Draft', 'DM Angle', 'DM Sent', 'Replied', 'Source', 'Created']
  const rows = leads.map(l => [
    escapeCsv(l.name ?? ''),
    escapeCsv(l.title ?? ''),
    escapeCsv(l.company ?? ''),
    l.linkedin_url ?? '',
    escapeCsv((l.comment_text ?? '').substring(0, 200)),
    l.icp_match ? 'Yes' : 'No',
    l.status ?? '',
    escapeCsv((l.dm_draft ?? '').substring(0, 200)),
    l.dm_angle ?? '',
    l.dm_sent_at ? new Date(l.dm_sent_at).toLocaleDateString() : '',
    l.replied_at ? new Date(l.replied_at).toLocaleDateString() : '',
    l.source_type ?? '',
    new Date(l.created_at).toLocaleDateString(),
  ])

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="gtm-brain-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}
