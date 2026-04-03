import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// Export leads as CSV in various CRM/tool formats

// Format definitions — each maps our lead fields to the tool's expected columns
const FORMATS: Record<string, {
  label: string
  headers: string[]
  mapRow: (l: Lead) => string[]
}> = {
  default: {
    label: 'GTM Brain (all fields)',
    headers: ['Name', 'Title', 'Company', 'LinkedIn URL', 'Comment', 'ICP Match', 'Status', 'DM Draft', 'DM Angle', 'DM Sent', 'Replied', 'Source', 'Created'],
    mapRow: (l) => [
      l.name ?? '', l.title ?? '', l.company ?? '', l.linkedin_url ?? '',
      (l.comment_text ?? '').substring(0, 200), l.icp_match ? 'Yes' : 'No',
      l.status ?? '', (l.dm_draft ?? '').substring(0, 200), l.dm_angle ?? '',
      l.dm_sent_at ? new Date(l.dm_sent_at).toLocaleDateString() : '',
      l.replied_at ? new Date(l.replied_at).toLocaleDateString() : '',
      l.source_type ?? '', new Date(l.created_at).toLocaleDateString(),
    ],
  },
  dripify: {
    label: 'Dripify',
    headers: ['LinkedIn Profile URL', 'First Name', 'Last Name', 'Job Title', 'Company', 'Message'],
    mapRow: (l) => {
      const names = (l.name ?? '').split(' ')
      const firstName = names[0] ?? ''
      const lastName = names.slice(1).join(' ') ?? ''
      return [l.linkedin_url ?? '', firstName, lastName, l.title ?? '', l.company ?? '', l.dm_draft ?? '']
    },
  },
  salesnav: {
    label: 'LinkedIn Sales Navigator',
    headers: ['First Name', 'Last Name', 'Title', 'Company', 'LinkedIn URL'],
    mapRow: (l) => {
      const names = (l.name ?? '').split(' ')
      return [names[0] ?? '', names.slice(1).join(' ') ?? '', l.title ?? '', l.company ?? '', l.linkedin_url ?? '']
    },
  },
  hubspot: {
    label: 'HubSpot',
    headers: ['First Name', 'Last Name', 'Job Title', 'Company Name', 'LinkedIn Company Page', 'Lead Status', 'Notes'],
    mapRow: (l) => {
      const names = (l.name ?? '').split(' ')
      return [names[0] ?? '', names.slice(1).join(' ') ?? '', l.title ?? '', l.company ?? '', l.linkedin_url ?? '', l.status === 'dm_sent' ? 'CONTACTED' : l.status === 'replied' ? 'CONNECTED' : 'NEW', l.comment_text ?? '']
    },
  },
  apollo: {
    label: 'Apollo.io',
    headers: ['First Name', 'Last Name', 'Title', 'Organization Name', 'LinkedIn Url', 'Tags'],
    mapRow: (l) => {
      const names = (l.name ?? '').split(' ')
      return [names[0] ?? '', names.slice(1).join(' ') ?? '', l.title ?? '', l.company ?? '', l.linkedin_url ?? '', l.icp_match ? 'ICP' : '']
    },
  },
  outreach: {
    label: 'Outreach.io',
    headers: ['First Name', 'Last Name', 'Title', 'Company', 'LinkedIn', 'Custom1'],
    mapRow: (l) => {
      const names = (l.name ?? '').split(' ')
      return [names[0] ?? '', names.slice(1).join(' ') ?? '', l.title ?? '', l.company ?? '', l.linkedin_url ?? '', l.dm_draft ?? '']
    },
  },
  instantly: {
    label: 'Instantly.ai',
    headers: ['first_name', 'last_name', 'company_name', 'personalization', 'website'],
    mapRow: (l) => {
      const names = (l.name ?? '').split(' ')
      return [names[0] ?? '', names.slice(1).join(' ') ?? '', l.company ?? '', l.comment_text ?? '', l.linkedin_url ?? '']
    },
  },
}

interface Lead {
  name: string | null
  title: string | null
  company: string | null
  linkedin_url: string | null
  comment_text: string | null
  icp_match: boolean
  status: string
  dm_draft: string | null
  dm_angle: string | null
  dm_sent_at: string | null
  replied_at: string | null
  source_type: string
  created_at: string
}

export async function GET(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const formatKey = searchParams.get('format') ?? 'default'
  const icpOnly = searchParams.get('icp') === '1'

  // Return available formats if requested
  if (formatKey === 'list') {
    return NextResponse.json({
      success: true,
      formats: Object.entries(FORMATS).map(([key, f]) => ({ key, label: f.label })),
    })
  }

  const format = FORMATS[formatKey] ?? FORMATS.default

  let query = auth.sb
    .from('sb_leads')
    .select('name, title, company, linkedin_url, comment_text, icp_match, status, dm_draft, dm_angle, dm_sent_at, replied_at, source_type, created_at')
    .eq('user_id', auth.dbUser.id)
    .order('created_at', { ascending: false })

  if (icpOnly) {
    query = query.eq('icp_match', true)
  }

  const { data: leads } = await query

  if (!leads || leads.length === 0) {
    return new Response('No leads to export', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  const rows = (leads as Lead[]).map(l => format.mapRow(l).map(escapeCsv))
  const csv = [format.headers.join(','), ...rows.map(r => r.join(','))].join('\n')

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="gtm-brain-${formatKey}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}
