import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Slack Interactive Events — handles button clicks from notification messages
// Configure in Slack App: Interactivity → Request URL → https://gtm-brain-roan.vercel.app/api/slack/events

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''

  // Slack sends url_verification as JSON
  if (contentType.includes('application/json')) {
    const body = await request.json()
    // URL verification challenge
    if (body.type === 'url_verification') {
      return NextResponse.json({ challenge: body.challenge })
    }
    return NextResponse.json({ ok: true })
  }

  // Slack sends interactive payloads as form-encoded
  const formData = await request.formData()
  const payloadStr = formData.get('payload') as string | null
  if (!payloadStr) return NextResponse.json({ ok: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any
  try {
    payload = JSON.parse(payloadStr)
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Handle block_actions (button clicks)
  if (payload.type === 'block_actions') {
    const action = payload.actions?.[0]
    if (!action) return NextResponse.json({ ok: true })

    const actionId = action.action_id as string // 'act' | 'skip'
    const userId = payload.user?.id as string | undefined
    const channelId = payload.channel?.id as string | undefined

    if (!actionId || !channelId) return NextResponse.json({ ok: true })

    const sb = createServiceClient()

    // Find GTM Brain user by slack webhook (channel match via message blocks)
    // Extract post URL from the message blocks
    const messageText = payload.message?.blocks?.[0]?.text?.text ?? ''
    const urlMatch = messageText.match(/https:\/\/[^\s"]+/)
    const postUrl = urlMatch?.[0] ?? ''

    if (!postUrl) return NextResponse.json({ ok: true })

    // Find the notification by post URL
    const { data: notif } = await sb
      .from('sb_notifications')
      .select('id, user_id, action_type, draft_text, post_url')
      .eq('channel', 'slack')
      .like('post_url', `%${postUrl.substring(0, 60)}%`)
      .eq('status', 'pushed')
      .order('pushed_at', { ascending: false })
      .limit(1)
      .single()

    if (notif) {
      const status = actionId === 'act' ? 'acted' : 'skipped'

      await sb
        .from('sb_notifications')
        .update({ status, acted_at: new Date().toISOString() })
        .eq('id', notif.id)

      // Log action for learning model
      await sb.from('action_log').insert({
        user_id: notif.user_id,
        action_type: status === 'acted' ? notif.action_type : 'notification_skip',
        post_id: notif.post_url,
        platform: notif.post_url.includes('linkedin') ? 'linkedin' : 'x',
        metadata: { source: 'slack', notification_id: notif.id, slack_user: userId },
      })

      // Update the Slack message to show the action taken
      if (payload.response_url) {
        const statusEmoji = status === 'acted' ? '✅' : '⏭'
        const statusText = status === 'acted' ? 'Done' : 'Skipped'

        await fetch(payload.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace_original: false,
            text: `${statusEmoji} ${statusText}${status === 'acted' && notif.draft_text ? `\n\nDraft reply:\n${notif.draft_text}` : ''}`,
          }),
        }).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}
